import { propagateErrorResponse } from "embedding-sdk/cli/utils/propagate-error-response";

interface Options {
  name: string;

  instanceUrl: string;
  cookie: string;
}

export async function createCollection(options: Options) {
  const { name, instanceUrl, cookie } = options;

  const res = await fetch(`${instanceUrl}/api/collection`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      parent_id: null,
      authority_level: null,
      color: "#509EE3",
      description: null,
      name,
    }),
  });

  await propagateErrorResponse(res);

  const { id: collectionId } = (await res.json()) as { id: number };

  return collectionId;
}
