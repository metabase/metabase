import fetch from "node-fetch";

import { printError } from "./print";

interface SetupOptions {
  instanceUrl: string;
  setupToken: string;
  email: string;
  password: string;
}

const SITE_NAME = "Metabase Embedding SDK Demo";

export function getMetabaseInstanceEnvs(setupToken: string) {
  return {
    MB_EMBEDDING_APP_ORIGIN: "http://localhost:*",
    MB_ENABLE_EMBEDDING: "true",
    MB_EMBEDDING_HOMEPAGE: "visible",
    MB_SETUP_TOKEN: setupToken,
  };
}

export async function setupMetabaseInstance(
  options: SetupOptions,
): Promise<boolean> {
  const { instanceUrl } = options;

  console.log("MB Options:", options);

  let res = await fetch(`${instanceUrl}/api/setup`, {
    method: "POST",
    body: JSON.stringify({
      token: options.setupToken,
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
    headers: {
      "content-type": "application/json",
    },
  });

  if (!res.ok) {
    const errorBody = await res.json();

    printError(`Failed to setup Metabase instance.`);
    console.log(errorBody);

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
    headers: {
      "content-type": "application/json",
    },
  });

  if (!res.ok) {
    const errorBody = await res.json();

    printError(`Failed to define Metabase settings.`);
    console.log(errorBody);

    return false;
  }

  return true;
}
