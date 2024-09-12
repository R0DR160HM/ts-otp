export abstract class Option<T> {

    public static None = class extends Option<any> {}
    public static Some = class<T> extends Option<T> {
        constructor(public readonly value: T) {
            super();
        }
    }

}