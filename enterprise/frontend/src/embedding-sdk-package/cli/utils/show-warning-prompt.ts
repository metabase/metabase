import { select } from "@inquirer/prompts";

import { CONTINUE_SETUP_ON_WARNING_MESSAGE } from "../constants/messages";

import { printWarning } from "./print";

/**
 * @returns {boolean} whether the user wants to continue setup or not
 */
export async function showWarningAndAskToContinue(
  message: string,
): Promise<boolean> {
  printWarning(message);

  return select({
    message: CONTINUE_SETUP_ON_WARNING_MESSAGE,
    choices: [
      { name: "Continue", value: true },
      { name: "Exit setup", value: false },
    ],
    default: true,
  });
}
