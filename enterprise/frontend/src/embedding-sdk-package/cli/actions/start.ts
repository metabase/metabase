import { runCli } from "../run";
import { printError } from "../utils/print";

export async function start() {
  // When the user runs the CLI with npx, there will be some deprecation warnings that we should clear.
  console.clear();

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
