import ora from "ora";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";

export const createApiKey: CliStepMethod = async state => {
  if (!state.instanceUrl || !state.cookie) {
    return [
      {
        type: "error",
        message: "Missing instance URL or authentication cookie",
      },
      state,
    ];
  }

  const spinner = ora("Generating a new API key…").start();

  const res = await fetch(`${state.instanceUrl}/api/api-key`, {
    method: "POST",
    body: JSON.stringify({
      name: "Embedding SDK Demo",
      group_id: 1, // The "All Users" group
    }),
    headers: { "content-type": "application/json", cookie: state.cookie },
  });

  if (!res.ok) {
    const errorMessage = await res.text();

    spinner.fail();

    return [
      {
        type: "error",
        message: `Failed to create an API key. ${errorMessage}`,
      },
      state,
    ];
  }

  const { unmasked_key } = (await res.json()) as { unmasked_key: string };

  spinner.succeed();

  return [
    {
      type: "success",
    },
    { ...state, apiKey: unmasked_key },
  ];
};
