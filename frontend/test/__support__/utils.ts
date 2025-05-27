import fetchMock from "fetch-mock";

import { act, waitFor } from "./ui";

export const getNextId = (() => {
  let id = 0;
  return (startingId?: number) => {
    if (startingId) {
      id = startingId;
    }
    return ++id;
  };
})();

export async function delay(duration: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, duration));
  });
}

/** Waits for a request to have been made. It's useful to wait for a request and
 * then check its details separately, to make tests less flaky and to have
 * better failure messages (request arrived but wrong details vs request never
 * arrived)
 */
export const waitForRequest = async (
  requestFn: () => fetchMock.MockCall | undefined,
) => {
  try {
    // try catch to make jest show the line where waitForRequest was originally called
    await waitFor(() => {
      if (!requestFn()) {
        throw new Error("Request not found");
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      Error.captureStackTrace(error, waitForRequest);
    }
    throw error;
  }
};

export async function findRequests(method: "PUT" | "POST" | "DELETE" | "GET") {
  const calls = fetchMock.calls();
  const data = calls.filter((call) => call[1]?.method === method) ?? [];

  const reqs = data.map(async ([url, details]) => {
    const body = ((await details?.body) as string) ?? "{}";

    return { url: url, body: JSON.parse(body ?? "{}") };
  });

  return Promise.all(reqs);
}
