import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import ts from "typescript";

import {
  type ContractResult,
  baselineProblems,
  checkContracts,
} from "./contracts";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);

function check({
  frontend,
  backend,
  endpoint,
  options = {},
}: {
  frontend: string;
  backend: string;
  endpoint: string;
  options?: ts.CompilerOptions;
}) {
  const root = mkdtempSync(join(tmpdir(), "api-contracts-"));
  directories.push(root);
  const file = join(root, "endpoint.ts");
  const generated = join(root, "types.gen.d.ts");
  writeFileSync(
    file,
    `
    type EndpointBuilder = {
      query<Response, Request>(config: {
        query?: (request: Request) => unknown;
        queryFn?: () => unknown;
        transformResponse?: (response: unknown) => Response;
      }): unknown;
    };
    declare const builder: EndpointBuilder;
    ${frontend}
    const endpoints = { example: ${endpoint} };
  `,
  );
  writeFileSync(generated, backend);
  const program = ts.createProgram([file, generated], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    ...options,
  });
  return checkContracts(program, [file], generated, root);
}

const backend = `
  export type Owner = { email: string | null };
  export type Node = { owner: Owner; fields: { id: number }[] };
  export type GetApiErdData = {
    url: "/api/erd/{database-id}";
    path: { "database-id": number };
    query?: { schema?: string };
    body?: never;
  };
  export type GetApiErdResponses = { "2XX": { nodes: Node[] } };
`;
const frontend = `
  type User = { email: string | null };
  type ErdResponse = { nodes: { owner: User; fields: { id: number }[] }[] };
`;
const endpoint = `builder.query<ErdResponse, number>({ query: id => ({ url: \`/api/erd/\${id}\` }) })`;

