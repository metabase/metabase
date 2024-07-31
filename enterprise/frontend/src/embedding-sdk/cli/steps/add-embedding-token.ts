import { input } from "@inquirer/prompts";

import type { CliStepMethod } from "embedding-sdk/cli/types/types";

export const addEmbeddingToken: CliStepMethod = async state => {
  const token = await input({
    message: "Enter your Metabase Pro license key:",
  });
  return [
    {
      type: "success",
    },
    { ...state, token },
  ];
};
