import { Result } from './result';
import { process } from './process';

export namespace task {

    export abstract class AwaitError {
        public static Timeout = class extends AwaitError { };
        public static Exit = class extends AwaitError {
            constructor(public readonly reason: unknown) {
                super();
            }
        };
    }

    export async function async<I, O>(
        callback: (args: { args: I }) => O | Promise<O>,
        context: I
    ): Promise<O> {
        const pid = process.start<any, any>(callback);

        return new Promise((resolve, reject) => {
            process.tryCall(pid.subject!, context, Infinity)
                .then(resp => {
                    if (resp instanceof Result.Ok) {
                        resolve(resp.value);
                    } else if (resp instanceof Result.Error) {
                        reject(resp.detail)
                    }
                    process.kill(pid);
                })
        })
    }

    export function awaitWithTimeout<T>(task: Promise<T>, timeout: number): Promise<T> {
        return new Promise((resolve, reject) => {
            setTimeout(reject, timeout);
            task.then(resolve).catch(reject);
        });
    }

    export function tryAwait<T>(
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

    export function tryAwaitForever<T>(task: Promise<T>): Promise<Result<T, AwaitError>> {
        return new Promise((resolve) => {
            task.then((val) => resolve(new Result.Ok(val))).catch((err) =>
                resolve(new Result.Error(new AwaitError.Exit(err)))
            );
        });
    }

}