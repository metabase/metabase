import fetch from "node-fetch";
import ora from "ora";

import { CONTAINER_NAME } from "./constants";
import { EMBEDDING_DEMO_SETUP_TOKEN } from "./docker";
import { printError, printInfo } from "./print";
import { retry } from "./retry";

interface SetupOptions {
  instanceUrl: string;
  email: string;
  password: string;
}

export const SITE_NAME = "Metabase Embedding SDK Demo";
export const DELETE_CONTAINER_MESSAGE = `Please delete the container with "docker rm -f ${CONTAINER_NAME}" and try again.`;

const INSTANCE_CONFIGURED_MESSAGE = `
  The instance has already been configured.
  ${DELETE_CONTAINER_MESSAGE}
`;

const EMBEDDING_FAILED_MESSAGE = `
  Failed to enable embedding features.
  ${DELETE_CONTAINER_MESSAGE}
`;

const CREATE_ADMIN_USER_FAILED_MESSAGE = `
  Failed to create the admin user.
  ${DELETE_CONTAINER_MESSAGE}
`;

export async function setupMetabaseInstance(
  options: SetupOptions,
): Promise<{ cookie: string } | null> {
  const { instanceUrl } = options;

  const spinner = ora();

  const showError = (message: string) => {
    spinner.fail();
    printError(message);
  };

  // If the instance we are configuring is not clean,
  // therefore we cannot ensure the setup steps are performed.
  const onInstanceConfigured = () => {
    showError(INSTANCE_CONFIGURED_MESSAGE);
    return null;
  };

  // The API is not immediately ready after the health check.
  // We keep retrying until the request stops timing out.
  try {
    spinner.start("Creating an admin user (~2 mins)");

    let res = await retry(
      () =>
        fetch(`${instanceUrl}/api/setup`, {
          method: "POST",
          body: JSON.stringify({
            // Instead of fetching /api/session/properties, we can use the demo setup token.
            token: EMBEDDING_DEMO_SETUP_TOKEN,
            user: {
              email: options.email,
              password: options.password,
              password_confirm: options.password,
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
      { retries: 20, delay: 0 },
    );

    if (!res.ok) {
      const errorMessage = await res.text();

      // The /api/setup route can only be used to create the first user, however a user currently exists.
      if (errorMessage.includes("a user currently exists")) {
        return onInstanceConfigured();
      }

      showError(CREATE_ADMIN_USER_FAILED_MESSAGE);

      try {
        const { errors } = JSON.parse(errorMessage) as {
          errors: Record<string, string>;
        };

        // TODO: improve password generation so it does not match the common passwords list.
        if (errors.password.includes("password is too common")) {
          return null;
        }

        if (errors) {
          printInfo(JSON.stringify(errors, null, 2));
        }
      } catch (error) {
        printInfo(errorMessage);
      }

      return null;
    }

    const cookie = res.headers.get("set-cookie") ?? "";

    spinner.succeed();
    spinner.start("Enabling embedding features...");

    res = await fetch(`${instanceUrl}/api/setting`, {
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

      showError(EMBEDDING_FAILED_MESSAGE);
      console.log(errorMessage);

      return null;
    }

    spinner.succeed();

    return { cookie };
  } catch (error) {
    spinner.fail("Failed to setup Metabase instance.");

    if (error instanceof Error) {
      console.log(error.message);
    }

    return null;
  }
}
