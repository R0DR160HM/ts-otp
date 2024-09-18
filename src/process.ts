const WORKER_SCRIPT = `
    onmessage = function(msg) {
        const data = msg.data;
        const args = data.args;
        const command = data.command;
        
        self.job = args[0];
        
        switch (command) {
            case "run":
                const func = new Function("return " + self.job.operation)();
                func(self.job.args)
                    .then(function (value) {
                        self.postMessage({ status: "ok", value });
                    })
                    .catch(function (error) {
                        self.postMessage({ status: "error", error });
                    });
                break;

            case "kill":
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

const workerPool = new Array<Worker>();
const alocatedThreads = new Map<Pid, Worker>();

// abstract class CallError {
//     public static CalleeDown = class extends CallError {
//         constructor(public readonly reason: unknown) {
//             super();
//         }
//     }
//     public static CallTimeout = class extends CallError { }
// }

// abstract class Cancelled {
//     public static TimerNotFound = class extends Cancelled { }
//     public static Cancelled = class extends Cancelled {
//         constructor(public readonly timeRemaining: number) {
//             super();
//         }
//     }
// }

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

function start<T, K>(implementation: (that: K) => Promise<T>, context: K): Pid {
    if (!window?.URL?.createObjectURL || !window?.Worker?.prototype?.postMessage) {
        implementation(context);
        return new Pid();
    }
    try {
        return _start(implementation, context);
    } catch (err) {
        implementation(context);
        return new Pid();
    }
}

/**
 * @todo implement link
 */
function _start<T, K>(implementation: (that: K) => Promise<T>, context: K, /* link: boolean */): Pid {
    let blobURL: string;
    let worker = workerPool.shift()!;
    if (!worker) {
        blobURL = URL.createObjectURL(new Blob([WORKER_SCRIPT], { type: 'application/javascript' }));
        worker = new Worker(blobURL);
    }

    const pid = new Pid();

    worker.addEventListener('error', () => {
        alocatedThreads.delete(pid);
        const index = workerPool.indexOf(worker);
        if (index >= 0) {
            workerPool.splice(index, 1);
        }
        worker.terminate();
        if (blobURL) {
            URL.revokeObjectURL(blobURL);
        }
    });

    alocatedThreads.set(pid, worker);

    worker.postMessage({
        command: 'run',
        args: [{
            args: context,
            operation: implementation.toString()
        }]
    });

    return pid;
}

function kill(pid: Pid): void {
    const worker = alocatedThreads.get(pid);
    if (worker) {
        worker.addEventListener('message', ev => {
            if (ev.data?.status === 'done') {
                alocatedThreads.delete(pid);
                if (!workerPool.includes(worker)) {
                    workerPool.push(worker);
                }
            }
        });
        worker.postMessage({ command: 'kill' });
    }
}


export const process = {
    // CallError,
    // Cancelled,
    // ExitReason,
    // ExitMessage,
    Pid,
    // ProcessDown,

    start,
    kill
};