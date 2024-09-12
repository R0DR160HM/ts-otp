import { Option } from "./option";
import { Result } from "./result";

export class SynchronousPromise<T, K> extends Promise<T> {

    private __otpValue?: T;
    private __otpError?: K

    constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
        super(executor);
        
        this.catch((error) => {
            this.__otpError = error;
            throw error;
        });

        this.then(value => {
            this.__otpValue = value;
            return value;
        });
    }

    public extractValue(fallback?: T): Result<Option<T>, K> {
        if (this.__otpError) {
            return new Result.Error(this.__otpError);
        }
        if (this.__otpValue) {
            return new Result.Ok(new Option.Some(this.__otpValue));
        }
        if (fallback) {
            return new Result.Ok(new Option.Some(fallback));
        }
        return new Result.Ok(Option.None);
    }

}