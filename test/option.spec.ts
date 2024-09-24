import { describe, it, expect } from '@jest/globals'
import { Option } from "../src/option";

describe(Option.name, () => {

    it(`${Option.Some.name} should store a value`, () => {
        const value = 42;
        const some = new Option.Some(value);
        expect(some.value).toBe(value);
        expect(some).toBeInstanceOf(Option)
    });

    it(`${Option.None.name} should not store a value`, () => {
        const none = new Option.None() as any;
        expect(none['value']).toBeUndefined();
        expect(none).toBeInstanceOf(Option)
    });

    describe(Option.from.name, () => {

        it('should return a Some instance if a value is informed', () => {
            expect(Option.from(42)).toBeInstanceOf(Option.Some);
            expect(Option.from(0)).toBeInstanceOf(Option.Some);
            expect(Option.from('FOO')).toBeInstanceOf(Option.Some);
            expect(Option.from('')).toBeInstanceOf(Option.Some);
            expect(Option.from(true)).toBeInstanceOf(Option.Some);
            expect(Option.from(false)).toBeInstanceOf(Option.Some);
            expect(Option.from({})).toBeInstanceOf(Option.Some);
            expect(Option.from([])).toBeInstanceOf(Option.Some);
            expect(Option.from(() => { })).toBeInstanceOf(Option.Some);
        });

        it('should return a None instance if a null value is informed', () => {
            expect(Option.from(null)).toBeInstanceOf(Option.None);
            expect(Option.from(undefined)).toBeInstanceOf(Option.None);
        });

    });

    describe(Option.prototype.unwrap.name, () => {

        it('should return the value if it is an instance of Some', () => {
            const some = new Option.Some('foo');
            expect(some.unwrap('bar')).toEqual('foo');
        });

        it('should return the defaultValue if it is an instance of None', () => {
            const none = new Option.None();
            expect(none.unwrap('bar')).toEqual('bar');
        });

    })

});