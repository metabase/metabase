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
  console.log("CALLS", calls);

  // In fetch-mock v12+, the method is stored on the request object
  const filteredCalls = calls.filter((call) => call.request?.method === method);

  const reqs = await Promise.all(
    filteredCalls.map(async (call) => {
      let body = "{}";

      // Check if there's a body in the options (for url+options calls)
      if (call.options?.body) {
        if (typeof call.options.body === "string") {
          body = call.options.body;
        } else {
          // Handle other body types (FormData, URLSearchParams, etc.)
          body = call.options.body.toString();
        }
      }
      // Check if there's a Request object with body
      else if (call.request?.body && !call.request.bodyUsed) {
        const clonedRequest = call.request.clone();
        body = await clonedRequest.text();
      }

      return {
        url: call.url || "",
        body: JSON.parse(body || "{}"),
      };
    }),
  );

  return reqs;
}
