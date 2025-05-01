import fetchMock from "fetch-mock";

export function setupPasswordCheckEndpoint() {
  fetchMock.post("path:/api/util/password_check", 204);
}

type ResponseInfo = {
  url: string;
  body: any;
};

export async function findRequests(
  method: "PUT" | "POST" | "GET" | "DELETE",
): Promise<ResponseInfo[]> {
  const calls = fetchMock.calls();
  const data = calls.filter((call) => call[1]?.method === method) ?? [];

  const reqs = data.map(async ([url, details]) => {
    const body = ((await details?.body) as string) ?? "{}";

    return { url, body: JSON.parse(body ?? "{}") };
  });

  return Promise.all(reqs);
}
