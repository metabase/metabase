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
