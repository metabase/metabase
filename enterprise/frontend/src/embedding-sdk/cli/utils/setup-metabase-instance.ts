import fetch from "node-fetch";
import ora from "ora";

import { CONTAINER_NAME } from "./docker";
import { printError } from "./print";

interface SetupOptions {
  instanceUrl: string;
  email: string;
  password: string;
}

const SITE_NAME = "Metabase Embedding SDK Demo";

const INSTANCE_CONFIGURED_MESSAGE = `
  The instance has been configured before.
  Please delete the container with "docker rm -f ${CONTAINER_NAME}" and try again.
`;

export async function setupMetabaseInstance(
  options: SetupOptions,
): Promise<boolean> {
  const { instanceUrl } = options;

  const setupSpinner = ora("Setting up your Metabase instance...").start();

  const showError = (message: string) => {
    setupSpinner.stop();
    printError(message);
  };

  try {
    let res = await fetch(`${instanceUrl}/api/session/properties`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    // We will get an "unauthenticated" error when the instance has been configured.
    if (!res.ok) {
      showError(INSTANCE_CONFIGURED_MESSAGE);
      return false;
    }

    // Retrieve the current setup token of the current Metabase instance
    const properties = (await res.json()) as { "setup-token": string };
    const setupToken = properties["setup-token"];

    // If the setup token has been cleared, assume instance is configured.
    if (!setupToken) {
      showError(INSTANCE_CONFIGURED_MESSAGE);
      return false;
    }

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

    if (!res.ok) {
      const textResponse = await res.text();

      if (textResponse.includes("user currently exists")) {
        showError(INSTANCE_CONFIGURED_MESSAGE);
        return false;
      }

      const { errors } = JSON.parse(textResponse) as {
        errors: Record<string, string>;
      };

      showError(`Failed to setup Metabase instance.`);

      if (errors) {
        console.log("\n", errors);
      }

      return false;
    }

    res = await fetch(`${instanceUrl}/api/setting`, {
      method: "PUT",
      body: JSON.stringify({
        "embedding-homepage": "visible",
        "enable-embedding": true,
        "setup-license-active-at-setup": false,
        "setup-embedding-autoenabled": true,
      }),
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const { errors } = (await res.json()) as {
        errors: Record<string, string>;
      };

      printError(`Failed to define Metabase settings.\n`);

      if (errors) {
        console.log("\n", errors);
      }

      return false;
    }

    return true;
  } catch (error) {
    printError("Failed to setup Metabase instance.");

    if (error instanceof Error) {
      console.log(error.message);
    }

    return false;
  } finally {
    setupSpinner.stop();
  }
}
