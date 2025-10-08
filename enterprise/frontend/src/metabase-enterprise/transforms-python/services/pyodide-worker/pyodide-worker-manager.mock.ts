export class PyodideWorkerManager {
  async executePython() {
    return {
      output: [],
      error: undefined,
      stdout: "",
      stderr: "",
    };
  }
}
