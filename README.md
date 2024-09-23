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

### 🧬 Process

Processes are the building block for all other models, they are represented as Promises due to their asynchronous nature, but they are actually run on a different thread. Working directly with processes should be avoided in favor of other models.

#### Pid

The Process identifier (Pid) is an object used to manage different processes. Every active process has a Pid, which contains an unique numeric ID and a reference to a Web Worker. **You should interact with neither**, and simply use the Pid object itself as an abstraction for the process.

#### start

Starts a new process with the informed code implementation and returns a new Pid.
```
const pid = process.start(foo => foo * 2);
```

### kill

Sends a signal to the process gently asking it to commit _seppuku_. Once the process is killed, the link between it and the Pid is broken.
```
process.kill(pid);
```

**Implementation note (feel free to skip):** Started threads are never **actually** killed, unless an error which they can not recover from happens. Routinely, they only have their caches cleaned and their references nulled and then are labelled as "iddle" in order to be reused the next time you call the start() function. This is done to avoid the massive overhead which comes from terminating threads and starting new ones in JavaScript.

### isAlive

Informes whether a given process is still active.
```
if (process.isAlive(pid)) {
    process.kill(pid);
}
```

### register

Gives a name to process, so that you can easily find it later. A process can only have one name and a name can only reference a single process.
```
if (process.register(pid, 'number duplicator') instanceof Result.Ok) {
    // 😁
} else {
    // 😭
}
```

### unregister

Removes the name from a process.
```
process.unregister('my old number duplicator');
```

### named

Searches for a process with the given name.
```
const res = process.named('number duplicator');
if (res instanceof Result.Ok) {
    const pid = res.value;
}
```

### send

Sends a message to a process.
```
if (pid.subject) {
    process.send(pid.subject, 100);
}
```

### sendAfter

Sends a message to a process after the specified delay. It returns a Timer which can be used to cancel the operation before it finishes (see `cancelTimer`).
```
let myTimer: Timer;
if (pid.subject) {
    myTimer = process.sendAfter(pid.subject, 500, 100);
}
```

### cancelTimer

Cancels a timed operation if it has not completed yet (see `sendAfter`).
```
process.cancelTimer(myTimer);
```

### call

Sends a message to a process and waits for a reponse within the specified time.
```
const pid = process.start(foo => foo * 2);
process.call(pid.subject!, 100, 500)
.then(response => {
    console.log(response); // 200
})
.catch(error => {
    console.error(error);
});
```

### tryCall

Sends a message to a process and waits for a response within the specified time. Unlike `call`, with this function the Promise is guaranteed to resolve, even if with an error.
```
const pid = process.start(foo => foo * 2);
process.tryCall(pid.subject!, 100, 500)
.then(response => {
    if (response instanceof Result.Ok) {
        console.log(response.value); // 200
    } else {
        console.error(response.detail);
    }
});
```

---

### 📋 Task

Tasks represent simple functions which can only receive inputs once and only outputs once

#### async

Spawn a task process that calls a given function in order to perform some work. The result of this function is send back to the parent and can be received using the `await` function.
```
const myTask = task.async(foo => foo * 2, 100);
```

#### await

Wait for the value computed by a task. If the a value is not received before the timeout has elapsed or if the task process crashes then this function rejects.
```
task.await(myTask, 500)
.then(response => console.log(response)) // 200
.catch(error => console.error(error));
```

#### awaitForever

Does literally nothing and only existis to keep it compatible with Gleam OTP. If you want to await for a task without setting a timeout, just use JavaScript's native `await` syntax.
```
const response = await myTask;
console.log(response); // 200
```

#### tryAwait

Wait for the value computed by a task. If the a value is not received before the timeout has elapsed or if the task process crashes then an error is returned.
```
task.tryAwait(myTask, 500)
.then(response => {
    if (response instanceof Result.Ok) {
        console.log(response.value); // 200
    } else if (response.detail instanceof AwaitError.Timeout) {
        console.error('timeout');
    } else {
        console.error(response.detail.reason);
    }
});
```

#### tryAwaitForever

Wait endlessly for the value computed by a task. Be Careful! This function does not return until there is a value to receive. If a value is not received then the process will be stuck waiting forever.
```
task.tryAwaitForever(myTask)
.then(response => {
    if (response instanceof Result.Ok) {
        console.log(response.value); // 200
    } else {
        console.error(response.detail.reason);
    }
});
```
