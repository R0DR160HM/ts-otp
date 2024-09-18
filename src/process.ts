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
                func(self.job.args)
                    .then(function (value) {
                        self.postMessage({ status: "ok", value });
                    })
                    .catch(function (error) {
                        self.postMessage({ status: "error", error });
                    });
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

const subjectPool = new Array<Worker>();
const alocatedThreads = new Map<Pid, Worker>();
const nameRegistry = new Map<string, Pid>();
const activeTimers = new Array<Timer>();

/**
 * To make the library compatible with Node
 */
class FakeWorker<T, K> {
    private listeners: any[] = [];

    constructor(private implementation: (that: T) => Promise<K>) {}

    public addEventListener(_event: 'message', listener: any) {
        this.listeners.push(listener);
    }

    public postMessage(message: { command: 'run'; args: { args: T }[] }) {
        this.implementation(message.args[0].args)
            .then((value) => {
                for (const listener of this.listeners) {
                    listener({ data: { status: 'ok', value } });
                }
            })
            .catch((error) => {
                for (const listener of this.listeners) {
                    listener({ data: { status: 'error', error } });
                }
            });
    }
}

abstract class CallError {
    public static CalleeDown = class extends CallError {
        constructor(public readonly reason: unknown) {
            super();
        }
    };
    public static CallTimeout = class extends CallError {};
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
    public static TimerNotFound = class extends Cancelled {};
    public static Cancelled = class extends Cancelled {
        constructor(public readonly timeRemaining: number) {
            super();
        }
    };
}

// abstract class ExitReason {
//     public static Normal = class extends ExitReason { }
//     public static Killed = class extends ExitReason { }
//     public static Abnormal = class extends ExitReason {
//         constructor(public readonly reason: string) {
//             super();
//         }
//     }
// }

class Pid {
    private static lastId = 0;
    public readonly id: number;
    constructor() {
        this.id = ++Pid.lastId;
    }
    public get subject(): Worker | null {
        return alocatedThreads.get(this) || null;
    }
}

// class ExitMessage {
//     constructor(
//         public readonly pid: Pid,
//         public readonly reason: ExitReason
//     ) { }
// }

// class ProcessDown {
//     constructor(
//         public readonly pid: Pid,
//         public readonly reason: unknown
//     ) { }
// }

function start<T, K>(implementation: (that: K) => Promise<T>): Pid {
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

function _fakeStart<T, K>(implementation: (that: K) => Promise<T>): Pid {
    const pid = new Pid();
    const worker = new FakeWorker(implementation);
    alocatedThreads.set(pid, worker as any);
    return pid;
}

/**
 * @todo implement link
 */
function _start<T, K>(
    implementation: (that: K) => Promise<T>
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
        alocatedThreads.delete(pid);
        const index = subjectPool.indexOf(subject);
        if (index >= 0) {
            subjectPool.splice(index, 1);
        }
        subject.terminate();
        if (blobURL) {
            URL.revokeObjectURL(blobURL);
        }
    });

    alocatedThreads.set(pid, subject);

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
    const subject = alocatedThreads.get(pid);
    if (subject) {
        subject.onmessage = (ev) => {
            if (ev.data?.status === 'done') {
                alocatedThreads.delete(pid);
                if (!subjectPool.includes(subject)) {
                    subjectPool.push(subject);
                }
                subject.onmessage = null;
            }
        };
        subject.postMessage({ command: 'kill' });
    }
}

function register(pid: Pid, name: string): Result<null, null> {
    if (!alocatedThreads.has(pid)) {
        return new Result.Error(null);
    }
    if (nameRegistry.has(name)) {
        return new Result.Error(null);
    }
    for (const registeredPid of nameRegistry.values()) {
        if (registeredPid === pid) {
            return new Result.Error(null);
        }
    }
    if (!name || name === 'undefined') {
        return new Result.Error(null);
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

function named(name: string): Result<Pid, null> {
    const pid = nameRegistry.get(name);
    if (pid) {
        return new Result.Error(null);
    }
    return new Result.Ok(pid);
}

function isAlive(a: Pid): boolean {
    return alocatedThreads.has(a);
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
        subject.postMessage({
            command: 'run',
            args: [
                {
                    args: message
                }
            ]
        });
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

/**
 * Intentionally diverges from specification,
 * it will likely change in the future
 */
function call<T, K>(
    subject: Worker,
    makeRequest: T,
    timeout: number
): Promise<K> {
    return new Promise((resolve, reject) => {
        subject.addEventListener('message', (ev) => {
            if (ev.data.status === 'ok') {
                resolve(ev.data.value);
            } else if (ev.data.status === 'error') {
                reject(ev.data.error);
            }
        });

        send(subject, makeRequest);

        setTimeout(() => {
            throw new Error('Process crashed!');
        }, timeout);
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

        setTimeout(() => {
            resolve(new Result.Error(new CallError.CallTimeout()));
        }, timeout);
    });
}

export const process = {
    CallError,
    Timer,
    Cancelled,
    // ExitReason,
    // ExitMessage,
    Pid,
    // ProcessDown,

    start,
    kill,
    register,
    unregister,
    named,
    isAlive,
    send,
    sendAfter,
    cancelTimer,
    call,
    tryCall
};
