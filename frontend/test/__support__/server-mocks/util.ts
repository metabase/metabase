import fetchMock from "fetch-mock";

export function setupPasswordCheckEndpoint() {
  fetchMock.post("path:/api/session/password-check", 204);
}

type ResponseInfo = {
  url: string;
  body: any;
};

export async function findRequests(
  method: "PUT" | "POST" | "GET" | "DELETE",
): Promise<ResponseInfo[]> {
  // Ensure all async call history is complete
  await fetchMock.callHistory.flush();

  const calls = fetchMock.callHistory.calls();
  const filteredCalls = calls.filter((call) => call.request?.method === method);

  return Promise.all(
    filteredCalls.map(async (call) => {
      let bodyText = "";

      // Try to get body from options first, then from request
      if (call.options?.body) {
        bodyText = call.options.body.toString();
      } else if (call.request?.body && !call.request.bodyUsed) {
        bodyText = await call.request.clone().text();
      }

      return {
        url: call.url || "",
        body: bodyText ? JSON.parse(bodyText) : {},
      };
    }),
  );
}

/**
 * Returns the bodies of the `method` requests whose URL ends with
 * `urlSuffix`, in the order they were sent.
 */
export async function findRequestBodies({
  method,
  urlSuffix,
}: {
  method: Parameters<typeof findRequests>[0];
  urlSuffix: string;
}): Promise<unknown[]> {
  const requests = await findRequests(method);
  return requests
    .filter(({ url }) => url.endsWith(urlSuffix))
    .map(({ body }): unknown => body);
}
