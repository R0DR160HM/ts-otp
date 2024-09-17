import { Result } from "./result";

const sleepingWorkers = new Array<Worker>();

const WORKER_SCRIPT = `
    onmessage = function(msg) {
        const data = msg.data;
        const args = data.args;
        const command = data.command;
        
        self.job = args[0];
        
        if (command !== "run") {
            self.postMessage({
                status: "error",
                error: {
                    message: "Invalid command!"
                }
            });
        }

        const func = new Function("return " + self.job.operation)();
        func(self.job.args)
            .then(function (value) {
                self.postMessage({ status: "ok", value })
            })
            .catch(function (error) {
                self.postMessage({ status: "error", error })
            });
    }
`;

abstract class AwaitError {

    public static Timeout = class extends AwaitError { }
    public static Exit = class extends AwaitError {
        constructor(public readonly reason: unknown) {
            super();
        }
    }

}

function async<T, K extends object>(callback: (args: K) => Promise<T>, context: K = {} as any): Promise<T> {
    if (!window?.URL?.createObjectURL || !window?.Worker?.prototype?.postMessage) {
        return callback(context);
    }
    try {
        return asyncRaw(callback, context);
    } catch (err) {
        return callback(context)
    }
}

function asyncRaw<T, K extends object>(callback: (args: K) => Promise<T>, context: K): Promise<T> {
    let blobURL: string;
    if (!sleepingWorkers.length) {
        blobURL = URL.createObjectURL(new Blob(
            [WORKER_SCRIPT],
            { type: 'application/javascript' }
        ));
        sleepingWorkers.push(new Worker(blobURL));
    }
    const worker = sleepingWorkers.shift()!;

    return new Promise((resolve, reject) => {
        worker.addEventListener('error', err => {
            reject(err);
            worker.terminate();
            if (blobURL) {
                URL.revokeObjectURL(blobURL);
            }
        });
        worker.addEventListener('message', ev => {
            if (!sleepingWorkers.includes(worker)) {
                sleepingWorkers.push(worker);
            }
            if (ev.data.status === 'ok') {
                resolve(ev.data.value);
            } else {
                reject(ev.data.error);
            }
        });

        worker.postMessage({
            command: 'run',
            args: [{
                args: context,
                operation: callback.toString()
            }]
        });
    })
}

function awaitWithTimeout<T>(task: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
        setTimeout(reject, timeout);
        task
            .then(resolve)
            .catch(reject);
    });
}

/**
 * @deprecated
 * This function only exists to make the library fully compatible with Gleam's implementation.
 * You don't need to use this, just use JavaScript's aync/awawit syntax.
 */
function awaitForever<T>(task: Promise<T>): Promise<T> {
    return task;
}

function tryAwait<T>(task: Promise<T>, timeout: number): Promise<Result<T, AwaitError>> {
    return new Promise(resolve => {
        setTimeout(() => {
            const timeoutError = new Result.Error(new AwaitError.Timeout());
            resolve(timeoutError);
        }, timeout);

        task
            .then(val => resolve(new Result.Ok(val)))
            .catch(err => resolve(new Result.Error(new AwaitError.Exit(err))))
    });
}

function tryAwaitForever<T>(task: Promise<T>): Promise<Result<T, AwaitError>> {
    return new Promise(resolve => {
        task
            .then(val => resolve(new Result.Ok(val)))
            .catch(err => resolve(new Result.Error(new AwaitError.Exit(err))))
    });
}

export const task = {
    AwaitError,
    async,
    await: awaitWithTimeout,
    awaitForever,
    tryAwait,
    tryAwaitForever
};