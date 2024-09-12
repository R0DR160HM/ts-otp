const WORKER_SCRIPT = `
    const base = self;

    onmessage = function(msg) {
        const data = msg.data;
        const args = data.args;
        const command = data.command;
        
        base.job = args[0];
        
        if (command !== "run") {
            base.postMessage({
                status: "error",
                error: {
                    message: "Invalid command!"
                }
            });
        }

        const func = new Function("return " + base.job.doFunction)();
        func(base.job.args)
            .then(function (value) {
                base.postMessage({ status: "ok", value })
            })
            .catch(function (error) {
                base.postMessage({ status: "error", error })
            });
    }
`;

function async<T>(context: unknown[], callback: (args: unknown[]) => Promise<T>): Promise<T> {
    const blobURL = URL.createObjectURL(new Blob(
        [WORKER_SCRIPT],
        { type: 'application/javascript' }
    ));
    const worker = new Worker(blobURL);

    return new Promise((resolve, reject) => {
        worker.addEventListener('error', err => {
            reject(err);
            worker.terminate();
            URL.revokeObjectURL(blobURL);
        });
        worker.addEventListener('message', ev => {
            if (ev.data.status === 'ok') {
                resolve(ev.data.value);
            } else {
                reject(ev.data.error);
            }
            worker.terminate();
            URL.revokeObjectURL(blobURL);
        });

        worker.postMessage({
            command: 'run',
            args: [{
                args: context,
                doFunction: callback.toString()
            }]
        });
    })
}

module.exports = { async };