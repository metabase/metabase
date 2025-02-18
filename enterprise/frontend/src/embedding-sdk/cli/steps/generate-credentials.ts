import { input } from "@inquirer/prompts";

import { isEmail } from "metabase/lib/email";

import type { CliStepMethod } from "../types/cli";
import { generateRandomDemoPassword } from "../utils/generate-password";
import {
  OUTPUT_STYLES,
  printEmptyLines,
  printWithPadding,
} from "../utils/print";

export const generateCredentials: CliStepMethod = async state => {
  printEmptyLines();
  printWithPadding("Setting up a local Metabase instance via Docker.");

  const email = await input({
    message: "What is the email address you want to use for the admin user?",
    validate: email =>
      isEmail(email) ||
      OUTPUT_STYLES.error("Please enter a valid email address."),
  });

  const password = generateRandomDemoPassword();

  return [
    {
      type: "success",
    },
    { ...state, email, password },
  ];
};
