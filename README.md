# ts-otp

This is a TypeScript implementation of the Open Telecom Platform (OTP) based on the [Gleam OTP](https://github.com/gleam-lang/otp), aiming on making multithreading easier in the JS/TS ecosystem.

## Installing

You can easily install it with

```
npm install ts-otp
```

## Compatibility

It is compatible with any environment which fully supports the [Web Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) (JS multithreading natives) and the [URL API](https://developer.mozilla.org/pt-BR/docs/Web/API/URL), including most modern browsers (both Desktop and Mobile) as well as Deno. But it **IS NOT** compatible with Node.

In incompatible environments (such as Node) all processes will gracefully degrade into normal Promises ran in the Event Loop.

## Implemented so far

### 1. task

Tasks are represented as Promises. But unlike native Promises, they are actually multithreaded.

**Important**: So far, only tasks have been implemented and they currently work standalone, that is, directly interfacing with the runtime Web Worker API. This behaviour will change once the `process` object is fully implemented.

#### async

Spawn a task process that calls a given function in order to perform some work. The result of this function is send back to the parent and can be received using the `await` function.

#### await

Wait for the value computed by a task. If the a value is not received before the timeout has elapsed or if the task process crashes then this function rejects.

#### awaitForever

Does literally nothing and only existis to keep it compatible with Gleam OTP. If you want to await for a task without setting a timeout, just use JavaScript's native `await` syntax.

#### tryAwait

Wait for the value computed by a task. If the a value is not received before the timeout has elapsed or if the task process crashes then an error is returned.

#### tryAwaitForever

Wait endlessly for the value computed by a task. Be Careful! This function does not return until there is a value to receive. If a value is not received then the process will be stuck waiting forever.
