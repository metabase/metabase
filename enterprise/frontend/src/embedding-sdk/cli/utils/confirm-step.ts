import { confirm } from "@inquirer/prompts";

/**
 * If the user answers "no" to the prompt, they will be asked again.
 * Hitting "Enter" will confirm by default.
 **/
export const confirmStep = async (message: string) => {
  let confirmed = false;

  do {
    confirmed = await confirm({ message });
  } while (!confirmed);
};
