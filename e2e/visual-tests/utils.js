const { spawn } = require("child_process");

function getDefaultCommandExecutionMessage(code) {
  return code === 0
    ? "Command executed successfully"
    : `Command failed with code ${code}`;
}

module.exports.runCommand = async function runCommand(command, args, handlers) {
  const { onClose } = handlers || {};

  await new Promise((resolve, reject) => {
    const spawnedProcess = spawn(command, args);

    spawnedProcess.stdout.on("data", data => {
      process.stdout.write(data);
    });

    spawnedProcess.stderr.on("data", data => {
      process.stderr.write(data);
    });

    spawnedProcess.on("close", code => {
      const message = onClose
        ? onClose(code)
        : getDefaultCommandExecutionMessage(code);

      if (code === 0) {
        console.log(message);

        resolve();
      } else {
        reject(new Error(message));
      }
    });
  });
};
