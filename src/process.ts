import { Option } from './option';
import { Result } from './result';

const WORKER_SCRIPT = `
    var Θ__otp_pid;
    var func;

    onmessage = function(msg) {
        const data = msg.data;
        const args = data.args;
        const command = data.command;
        
        self.job = args[0];
        
        switch (command) {
            case "setup":
                Θ__otp_pid = self.job.args;
                func = new Function("return " + self.job.operation)();
                break;

            case "run":
                try {
                    const response = func(self.job.args);
                    if (response instanceof Promise) {
                        response
                            .then(function (value) {
                                self.postMessage({ status: "ok", value });
                            })
                            .catch(function (error) {
                                self.postMessage({ status: "error", error });
                            });
                    } else if (response instanceof Error) {
                        self.postMessage({ status: "error", error: response });
                    } else {
                        self.postMessage({ status: "ok", value: response });
                    }
                } catch (error) {
                    self.postMessage({ status: "error", error });
                }
                break;

            case "kill":
                func = null;
                Θ__otp_pid = null;
                self.postMessage({ status: "done" });
                break;

            default:
                self.postMessage({
                    status: "error",
                    error: {
                        message: "Invalid command!"
                    }
                });
        }

    }
`;

/**
 * A pool containing "dead" (iddle) Workers, so that the start() function can grab one of them
 * instead of creating a new one, and thus avoiding the overhead of creating a new worker at
 * the start of every Process and terminating it at the end.
 */
const subjectPool = new Array<Worker>();

/**
 * A relational map with all the currently active Pids and their respective Processes.
 */
const activeProcesses = new Map<Pid, Worker>();

/**
 * Named Pids so that they can be more easily accessible from anywhere
 */
const nameRegistry = new Map<string, Pid>();

/**
 * The name is self-explanatory
 */
const activeTimers = new Array<Timer>();

/**
 * Guess what
 */
const activeMonitors = new Array<ProcessMonitor>();

/**
 * To make the library compatible with Node
 */
class FakeWorker<T, K> {
    private listeners: any[] = [];

    constructor(private implementation: (that: T) => K | Promise<K>) { }

    public addEventListener(_event: 'message', listener: any) {
        this.listeners.push(listener);
    }

    private emit(data: any) {
        for (const listener of this.listeners) {
            listener({ data });
        }
    }

    public postMessage(message: { command: string; args: { args: T }[] }) {
        if (message.command === 'run') {
            try {
                const response = this.implementation({ ...message?.args[0]?.args });
                if (response instanceof Promise) {
                    response
                        .then((value) => {
                            this.emit({ status: 'ok', value });
                        })
                        .catch((error) => {
                            this.emit({ status: 'error', error });
                        });
                } else if (response instanceof Error) {
                    this.emit({ status: 'error', error: response });
                } else {
                    this.emit({ status: 'ok', value: response });
                }
            } catch (error) {
                this.emit({ status: 'error', error });
            }
        }
    }
}

abstract class CallError {
    public static CalleeDown = class extends CallError {
        constructor(public readonly reason: unknown) {
            super();
        }
    };
    public static CallTimeout = class extends CallError { };
}

class Timer {
    public readonly createdAt = new Date().getTime();
    constructor(public readonly time: number, action: () => void) {
        activeTimers.push(this);
        setTimeout(() => {
            const index = activeTimers.indexOf(this);
            if (index >= 0) {
                action();
                activeTimers.splice(index, 1);
            }
        }, time);
    }
}

abstract class Cancelled {
    public static TimerNotFound = class extends Cancelled { };
    public static Cancelled = class extends Cancelled {
        constructor(public readonly timeRemaining: number) {
            super();
        }
    };
}

abstract class ExitReason {
    public static Normal = class extends ExitReason { }
    public static Killed = class extends ExitReason { }
    public static Abnormal = class extends ExitReason {
        constructor(public readonly reason: string) {
            super();
        }
    }
}

class Pid {
    private static lastId = 0;
    public readonly id: number;
    constructor() {
        this.id = ++Pid.lastId;
    }
    public get subject(): Worker | null {
        return activeProcesses.get(this) || null;
    }
}

abstract class NotRegistrable {
    public static InactiveProcess = class extends NotRegistrable {
        constructor(public readonly pid: Pid) {
            super();
        }
    }
    public static NameAlreadyTaken = class extends NotRegistrable {
        constructor(public readonly name: string) {
            super();
        }
    }
    public static ProcessAlreadyRegistered = class extends NotRegistrable {
        constructor(public readonly pid: Pid) {
            super();
        }
    }
    public static InvalidName = class extends NotRegistrable {
        constructor(public readonly name: string) {
            super();
        }
    }
}

