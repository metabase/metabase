export class PyodideWorkerManager {
  async executePython() {
    return {
      output: [],
      error: undefined,
      logs: {
        stdout: "",
        stderr: "",
      },
    };
  }
}
