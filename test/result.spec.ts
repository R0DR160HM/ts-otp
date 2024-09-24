import { describe, expect, it } from "@jest/globals";
import { Result } from "../src/result";

describe(Result.name, () => {

    it(`${Result.Ok.name} should store a value`, () => {
        const value = 42;
        const ok = new Result.Ok(value) as any;
        expect(ok.value).toBe(value);
        expect(ok).toBeInstanceOf(Result)
        expect(ok.detail).toBeUndefined();
    });

    it(`${Result.Error.name} should store a detail`, () => {
        const detail = 'error';
        const error = new Result.Error(detail) as any;
        expect(error.detail).toBe(detail);
        expect(error).toBeInstanceOf(Result)
        expect(error.value).toBeUndefined();
    });


    describe(Result.from.name, () => {

        it('should return an Ok instance if the operation is successful', () => {
            const value = 42;
            const result = Result.from(() => value) as any;
            expect(result).toBeInstanceOf(Result.Ok);
            expect(result.value).toBe(value);
        });

        it('should return an Error instance if the operation throws an error', () => {
            const detail = 'error';
            const result = Result.from(() => { throw detail }) as any;
            expect(result).toBeInstanceOf(Result.Error);
            expect(result.detail).toBe(detail);
        });
    });

    describe(Result.prototype.unwrap.name, () => {

        it('should return the value if it is an instance of Ok', () => {
            const ok = new Result.Ok('foo');
            expect(ok.unwrap('bar')).toEqual('foo');
        });

        it('should return the defaultValue if it is an insance of Error', () => {
            const error = new Result.Error('foo');
            expect(error.unwrap('bar')).toEqual('bar');
        });

    });

});