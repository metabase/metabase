export type RequestMethod = "GET" | "POST" | "PUT" | "DELETE";

const REQUEST_METHODS = new Set<RequestMethod>([
  "GET",
  "POST",
  "PUT",
  "DELETE",
]);

export const isRequestMethod = (method: unknown): method is RequestMethod =>
  REQUEST_METHODS.has(method as RequestMethod);
