abstract class CallError {
    public static CalleeDown = class extends CallError {
        constructor(public readonly reason: unknown) {
            super();
        }
    }
    public static CallTimeout = class extends CallError { }
}

abstract class Cancelled {
    public static TimerNotFound = class extends Cancelled { }
    public static Cancelled = class extends Cancelled {
        constructor(public readonly timeRemaining: number) {
            super();
        }
    }
}

abstract class ExitReason {
    public static Normal = class extends ExitReason { }
    public static Killed = class extends ExitReason { }
    public static Abnormal = class extends ExitReason {
        constructor(public readonly reason: string) {
            super();
        }
    }
}

class Pid {
    private static lastId = 0;
    public readonly id: number;
    constructor() {
        this.id = ++Pid.lastId;
    }
}

class ExitMessage {
    constructor(
        public readonly pid: Pid,
        public readonly reason: ExitReason
    ) { }
}

class ProcessDown {
    constructor(
        public readonly pid: Pid,
        public readonly reason: unknown
    ) { }
}

export const process = {
    CallError,
    Cancelled,
    ExitReason,
    ExitMessage,
    Pid,
    ProcessDown
};