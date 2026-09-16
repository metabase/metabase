import { defineRequest } from "./define-request";

describe("defineRequest", () => {
  it("keeps path, query and body independent, and preserves client options", () => {
    const query = defineRequest({
      method: "PUT",
      route: "/api/example/{id}",
      request: ({ id, name }: { id: string; name: string }) => ({
        path: { id },
        query: { id: "query-id", enabled: false, values: [1, 2] },
        body: { id: "body-id", name },
      }),
      options: { cache: "no-store", headers: { "X-Example": "value" } },
    });

    expect(query({ id: "a/b?#%:c", name: "Test" })).toEqual({
      method: "PUT",
      url: "/api/example/a%2Fb%3F%23%25%3Ac",
      params: { id: "query-id", enabled: false, values: [1, 2] },
      body: { id: "body-id", name: "Test" },
      cache: "no-store",
      headers: { "X-Example": "value" },
    });
  });

  it.each(["", ".", ".."])("rejects the path segment %j", (id) => {
    const query = defineRequest({
      method: "GET",
      route: "/api/example/{id}",
      request: (id: string) => ({ path: { id } }),
    });
    expect(() => query(id)).toThrow("Invalid path parameter id");
  });

  it.each([
    "/api/example?inline=true",
    "/api/example#fragment",
    "/api/example/:id",
    "/api/example/prefix-{id}",
    "/api/../example",
  ] as const)("rejects the ambiguous route %s", (route) => {
    expect(() =>
      defineRequest({
        method: "GET",
        route,
        request: (id: number) => ({ path: { id } }),
      }),
    ).toThrow("Expected a route");
  });

  it("preserves raw uploads for ApiClient", () => {
    const body = new FormData();
    const query = defineRequest({
      method: "POST",
      route: "/api/example",
      request: (body: FormData) => ({ body }),
    });
    expect(query(body).body).toBe(body);
  });
});
