import { exec as execCallback } from "child_process";

import toggle from "inquirer-toggle";
import ora from "ora";
import { promisify } from "util";

import type { CliOutput, CliStepMethod } from "embedding-sdk/cli/types/cli";
import {
  OUTPUT_STYLES,
  printEmptyLines,
  printInfo,
} from "embedding-sdk/cli/utils/print";

import { CONTAINER_NAME, SITE_NAME } from "../constants/config";
import { EMBEDDING_DEMO_SETUP_TOKEN } from "../constants/env";
import {
  EMBEDDING_FAILED_MESSAGE,
  INSTANCE_CONFIGURED_MESSAGE,
} from "../constants/messages";
import { retry } from "../utils/retry";

const exec = promisify(execCallback);

export const setupMetabaseInstance: CliStepMethod = async state => {
  const spinner = ora();

  const showError = (message: string): CliOutput => {
    spinner.fail();
    return [
      {
        type: "error",
        message,
      },
      state,
    ];
  };

  // If the instance we are configuring is not clean,
  // therefore we cannot ensure the setup steps are performed.
  const onInstanceConfigured = async (): Promise<CliOutput> => {
    spinner.fail();
    printEmptyLines();
    printInfo(
      "The instance is already configured. Do you want to delete the container and start over?",
    );
    const shouldRestartSetup = await toggle({
      message: `${OUTPUT_STYLES.error("WARNING: This will delete all data.")}`,
      default: false,
    });
    if (!shouldRestartSetup) {
      return showError(INSTANCE_CONFIGURED_MESSAGE);
    }
    await exec(`docker rm -f ${CONTAINER_NAME}`);

    return [
      {
        type: "success",
        nextStep: "startLocalMetabaseContainer",
      },
      state,
    ];
  };

  // The API is not immediately ready after the health check.
  // We keep retrying until the request stops timing out.
  try {
    spinner.start("Creating an admin user (~2 mins)");

    let res = await retry(
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
          signal: AbortSignal.timeout(2500),
        }),
      { retries: 20, delay: 1000 },
    );

    if (!res.ok) {
      const errorMessage = await res.text();

      // Error message: The /api/setup route can only be used to create the first user, however a user currently exists.
      if (errorMessage.includes("a user currently exists")) {
        return onInstanceConfigured();
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
    spinner.start("Enabling embedding features...");

    res = await fetch(`${state.instanceUrl}/api/setting`, {
      method: "PUT",
      body: JSON.stringify({
        "embedding-homepage": "visible",
        "enable-embedding": true,
        "setup-license-active-at-setup": false,
        "setup-embedding-autoenabled": true,
      }),
      headers: { "content-type": "application/json", cookie },
    });

    if (!res.ok) {
      const errorMessage = await res.text();

      if (errorMessage.includes("Unauthenticated")) {
        return onInstanceConfigured();
      }

      return [
        {
          type: "error",
          message: EMBEDDING_FAILED_MESSAGE,
        },
        state,
      ];
    }

    spinner.succeed();

    printInfo(
      "Metabase instance setup complete. You can find your login credentials at METABASE_LOGIN.json",
    );
    console.log("Don't forget to put this file in your .gitignore.");

    return [
      {
        type: "success",
      },
      { ...state, cookie },
    ];
  } catch (error) {
    spinner.fail("Failed to setup Metabase instance.");

    return [
      {
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to setup Metabase instance.",
      },
      state,
    ];
  }
};