describe("API contract checks", () => {
  it("keeps checking a typed EndpointBuilder after its variable is renamed", () => {
    const results = check({
      frontend: `${frontend}\ndeclare const renamed: EndpointBuilder;`,
      backend,
      endpoint: endpoint.replace("builder.query", "renamed.query"),
    });
    assert.equal(results.length, 4);
    assert.ok(results.every((result) => result.status === "pass"));
  });

  for (const property of [
    '["params"]: { schema: 123 },',
    "get params() { return { schema: 123 }; },",
  ]) {
    it(`does not silently ignore request property ${property}`, () => {
      const results = check({
        frontend,
        backend,
        endpoint: endpoint.replace("url: `", `${property} url: \``),
      });
      assert.ok(results.some((result) => result.status === "unverified"));
    });
  }

  it("marks a request mapper with a fallthrough return as unverified", () => {
    const results = check({
      frontend,
      backend,
      endpoint:
        "builder.query<ErdResponse, number>({ query: id => { if (id) { return { url: `/api/erd/${id}` }; } } })",
    });
    assert.ok(results.some((result) => result.status === "unverified"));
  });

  it("refuses to compare contracts with strict null checking disabled", () => {
    assert.throws(
      () =>
        check({
          frontend,
          backend,
          endpoint,
          options: { strictNullChecks: false },
        }),
      /strictNullChecks/,
    );
  });

  it("fails on malformed generated declarations rather than checking a partial AST", () => {
    assert.throws(
      () =>
        check({
          frontend,
          backend: `${backend}\nexport type Broken = ;`,
          endpoint,
        }),
      /generated|syntax|Type expected/i,
    );
  });

  it("finds multiple independent nested field mismatches", () => {
    const results = check({
      frontend: frontend
        .replace("string | null", "string")
        .replace("id: number", "id: string"),
      backend,
      endpoint,
    });
    const message =
      results.find((r) => r.id.endsWith("response.2XX"))?.message ?? "";
    assert.match(message, /nodes\[\]\.owner\.email/);
    assert.match(message, /nodes\[\]\.fields\[\]\.id/);
  });

  it("explains optional-property presence independently of its value type", () => {
    const results = check({
      frontend: "type ErdResponse = { label: string | undefined };",
      backend: backend.replace(
        '{ "2XX": { nodes: Node[] } }',
        '{ "2XX": { label?: string } }',
      ),
      endpoint,
    });
    const response = results.find((r) => r.id.endsWith("response.2XX"));
    assert.equal(response?.status, "mismatch");
    assert.match(response?.message ?? "", /label.*optional.*required/);
  });

  it("accepts primitive aliases and safe response subsets without copying generated entities", () => {
    const results = check({
      frontend: 'type ErdResponse = { schema: "yo" };',
      backend: backend.replace(
        'export type GetApiErdResponses = { "2XX": { nodes: Node[] } };',
        'type XYZ = "yo"; export type GetApiErdResponses = { "2XX": { schema: XYZ; unused: { deep: number } } };',
      ),
      endpoint,
    });
    assert.equal(
      results.find((r) => r.id.endsWith("response.2XX"))?.status,
      "pass",
    );
  });
  it("resolves differently named nested entities without importing generated types into the frontend", () => {
    const results = check({ frontend, backend, endpoint });
    assert.deepEqual(
      results.map((r) => r.status),
      ["pass", "pass", "pass", "pass"],
    );
  });

  it("rejects a nullable field several referenced entities deep", () => {
    const results = check({
      frontend: frontend.replace("string | null", "string"),
      backend,
      endpoint,
    });
    assert.equal(
      results.find((r) => r.id.endsWith("response.2XX"))?.status,
      "mismatch",
    );
  });

  it("checks every union response variant, including missing fields on failures", () => {
    const results = check({
      frontend,
      backend: backend.replace(
        '"2XX": { nodes: Node[] }',
        '"2XX": { nodes: Node[] } | { error: string }',
      ),
      endpoint,
    });
    assert.equal(
      results.find((r) => r.id.endsWith("response.2XX"))?.status,
      "mismatch",
    );
  });

  it("compares a scalar query argument with its actual path slot, including URL encoding", () => {
    const results = check({
      frontend,
      backend,
      endpoint: endpoint.replace("${id}", "${encodeURIComponent(id)}"),
    });
    assert.equal(
      results.find((r) => r.id.endsWith("request.path.0"))?.status,
      "pass",
    );
  });

  it("rejects an incompatible path value despite different parameter names", () => {
    const results = check({
      frontend,
      backend,
      endpoint: endpoint.replace("ErdResponse, number", "ErdResponse, string"),
    });
    assert.equal(
      results.find((r) => r.id.endsWith("request.path.0"))?.status,
      "mismatch",
    );
  });

  it("checks the query object constructed by the mapper", () => {
    const results = check({
      frontend,
      backend,
      endpoint: endpoint.replace("url: `", "params: { schema: 123 }, url: `"),
    });
    assert.equal(
      results.find((r) => r.id.endsWith("request.query"))?.status,
      "mismatch",
    );
  });

  it("does not accept a missing required body", () => {
    const results = check({
      frontend,
      backend: backend.replace("body?: never", "body: { name: string }"),
      endpoint,
    });
    assert.equal(
      results.find((r) => r.id.endsWith("request.body"))?.status,
      "mismatch",
    );
  });

  it("marks transformations unverified instead of comparing the transformed result to the wire response", () => {
    const results = check({
      frontend,
      backend,
      endpoint: endpoint.replace(
        "query: id",
        "transformResponse: () => ({ nodes: [] }), query: id",
      ),
    });
    assert.equal(
      results.find((r) => r.id.endsWith(":response"))?.status,
      "unverified",
    );
  });

  it("records intentional response discards separately from compatibility", () => {
    const results = check({
      frontend,
      backend,
      endpoint: endpoint.replace("ErdResponse,", "void,"),
    });
    assert.equal(
      results.find((r) => r.id.endsWith(":response"))?.status,
      "ignored",
    );
  });

  for (const loose of ["any", "unknown", "MissingType"]) {
    it(`never reports a contract containing ${loose} as verified`, () => {
      const results = check({
        frontend: frontend.replace("string | null", loose),
        backend,
        endpoint,
      });
      assert.equal(
        results.find((r) => r.id.endsWith("response.2XX"))?.status,
        "unverified",
      );
    });
  }

  it("reports dynamic requests as coverage gaps", () => {
    const results = check({
      frontend,
      backend,
      endpoint: "builder.query<ErdResponse, number>({ queryFn: () => ({}) })",
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.status, "unverified");
  });

  it("matches by HTTP method as well as URL", () => {
    const results = check({
      frontend,
      backend,
      endpoint: endpoint.replace("url: `", 'method: "POST", url: `'),
    });
    assert.match(results[0]?.message ?? "", /No generated operation for POST/);
  });

  it("supports recursive component references without copying or infinitely expanding them", () => {
    const results = check({
      frontend:
        "type Tree = { id: number; children: Tree[] }; type ErdResponse = Tree;",
      backend: backend.replace(
        'export type GetApiErdResponses = { "2XX": { nodes: Node[] } };',
        'export type Branch = { id: number; children: Branch[] }; export type GetApiErdResponses = { "2XX": Branch };',
      ),
      endpoint,
    });
    assert.equal(
      results.find((r) => r.id.endsWith("response.2XX"))?.status,
      "pass",
    );
  });

  it("fails closed when generation produces no recognizable operations", () => {
    assert.throws(
      () => check({ frontend, backend: "export type Nothing = {};", endpoint }),
      /No operations found/,
    );
  });
});

describe("incremental enforcement", () => {
  const result: ContractResult = {
    id: "api.ts:example:response",
    file: "api.ts",
    line: 10,
    status: "mismatch",
    message: "email is nullable",
  };

  it("rejects new mismatches and permits explicitly baselined debt", () => {
    assert.equal(baselineProblems([result], {}).length, 1);
    assert.deepEqual(
      baselineProblems([result], { [result.id]: "mismatch" }),
      [],
    );
  });

  it("requires removing exemptions after a fix or disappearing check", () => {
    assert.equal(
      baselineProblems([{ ...result, status: "pass" }], {
        [result.id]: "mismatch",
      }).length,
      1,
    );
    assert.equal(baselineProblems([], { [result.id]: "mismatch" }).length, 1);
  });

  it("does not let a mismatching check silently become unverified", () => {
    assert.equal(
      baselineProblems([{ ...result, status: "unverified" }], {
        [result.id]: "mismatch",
      }).length,
      1,
    );
  });
});
