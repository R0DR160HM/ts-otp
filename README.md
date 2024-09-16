# ts-otp

This is a TypeScript implementation of the Open Telecom Platform (OTP) based on the [Gleam OTP](https://github.com/gleam-lang/otp), aiming on making multithreading easier in the JS/TS ecosystem.

## Implemented so far

### 1. task

Tasks are represented as Promises. But unlike native Promises, they are actually multithreaded.

#### async

Spawn a task process that calls a given function in order to perform some work. The result of this function is send back to the parent and can be received using the `await` function.

If the current environment doesn't support the [Web Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) (JavaScript's multithreading natives) then the process gracefully degrades into a common Promise run in the event loop.

#### await

Wait for the value computed by a task. If the a value is not received before the timeout has elapsed or if the task process crashes then this function rejects.

#### awaitForever

Does literally nothing and only existis to keep it compatible with Gleam OTP. If you want to await for a task without setting a timeout, just use JavaScript's native `await` syntax.

#### tryAwait

Wait for the value computed by a task. If the a value is not received before the timeout has elapsed or if the task process crashes then an error is returned.

#### tryAwaitForever

Wait endlessly for the value computed by a task. Be Careful! This function does not return until there is a value to receive. If a value is not received then the process will be stuck waiting forever.
