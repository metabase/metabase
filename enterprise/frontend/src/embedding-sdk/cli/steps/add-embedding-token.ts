import { input } from "@inquirer/prompts";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";

export const addEmbeddingToken: CliStepMethod = async state => {
  const token = await input({
    message: "Enter your Metabase Pro license key (press Enter to skip):",
    required: false,
  });
  return [
    {
      type: "success",
    },
    { ...state, token },
  ];
};
