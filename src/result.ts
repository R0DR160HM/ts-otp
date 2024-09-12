export abstract class Result<T, K> {

    public static  Ok = class<T> extends Result<T, never> {
        constructor(public readonly value: T) {
            super();
        }
    }
    public static Error = class<K> extends Result<never, K> {
        constructor(public readonly detail: K) {
            super();
        }
    }

}
