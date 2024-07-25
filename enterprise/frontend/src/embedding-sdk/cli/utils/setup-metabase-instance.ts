import fetch from "node-fetch";

import { CONTAINER_NAME } from "./docker";
import { printError } from "./print";

interface SetupOptions {
  instanceUrl: string;
  email: string;
  password: string;
}

const SITE_NAME = "Metabase Embedding SDK Demo";

const SETUP_TOKEN_MISSING_ERROR = `The instance has already been set up before. Please delete the container with "docker rm -f ${CONTAINER_NAME}" and try again.`;

export async function setupMetabaseInstance(
  options: SetupOptions,
): Promise<boolean> {
  const { instanceUrl } = options;

  let res = await fetch(`${instanceUrl}/api/session/properties`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  // Retrieve the current setup token of the current Metabase instance
  const properties = (await res.json()) as { "setup-token": string };
  const setupToken = properties["setup-token"];

  if (!setupToken) {
    printError(SETUP_TOKEN_MISSING_ERROR);

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
    const { errors } = (await res.json()) as { errors: Record<string, string> };

    printError(`\n  Failed to setup Metabase instance.`);

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
    const { errors } = (await res.json()) as { errors: Record<string, string> };

    printError(`\n  Failed to define Metabase settings.\n`);

    if (errors) {
      console.log("\n", errors);
    }

    return false;
  }

  return true;
}
