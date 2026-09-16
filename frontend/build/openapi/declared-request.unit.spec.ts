import path from "path";

import { checkContracts } from "./contracts";
import {
  ENDPOINT_BUILDER,
  cleanupFixtures,
  programFrom,
} from "./test-fixtures";

afterAll(cleanupFixtures);

const helper = JSON.stringify(
  path.resolve(__dirname, "../../src/metabase/api/define-request"),
);

describe("declared request contracts", () => {
  const { program, files, root } = programFrom({
    "endpoint.ts": `
      import { defineRequest as request } from ${helper};
      ${ENDPOINT_BUILDER}
      const ROUTE = "/api/example/{id}";
      const endpoints = {
        branching: builder.query<void, {id: number; search?: string}>({
          query: request({
            method: "GET", route: ROUTE,
            request: ({id, search}) => {
              const path = {id};
              if (search) { return {path, query: {id, search}}; }
              return {path, query: {id}};
            },
          }),
        }),
        missingQuery: builder.query<void, {id: number; include: boolean}>({
          query: request({
            method: "GET", route: ROUTE,
            request: ({id, include}) => include ? {path: {id}, query: {id}} : {path: {id}},
          }),
        }),
        json: builder.query<void, {id: number; when: Date}>({
          query: request({
            method: "PUT", route: ROUTE,
            request: ({id, when}) => ({path: {id}, body: {id, when, __rtkCacheKey: "local"}}),
          }),
        }),
        requiredArray: builder.query<void, {values: string[]}>({
          query: request({method: "GET", route: "/api/arrays", request: query => ({query})}),
        }),
        upload: builder.query<void, FormData>({
          query: request({method: "POST", route: "/api/upload", request: body => ({body})}),
        }),
        emptyRest: builder.query<void, {id: number}>({
          query: request({method: "GET", route: ROUTE, request: ({id, ...query}) => ({path: {id}, query})}),
        }),
        overridden: builder.query<void, number>({
          query: request({method: "GET", route: ROUTE, request: id => ({path: {id}, query: {id}})}),
          extraOptions: {url: "/api/something-else"},
        }),
      };
      // Reject declarations that would reintroduce implicit request channels.
      request({method: "GET", route: ROUTE,
        // @ts-expect-error GET bodies are forbidden.
        request: (id: number) => ({path: {id}, body: {id}}),
      });
      request({method: "GET", route: ROUTE,
        // @ts-expect-error Every named path segment needs a value.
        request: () => ({query: {id: 1}}),
      });
      request({method: "GET", route: ROUTE,
        // @ts-expect-error Path values cannot be optional.
        request: (id: number | undefined) => ({path: {id}}),
      });
    `,
    "types.gen.d.ts": `
      export type GetExampleData = {url: "/api/example/{id}"; path: {id: number}; query: {id: number; search?: string}};
      export type PutExampleData = {url: "/api/example/{id}"; path: {id: number}; body: {id: number; when: string}};
      export type GetArraysData = {url: "/api/arrays"; query: {values: string[]}};
      export type PostUploadData = {url: "/api/upload"; body: {file: string}};
    `,
  });
  const results = checkContracts(
    program,
    [files["endpoint.ts"]],
    files["types.gen.d.ts"],
    root,
  );
  const result = (endpoint: string, part: string) =>
    results.find((r) => r.id === `endpoints:${endpoint}:request.${part}`);

  it("reads aliases, local variables and every conditional return through inferred types", () => {
    expect(result("branching", "query")?.status).toBe("compatible");
    expect(result("branching", "path.0")?.status).toBe("compatible");
    expect(result("missingQuery", "query")?.status).toBe("mismatch");
  });

  it("keeps path keys in the body, strips cache keys, and applies JSON conversion", () => {
    expect(result("json", "body")?.status).toBe("compatible");
    expect(result("json", "body")?.message).toContain("__rtkCacheKey");
    expect(result("json", "path.0")?.status).toBe("compatible");
  });

  it("retains the diagnostic for an array that can send no query values", () => {
    expect(result("requiredArray", "query")?.status).toBe("mismatch");
    expect(result("requiredArray", "query")?.message).toContain("empty");
  });

  it("keeps raw uploads and untyped rest objects unverified", () => {
    expect(result("upload", "body")?.status).toBe("unverified");
    expect(result("upload", "body")?.message).toContain("FormData");
    expect(result("emptyRest", "query")?.status).toBe("unverified");
  });

  it("does not trust a contract when RTK extraOptions overrides the request", () => {
    expect(
      results.find((r) => r.id === "endpoints:overridden:request"),
    ).toMatchObject({
      status: "unverified",
      message: expect.stringContaining("extraOptions"),
    });
  });
});
