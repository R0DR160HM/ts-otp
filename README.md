# ts-otp

This is a TypeScript implementation of the Open Telecom Platform (OTP) based on the [Gleam OTP](https://github.com/gleam-lang/otp), aiming on making multithreading easier in the JS/TS ecosystem.

## Implemented so far
1. **task**
    - **async**: Creates a new thread and immediately starts executing the given task in it. It returns a Promise which returns as soon as the task finishes.
