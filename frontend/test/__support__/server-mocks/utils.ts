import type { MockRequest } from "fetch-mock";

export async function getRequestBody<T>(request: MockRequest): Promise<T> {
  const body = await request.body;
  return typeof body === "string" ? JSON.parse(body) : body;
}
