import ora from "ora";

import { SITE_NAME } from "../constants/config";
import { EMBEDDING_DEMO_SETUP_TOKEN } from "../constants/env";
import { INSTANCE_CONFIGURED_MESSAGE } from "../constants/messages";
import type { CliOutput, CliStepMethod } from "../types/cli";
import { retry } from "../utils/retry";

export const setupMetabaseInstance: CliStepMethod = async state => {
  const spinner = ora();

  // If the user tries to setup the instance manually
  // before the CLI can initialize them,
  // we cannot ensure the setup steps are performed.
  const onInstanceTampered = async (): Promise<CliOutput> => [
    { type: "error", message: INSTANCE_CONFIGURED_MESSAGE },
    state,
  ];

  // The API is not immediately ready after the health check.
  // We keep retrying until the request stops timing out.
  try {
    spinner.start("Creating an admin user (~2 mins)");

    const res = await retry(
      () =>
        fetch(`${state.instanceUrl}/api/setup`, {
          method: "POST",
          body: JSON.stringify({
            // Instead of fetching /api/session/properties, we can use the demo setup token.
            token: EMBEDDING_DEMO_SETUP_TOKEN,
            user: {
              email: state.email,
              password: state.password,
              password_confirm: state.password,
              last_name: "Embedding",
              first_name: "Demo",
              site_name: SITE_NAME,
            },
            prefs: {
              site_name: SITE_NAME,
              site_locale: "en",
            },
          }),
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(15_000),
        }),
      { retries: 5, delay: 1000 },
    );

    if (!res.ok) {
      const errorMessage = await res.text();
      spinner.fail();

      // Error message: The /api/setup route can only be used to create the first user, however a user currently exists.
      if (errorMessage.includes("a user currently exists")) {
        return onInstanceTampered();
      }

      try {
        const { errors } = JSON.parse(errorMessage) as {
          errors: Record<string, string>;
        };

        // TODO: improve password generation so it does not match the common passwords list.
        if (errors.password.includes("password is too common")) {
          return [
            {
              type: "error",
              message: "Password is too common.",
            },
            state,
          ];
        }

        if (errors) {
          return [
            {
              type: "error",
              message: JSON.stringify(errors, null, 2),
            },
            state,
          ];
        }

        return [
          {
            type: "error",
            message: errorMessage,
          },
          state,
        ];
      } catch (error) {
        return [
          {
            type: "error",
            message: errorMessage,
          },
          state,
        ];
      }
    }

    const cookie = res.headers.get("set-cookie") ?? "";

    spinner.succeed();

    return [
      {
        type: "success",
      },
      { ...state, cookie },
    ];
  } catch (error) {
    spinner.fail();

    const reason = error instanceof Error ? error.message : String(error);
    const message = `Failed to setup Metabase instance. Reason: ${reason}`;

    if (reason.includes("Unauthenticated")) {
      return onInstanceTampered();
    }

    return [{ type: "error", message }, state];
  }
};
