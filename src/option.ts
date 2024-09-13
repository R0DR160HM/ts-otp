export abstract class Option<T> {

    public static None = class extends Option<any> { }
    public static Some = class <T> extends Option<T> {
        constructor(public readonly value: T) {
            super();
        }
    }

    public static from<T>(value: T | null | undefined): Option<T> {
        return value === null || value === undefined
            ? new Option.None()
            : new Option.Some(value);
    }

}