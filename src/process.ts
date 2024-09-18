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

const subjectPool = new Array<Worker>();
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
    let subject = subjectPool.shift()!;
    if (!subject) {
        blobURL = URL.createObjectURL(new Blob([WORKER_SCRIPT], { type: 'application/javascript' }));
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
        command: 'run',
        args: [{
            args: context,
            operation: implementation.toString()
        }]
    });

    return pid;
}

function kill(pid: Pid): void {
    const subject = alocatedThreads.get(pid);
    if (subject) {
        subject.onmessage = ev => {
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