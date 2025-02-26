import fs from "fs/promises";

import { SAMPLE_CREDENTIALS_FILE_NAME } from "../constants/config";
import type { CliStepMethod } from "../types/cli";
import { addFileToGitIgnore } from "../utils/add-file-to-git-ignore";

export const generateCredentialsFile: CliStepMethod = async state => {
  await addFileToGitIgnore(SAMPLE_CREDENTIALS_FILE_NAME);

  const credentials = {
    email: state.email,
    password: state.password,
    url: state.instanceUrl,
  };

  // Store the login credentials to a file.
  await fs.writeFile(
    `./${SAMPLE_CREDENTIALS_FILE_NAME}`,
    JSON.stringify(credentials, null, 2),
  );

  return [{ type: "success" }, state];
};
