import { Result } from './result';
import { process } from './process';

abstract class AwaitError {
    public static Timeout = class extends AwaitError {};
    public static Exit = class extends AwaitError {
        constructor(public readonly reason: unknown) {
            super();
        }
    };
}

function async<T, K>(
    callback: (args: K) => T | Promise<T>,
    context: K
): Promise<T> {
    const pid = process.start(callback);

    return process.call<K, T>(pid.subject!, context, Infinity).finally(() => {
        process.kill(pid);
    });
}

function awaitWithTimeout<T>(task: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
        setTimeout(reject, timeout);
        task.then(resolve).catch(reject);
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

function tryAwait<T>(
    task: Promise<T>,
    timeout: number
): Promise<Result<T, AwaitError>> {
    return new Promise((resolve) => {
        setTimeout(() => {
            const timeoutError = new Result.Error(new AwaitError.Timeout());
            resolve(timeoutError);
        }, timeout);

        task.then((val) => resolve(new Result.Ok(val))).catch((err) =>
            resolve(new Result.Error(new AwaitError.Exit(err)))
        );
    });
}

function tryAwaitForever<T>(task: Promise<T>): Promise<Result<T, AwaitError>> {
    return new Promise((resolve) => {
        task.then((val) => resolve(new Result.Ok(val))).catch((err) =>
            resolve(new Result.Error(new AwaitError.Exit(err)))
        );
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
