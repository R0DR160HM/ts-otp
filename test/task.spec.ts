import { describe, expect, test } from '@jest/globals';
import { task } from '../src/task';

describe('task', () => {

    describe(task.async.name, () => {

        test('should return a promise', () => {
            const result = task.async(() => Promise.resolve());
            expect(result).toBeInstanceOf(Promise);
        });

        test('should return a promise with a value', async () => {
            const result = await task.async(() => Promise.resolve(42));
            expect(result).toBe(42);
        });

    });

})
