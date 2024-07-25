import fetch from "node-fetch";
import ora from "ora";

import { CONTAINER_NAME } from "./docker";
import { printError, printInfo } from "./print";

interface SetupOptions {
  instanceUrl: string;
  email: string;
  password: string;
}

const SITE_NAME = "Metabase Embedding SDK Demo";

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
): Promise<boolean> {
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
    return false;
  };

  try {
    spinner.start("Preparing to setup the instance...");

    let res = await fetch(`${instanceUrl}/api/session/properties`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    // We will get an auth error when the instance has been configured.
    if (res.status !== 200) {
      return onInstanceConfigured();
    }

    // Retrieve the current setup token of the current Metabase instance
    const properties = (await res.json()) as { "setup-token": string };
    const setupToken = properties["setup-token"];

    // If the setup token has been cleared, assume instance is configured.
    if (!setupToken) {
      return onInstanceConfigured();
    }

    spinner.succeed();
    spinner.start("Creating an admin user...");

    res = await fetch(`${instanceUrl}/api/setup`, {
      method: "POST",
      body: JSON.stringify({
        token: setupToken,
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
      headers: { "Content-Type": "application/json" },
    });

    if (res.status !== 200) {
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
          return false;
        }

        if (errors) {
          printInfo(JSON.stringify(errors, null, 2));
        }
      } catch (error) {
        printInfo(errorMessage);
      }

      return false;
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
      headers: { "Content-Type": "application/json", Cookie: cookie },
    });

    if (res.status !== 200) {
      const errorMessage = await res.text();

      if (errorMessage.includes("Unauthenticated")) {
        return onInstanceConfigured();
      }

      showError(EMBEDDING_FAILED_MESSAGE);
      console.log(res.statusText, errorMessage);

      return false;
    }

    spinner.succeed();

    return true;
  } catch (error) {
    spinner.fail("Failed to setup Metabase instance.");

    if (error instanceof Error) {
      console.log(error.message);
    }

    return false;
  }
}