class Selector<T> {

    private listeners: ((message: T) => void)[] = []

    public postMessage(message: T) {
        for (const listener of this.listeners) {
            listener(message);
        }
    }

    protected addListener(listener: (message: T) => void) {
        this.listeners.push(listener);
    }

}

// class ExitMessage {
//     constructor(
//         public readonly pid: Pid,
//         public readonly reason: ExitReason
//     ) { }
// }

class ProcessDown {
    constructor(
        public readonly pid: Pid,
        public readonly reason: ExitReason
    ) { }
}

class ProcessMonitor extends Promise<ProcessDown> { }

function start<T, K>(implementation: (that: K) => T | Promise<T>): Pid {
    if (
        !window?.URL?.createObjectURL ||
        !window?.Worker?.prototype?.postMessage
    ) {
        return _fakeStart(implementation);
    }
    try {
        return _start(implementation);
    } catch (err) {
        return _fakeStart(implementation);
    }
}

function _fakeStart<T, K>(implementation: (that: K) => T | Promise<T>): Pid {
    const pid = new Pid();
    const worker = new FakeWorker(implementation);
    activeProcesses.set(pid, worker as any);
    return pid;
}

/**
 * @todo implement link
 */
function _start<T, K>(
    implementation: (that: K) => T | Promise<T>
    /* link: boolean */
): Pid {
    let blobURL: string;
    let subject = subjectPool.shift()!;
    if (!subject) {
        blobURL = URL.createObjectURL(
            new Blob([WORKER_SCRIPT], { type: 'application/javascript' })
        );
        subject = new Worker(blobURL);
    }

    const pid = new Pid();

    subject.addEventListener('error', () => {
        activeProcesses.delete(pid);
        const index = subjectPool.indexOf(subject);
        if (index >= 0) {
            subjectPool.splice(index, 1);
        }
        subject.terminate();
        if (blobURL) {
            URL.revokeObjectURL(blobURL);
        }
    });

    activeProcesses.set(pid, subject);

    subject.postMessage({
        command: 'setup',
        args: [
            {
                args: pid.id,
                operation: implementation.toString()
            }
        ]
    });

    return pid;
}

function kill(pid: Pid): void {
    const subject = activeProcesses.get(pid);
    if (subject) {
        subject.onmessage = (ev) => {
            if (ev.data?.status === 'done') {
                activeProcesses.delete(pid);
                if (!subjectPool.includes(subject)) {
                    subjectPool.push(subject);
                }
                subject.onmessage = null;
            }
        };
        subject.postMessage({ command: 'kill', args: [{}] });
    }
}

function register(pid: Pid, name: string): Result<null, NotRegistrable> {
    if (!activeProcesses.has(pid)) {
        return new Result.Error(new NotRegistrable.InactiveProcess(pid));
    }
    if (nameRegistry.has(name)) {
        return new Result.Error(new NotRegistrable.NameAlreadyTaken(name));
    }
    for (const registeredPid of nameRegistry.values()) {
        if (registeredPid === pid) {
            return new Result.Error(new NotRegistrable.ProcessAlreadyRegistered(pid));
        }
    }
    if (!name || name === 'undefined') {
        return new Result.Error(new NotRegistrable.InvalidName(name));
    }
    nameRegistry.set(name, pid);
    return new Result.Ok(null);
}

function unregister(name: string): Result<null, null> {
    if (nameRegistry.delete(name)) {
        return new Result.Ok(null);
    }
    return new Result.Error(null);
}

function named(name: string): Option<Pid> {
    const pid = nameRegistry.get(name);
    return Option.from(pid);
}

function isAlive(a: Pid): boolean {
    return activeProcesses.has(a);
}

function send<T>(subject: Worker, message: T): void {
    subject.postMessage({
        command: 'run',
        args: [
            {
                args: message
            }
        ]
    });
}

function sendAfter<T>(subject: Worker, delay: number, message: T): Timer {
    return new Timer(delay, () => {
        send(subject, message);
    });
}

function cancelTimer(timer: Timer) {
    const index = activeTimers.indexOf(timer);
    if (index >= 0) {
        activeTimers.splice(index, 1);
        const timePassed = new Date().getTime() - timer.createdAt;
        const timeRemaining = timer.time - timePassed;
        return new Cancelled.Cancelled(timeRemaining);
    }
    return new Cancelled.TimerNotFound();
}

