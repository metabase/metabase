import ora from "ora";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";

const delay = (duration: number) =>
  new Promise(resolve => setTimeout(resolve, duration));

const HEALTH_CHECK_MAX_ATTEMPTS = 60 * 5;
const HEALTH_CHECK_WAIT = 1000;

export const pollMetabaseInstance: CliStepMethod = async state => {
  let attempts = 0;

  const spinner = ora(
    "Waiting for the Metabase instance to be ready (~2 mins)",
  ).start();

  while (attempts < HEALTH_CHECK_MAX_ATTEMPTS) {
    // fetch will throw an error if the server is not reachable
    try {
      const res = await fetch(`${state.instanceUrl}/health`, {
        method: "GET",
      });

      // Endpoint returns 503 when Metabase is not ready yet.
      // It returns 200 when Metabase is ready.
      if (res.ok) {
        spinner.succeed();
        return [
          {
            type: "success",
          },
          state,
        ];
      }
    } catch (error) {}

    attempts++;

    await delay(HEALTH_CHECK_WAIT);
  }

  spinner.fail();

  return [
    {
      type: "error",
      message: "Metabase instance is not ready.",
    },
    state,
  ];
};
