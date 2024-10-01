import { Option } from './option';
import { Result } from './result';

const WORKER_SCRIPT = `
    var Θ__otp_pid;
    var func;
    var state;

    onmessage = function(msg) {
        const data = msg.data;
        const args = data.args;
        const command = data.command;
        
        self.job = args[0];

        function kill() {
            Θ__otp_pid = null;
            func = null;
            state = null;
            self.postMessage({ status: 'done' })
            return;
        }
        
        switch (command) {
            case "setup":
                Θ__otp_pid = self.job.args;
                func = new Function("return " + self.job.operation)();
                state = {};
                break;

            case "run":
                try {
                    const context = { args: self.job.args, kill };
                    const response = func(context);
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
                kill();
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

interface IProcessContext<T> {
    args: T,
    kill: () => void;
}

/**
 * A pool containing "dead" (iddle) Workers, so that the start() function can grab one of them
 * instead of creating a new one, and thus avoiding the overhead of creating a new worker at
 * the start of every Process and terminating it at the end.
 */
const subjectPool = new Array<Worker>();

/**
 * A relational map with all the currently active Pids and their respective Processes.
 */
const activeProcesses = new Map<process.Pid<unknown, unknown>, Worker>();

/**
 * Named Pids so that they can be more easily accessible from anywhere
 */
const nameRegistry = new Map<string, process.Pid<unknown, unknown>>();

/**
 * The name is self-explanatory
 */
const activeTimers = new Array<process.Timer>();

/**
 * Guess what
 */
const activeMonitors = new Array<process.ProcessMonitor>();

/**
 * To make the library compatible with Node
 */
class FakeWorker<I, O> {
    private listeners: any[] = [];

    private dead = false;

    constructor(private implementation: (context: IProcessContext<I>) => O | Promise<O>) { }

    public addEventListener(_event: 'message', listener: any) {
        if (this.dead) {
            return;
        }
        this.listeners.push(listener);
    }

    private emit(data: any) {
        if (this.dead) {
            return;
        }
        for (const listener of this.listeners) {
            listener({ data });
        }
    }

    public postMessage(message: { command: string; args: { args: I }[] }) {
        if (message.command === 'run') {
            try {
                const args = typeof message?.args[0]?.args === 'object'
                    ? { ...message.args[0].args }
                    : message?.args[0]?.args;
                const context: IProcessContext<I> = { args, kill: () => this.dead = true };
                const response = this.implementation(context);
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

export namespace process {

    export abstract class CallError {
        public static CalleeDown = class extends CallError {
            constructor(public readonly reason: unknown) {
                super();
            }
        };
        public static CallTimeout = class extends CallError { };
    }

    export class Timer {
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

    export abstract class Cancelled {
        public static TimerNotFound = class extends Cancelled { };
        public static Cancelled = class extends Cancelled {
            constructor(public readonly timeRemaining: number) {
                super();
            }
        };
    }

    export abstract class ExitReason {
        public static Normal = class extends ExitReason { }
        public static Killed = class extends ExitReason { }
        public static Abnormal = class extends ExitReason {
            constructor(public readonly reason: string) {
                super();
            }
        }
    }

    export class Subject<I, O> extends Worker { };

    export class Pid<I, O> {
        private static lastId = 0;
        public readonly id: number;
        constructor() {
            this.id = ++Pid.lastId;
        }
        public get subject(): Subject<I, O> | null {
            return activeProcesses.get(this) || null;
        }
    }

    export abstract class NotRegistrable {
        public static InactiveProcess = class extends NotRegistrable {
            constructor(public readonly pid: Pid<unknown, unknown>) {
                super();
            }
        }
        public static NameAlreadyTaken = class extends NotRegistrable {
            constructor(public readonly name: string) {
                super();
            }
        }
        public static ProcessAlreadyRegistered = class extends NotRegistrable {
            constructor(public readonly pid: Pid<unknown, unknown>) {
                super();
            }
        }
        public static InvalidName = class extends NotRegistrable {
            constructor(public readonly name: string) {
                super();
            }
        }
    }

    export class Selector<T> {

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

    export class ProcessDown {
        constructor(
            public readonly pid: Pid<unknown, unknown>,
            public readonly reason: ExitReason
        ) { }
    }

    export class ProcessMonitor extends Promise<ProcessDown> { }

    export function start<I, O>(implementation: (context: IProcessContext<I>) => O | Promise<O>): Pid<I, O> {
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

    function _fakeStart<I, O>(implementation: (context: IProcessContext<I>) => O | Promise<O>): Pid<any, any> {
        const pid = new Pid();
        const worker = new FakeWorker(implementation);
        activeProcesses.set(pid, worker as any);
        return pid;
    }

    /**
     * @todo implement link
     */
    function _start<I, O>(
        implementation: (context: IProcessContext<I>) => O | Promise<O>
        /* link: boolean */
    ): Pid<I, O> {
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

    export function kill(pid: Pid<any, any>): void {
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

    export function register(pid: Pid<any, any>, name: string): Result<null, NotRegistrable> {
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

    export function unregister(name: string): Result<null, null> {
        if (nameRegistry.delete(name)) {
            return new Result.Ok(null);
        }
        return new Result.Error(null);
    }

    export function named(name: string): Option<Pid<unknown, unknown>> {
        const pid = nameRegistry.get(name);
        return Option.from(pid);
    }

    export function isAlive(a: Pid<any, any>): boolean {
        return activeProcesses.has(a);
    }

    export function send<T>(subject: Subject<T, any>, message: T): void {
        subject.postMessage({
            command: 'run',
            args: [
                {
                    args: message
                }
            ]
        });
    }

    export function sendAfter<T>(subject: Subject<T, any>, delay: number, message: T): Timer {
        return new Timer(delay, () => {
            send(subject, message);
        });
    }

    export function cancelTimer(timer: Timer) {
        const index = activeTimers.indexOf(timer);
        if (index >= 0) {
            activeTimers.splice(index, 1);
            const timePassed = new Date().getTime() - timer.createdAt;
            const timeRemaining = timer.time - timePassed;
            return new Cancelled.Cancelled(timeRemaining);
        }
        return new Cancelled.TimerNotFound();
    }

    export function receive<O>(from: Subject<any, O>, timeout: number): Promise<Result<O, unknown>> {
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
    export function call<I, O>(
        subject: Subject<I, O>,
        makeRequest: I,
        timeout: number
    ): Promise<Result<O, unknown>> {
        return new Promise((resolve, reject) => {
            subject.addEventListener('message', (ev) => {
                if (ev.data.status === 'ok') {
                    resolve(new Result.Ok(ev.data.value));
                } else if (ev.data.status === 'error') {
                    resolve(new Result.Error(ev.data.error));
                }
            });

            send(subject, makeRequest);

            if (timeout !== Infinity) {
                setTimeout(() => {
                    reject(new Error('Process timeout!'));
                }, timeout);
            }
        });
    }

    export function tryCall<I, O>(
        subject: Subject<I, O>,
        makeRequest: I,
        timeout: number
    ): Promise<Result<O, CallError>> {
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

    export function selecting<O, T>(selector: Selector<T>, subject: Subject<any, O>, transform: (message: Result<unknown, unknown>) => T): Selector<T> {
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

    export function selectingProcessDown<T>(selector: Selector<T>, monitor: ProcessMonitor, mapping: (pd: ProcessDown) => T): Selector<T> {
        monitor.then(value => {
            if (activeMonitors.includes(monitor)) {
                const mappedValue = mapping(value);
                selector.postMessage(mappedValue);
            }
        })
        return selector;
    }

    export function select<T>(from: Selector<T>, within: number): Promise<Result<T, null>> {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(new Result.Error(null))
            }, within);
            from['addListener'](message => {
                resolve(new Result.Ok(message));
            });
        })
    }

    export function selectForever<T>(from: Selector<T>): Promise<T> {
        return new Promise(resolve => from['addListener'](resolve));
    }

    export function monitorProcess(pid: Pid<any, any>): ProcessMonitor {
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

    export function demonitorProcess(monitor: ProcessMonitor): void {
        const index = activeMonitors.indexOf(monitor);
        if (index >= 0) {
            activeMonitors.splice(index, 1);
        }
    }

}