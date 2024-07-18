import { confirm } from "@inquirer/prompts";

import { checkStartRequirements } from "../utils/check-requirements";
import { printError } from "../utils/print";

const START_MESSAGE = `
  This command will help you bootstrap a local Metabase instance and embed
  analytics into your React app using the Metabase embedding SDK for React.
`;

export async function start() {
  console.log(START_MESSAGE);

  const shouldStart = await confirm({ message: "Continue?" });

  if (!shouldStart) {
    printError("Aborted.");
    return;
  }

  await checkStartRequirements();
}
