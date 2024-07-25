import fetch from "node-fetch";
import ora from "ora";

import { printError } from "embedding-sdk/cli/utils/print";

interface Options {
  instanceUrl: string;
  cookie: string;
}

export async function createApiKey(options: Options): Promise<string | null> {
  const { instanceUrl, cookie } = options;

  const spinner = ora();

  const res = await fetch(`${instanceUrl}/api/api-key`, {
    method: "POST",
    body: JSON.stringify({
      name: "Embedding SDK Demo",
      group_id: 1, // The "All Users" group
    }),
    headers: { "content-type": "application/json", cookie },
  });

  if (!res.ok) {
    const errorMessage = await res.text();

    spinner.fail();

    printError("Failed to create an API key.");
    console.log(errorMessage);

    return null;
  }

  const { unmasked_key } = (await res.json()) as { unmasked_key: string };

  spinner.succeed();

  return unmasked_key;
}
