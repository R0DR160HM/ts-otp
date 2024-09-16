import { Result } from "./result";

const WORKER_SCRIPT = `
    const base = self;

    onmessage = function(msg) {
        const data = msg.data;
        const args = data.args;
        const command = data.command;
        
        base.job = args[0];
        
        if (command !== "run") {
            base.postMessage({
                status: "error",
                error: {
                    message: "Invalid command!"
                }
            });
        }

        const func = new Function("return " + base.job.doFunction)();
        func(base.job.args)
            .then(function (value) {
                base.postMessage({ status: "ok", value })
            })
            .catch(function (error) {
                base.postMessage({ status: "error", error })
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
    const blobURL = URL.createObjectURL(new Blob(
        [WORKER_SCRIPT],
        { type: 'application/javascript' }
    ));
    const worker = new Worker(blobURL);

    return new Promise((resolve, reject) => {
        worker.addEventListener('error', err => {
            reject(err);
            worker.terminate();
            URL.revokeObjectURL(blobURL);
        });
        worker.addEventListener('message', ev => {
            if (ev.data.status === 'ok') {
                resolve(ev.data.value);
            } else {
                reject(ev.data.error);
            }
            worker.terminate();
            URL.revokeObjectURL(blobURL);
        });

        worker.postMessage({
            command: 'run',
            args: [{
                args: context,
                doFunction: callback.toString()
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