import { runCli } from "../run";
import { printError } from "../utils/print";

export async function start() {
  try {
    await runCli();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("force closed the prompt")) {
        printError("Aborted.");
        return;
      }
    }

    printError("An error occurred.");
    console.log(error);
  }
}
