import type { MockRequest } from "fetch-mock";

export async function getRequestBody<T>(
  url: string,
  options: MockRequest,
): Promise<T> {
  const request = new Request(url, { ...options, body: await options.body });
  return request.json();
}
