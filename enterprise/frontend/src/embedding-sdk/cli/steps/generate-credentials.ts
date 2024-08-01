import fs from "fs/promises";

import { input } from "@inquirer/prompts";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import { generateRandomDemoPassword } from "embedding-sdk/cli/utils/generate-password";
import { OUTPUT_STYLES, printEmptyLines } from "embedding-sdk/cli/utils/print";
import { isEmail } from "metabase/lib/email";

export const generateCredentials: CliStepMethod = async state => {
  printEmptyLines();
  const email = await input({
    message: "What is the email address you want to use for the admin user?",
    validate: email =>
      isEmail(email) ||
      OUTPUT_STYLES.error("Please enter a valid email address."),
  });

  const password = generateRandomDemoPassword();

  // Store the login credentials to a file.
  await fs.writeFile(
    "./METABASE_LOGIN.json",
    JSON.stringify({ email, password }, null, 2),
  );

  return [
    {
      type: "success",
    },
    { ...state, email, password },
  ];
};