function receive<T>(from: Worker, timeout: number): Promise<Result<T, unknown>> {
    return new Promise((resolve, reject) => {

        from.addEventListener('message', message => {
            if (message.data.status === 'ok') {
                resolve(new Result.Ok(message.data.value));
            } else if (message.data.status === 'error') {
                resolve(new Result.Error(message.data.error));
            }
        });

        if (timeout !== Infinity) {
            setTimeout(() => reject(new Result.Error('timeout')), timeout);
        }
    });
}

/**
 * Intentionally diverges from specification,
 * it will likely change in the future
 */
function call<T, K>(
    subject: Worker,
    makeRequest: T,
    timeout: number
): Promise<Result<K, unknown>> {
    return new Promise((resolve, reject) => {
        let answered = false;
        subject.addEventListener('message', (ev) => {
            answered = true;
            if (ev.data.status === 'ok') {
                resolve(new Result.Ok(ev.data.value));
            } else if (ev.data.status === 'error') {
                resolve(new Result.Error(ev.data.error));
            }
        });

        send(subject, makeRequest);

        if (timeout !== Infinity) {
            setTimeout(() => {
                if (!answered) {
                    const err = new Error('Process crashed!');
                    reject(err);
                    throw err;
                }
            }, timeout);
        }
    });
}

function tryCall<T, K>(
    subject: Worker,
    makeRequest: T,
    timeout: number
): Promise<Result<K, CallError>> {
    return new Promise((resolve) => {
        subject.addEventListener('message', (ev) => {
            if (ev.data.status === 'ok') {
                resolve(new Result.Ok(ev.data.value));
            } else {
                resolve(new Result.Error(new CallError.CalleeDown(ev.data)));
            }
        });

        send(subject, makeRequest);

        if (timeout !== Infinity) {
            setTimeout(() => {
                resolve(new Result.Error(new CallError.CallTimeout()));
            }, timeout);
        }
    });
}

function selecting<T>(selector: Selector<T>, subject: Worker, transform: (message: Result<unknown, unknown>) => T): Selector<T> {
    subject.addEventListener('message', message => {
        if (message.data.status === 'ok') {
            const value = transform(new Result.Ok(message.data.value));
            selector.postMessage(value);
        } else if (message.data.status === 'error') {
            const value = transform(new Result.Error(message.data.detail));
            selector.postMessage(value);
        }
    });
    return selector;
}

function selectingProcessDown<T>(selector: Selector<T>, monitor: ProcessMonitor, mapping: (pd: ProcessDown) => T): Selector<T> {
    monitor.then(value => {
        if (activeMonitors.includes(monitor)) {
            const mappedValue = mapping(value);
            selector.postMessage(mappedValue);
        }
    })
    return selector;
}

function select<T>(from: Selector<T>, within: number): Promise<Result<T, null>> {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(new Result.Error(null))
        }, within);
        from['addListener'](message => {
            resolve(new Result.Ok(message));
        });
    })
}

function selectForever<T>(from: Selector<T>): Promise<T> {
    return new Promise(resolve => from['addListener'](resolve));
}

function monitorProcess(pid: Pid): ProcessMonitor {
    const monitor = new ProcessMonitor(resolve => {
        if (pid.subject) {
            pid.subject.addEventListener('message', message => {
                if (message.data.status === 'done') {
                    resolve(new ProcessDown(pid, new ExitReason.Killed()));
                }
            })
            pid.subject.addEventListener('error', (err) => {
                resolve(new ProcessDown(pid, new ExitReason.Abnormal(err?.toString())));
            })
        }
    });
    activeMonitors.push(monitor);
    return monitor;
}

function demonitorProcess(monitor: ProcessMonitor): void {
    const index = activeMonitors.indexOf(monitor);
    if (index >= 0) {
        activeMonitors.splice(index, 1);
    }
}

export const process = {
    CallError,
    Timer,
    Cancelled,
    ExitReason,
    // ExitMessage,
    Pid,
    ProcessDown,
    Selector,

    NotRegistrable,

    start,
    kill,
    isAlive,

    register,
    unregister,
    named,

    send,
    sendAfter,
    cancelTimer,
    receive,
    call,
    tryCall,

    select,
    selectForever,
    selecting,
    selectingProcessDown,
    monitorProcess,
    demonitorProcess
};
