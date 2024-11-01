import fs from "fs/promises";

import { input } from "@inquirer/prompts";

import { isEmail } from "metabase/lib/email";
import { generatePassword } from "metabase/lib/security";

import type { CliStepMethod } from "../types/cli";
import { addFileToGitIgnore } from "../utils/add-file-to-git-ignore";
import {
  OUTPUT_STYLES,
  printEmptyLines,
  printWithPadding,
} from "../utils/print";

const CREDENTIAL_FILE_NAME = "METABASE_LOGIN.json";

export const generateCredentials: CliStepMethod = async state => {
  printEmptyLines();
  printWithPadding("Setting up a local Metabase instance.");

  const email = await input({
    message: "What is the email address you want to use for the admin user?",
    validate: email =>
      isEmail(email) ||
      OUTPUT_STYLES.error("Please enter a valid email address."),
  });

  const password = generatePassword({ total: 14, digit: 1 });

  await addFileToGitIgnore(CREDENTIAL_FILE_NAME);

  // Store the login credentials to a file.
  await fs.writeFile(
    `./${CREDENTIAL_FILE_NAME}`,
    JSON.stringify({ email, password }, null, 2),
  );

  return [{ type: "success" }, { ...state, email, password }];
};
