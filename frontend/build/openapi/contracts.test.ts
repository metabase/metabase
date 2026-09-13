import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  for (const sample of [
    {
      name: "rejects optional frontend fields absent from the backend schema",
      frontend: "{ id: number; email?: string }",
      backend: "{ id: number }",
      missing: "$.email",
    },
    {
      name: "checks optional nested fields through nullable aliases and readonly arrays",
      frontend:
        "{ nodes: ReadonlyArray<{ owner?: { email: string; nickname?: string } | null }> }",
      backend: "{ nodes: { owner: { email: string } | null }[] }",
      missing: "$.nodes[].owner.nickname",
    },
    {
      name: "allows the frontend to omit backend fields at every level",
      frontend: "{ nodes: { owner: { email?: string } }[] }",
      backend:
        "{ nodes: { id: number; owner: { email: string; name: string } }[]; count: number }",
    },
    {
      name: "allows an optional field declared in one compatible backend union variant",
      frontend: '{ kind: "ok" | "error"; data?: { id: number } }',
      backend:
        '{ kind: "ok"; data: { id: number; name: string } } | { kind: "error" }',
    },
    {
      name: "does not borrow an optional field from a different discriminated variant",
      frontend:
        '{ kind: "ok"; error?: string } | { kind: "error"; error: string }',
      backend: '{ kind: "ok" } | { kind: "error"; error: string }',
      missing: "$.error",
    },
    {
      name: "accepts independently named discriminated unions with nested subsets",
      frontend:
        '{ kind: "ok"; data: { id: number } } | { kind: "error"; message: string }',
      backend:
        '{ kind: "ok"; data: { id: number; name: string } } | { kind: "error"; message: string; code: number }',
    },
    {
      name: "checks tuple fields at their own positions",
      frontend: "[{ id: number; email?: string }, { email: string }]",
      backend: "[{ id: number }, { email: string }]",
      missing: "$[0].email",
    },
    {
      name: "accepts a named optional property supported by a backend index signature",
      frontend: "{ users: { alice?: { id: number } } }",
      backend: "{ users: Record<string, { id: number; name: string }> }",
    },
    {
      name: "checks nested fields in dictionaries",
      frontend: "{ users: Record<string, { id: number; nickname?: string }> }",
      backend: "{ users: Record<string, { id: number }> }",
      missing: "$.users[key].nickname",
    },
    {
      name: "rejects a frontend dictionary unsupported by the backend schema",
      frontend: "{ users: Record<string, { id: number }> }",
      backend: "{ users: { alice: { id: number } } }",
      missing: "$.users[key]",
    },
    {
      name: "checks whether named properties match backend template index signatures",
      frontend: '{ metadata: { "x-id"?: string; other?: string } }',
      backend: "{ metadata: { [key: `x-${string}`]: string } }",
      missing: "$.metadata.other",
    },
    {
      name: "does not use numeric index signatures to justify nonnumeric properties",
      frontend: "{ values: { 0?: string; extra?: string } }",
      backend: "{ values: { [key: number]: string } }",
      missing: "$.values.extra",
    },
  ]) {
    it(sample.name, () => {
      const results = check({
        frontend: `type ErdResponse = ${sample.frontend};`,
        backend: backend.replace(
          '{ "2XX": { nodes: Node[] } }',
          `{ "2XX": ${sample.backend} }`,
        ),
        endpoint,
      });
      const response = results.find((r) => r.id.endsWith("response.2XX"));
      assert.equal(
        response?.status,
        sample.missing ? "mismatch" : "pass",
        response?.message,
      );
      if (sample.missing) {
        assert.ok(
          response?.message.includes(sample.missing),
          response?.message,
        );
        assert.match(response?.message ?? "", /not declared in the backend/);
      }
    });
  }

  it("checks optional field values supplied by a backend index signature", () => {
    const results = check({
      frontend: 'type ErdResponse = { metadata: { "x-id"?: string } };',
      backend: backend.replace(
        '{ "2XX": { nodes: Node[] } }',
        '{ "2XX": { metadata: { [key: `x-${string}`]: number } } }',
      ),
      endpoint,
    });
    const response = results.find((r) => r.id.endsWith("response.2XX"));
    assert.equal(response?.status, "mismatch", response?.message);
    assert.match(
      response?.message ?? "",
      /metadata.x-id.*number.*not assignable/,
    );
  });

  it("checks separate occurrences of a shared frontend alias against their own backend shapes", () => {
    const results = check({
      frontend:
        "type Shared = { id: number; name?: string }; type ErdResponse = { first: Shared; second: Shared };",
      backend: backend.replace(
        '{ "2XX": { nodes: Node[] } }',
        '{ "2XX": { first: { id: number; name: string }; second: { id: number } } }',
      ),
      endpoint,
    });
    const response = results.find((r) => r.id.endsWith("response.2XX"));
    assert.equal(response?.status, "mismatch", response?.message);
    assert.match(response?.message ?? "", /second.name.*not declared/);
  });

  it("checks fields after revisiting recursive aliases", () => {
    const results = check({
      frontend:
        "type Tree = { id: number; children: Tree[]; name?: string }; type ErdResponse = Tree;",
      backend: backend.replace(
        'export type GetApiErdResponses = { "2XX": { nodes: Node[] } };',
        'type Branch = { id: number; children: Branch[] }; export type GetApiErdResponses = { "2XX": Branch };',
      ),
      endpoint,
    });
    const response = results.find((r) => r.id.endsWith("response.2XX"));
    assert.equal(response?.status, "mismatch", response?.message);
    assert.match(response?.message ?? "", /name.*not declared/);
  });

  it("keeps unmatched frontend object variants unverified", () => {
    const results = check({
      frontend:
        'type ErdResponse = { kind: "ok" } | { kind: "error"; message?: string };',
      backend: backend.replace(
        '{ "2XX": { nodes: Node[] } }',
        '{ "2XX": { kind: "ok" } }',
      ),
      endpoint,
    });
    const response = results.find((r) => r.id.endsWith("response.2XX"));
    assert.equal(response?.status, "unverified", response?.message);
    assert.match(response?.message ?? "", /union variant/);
  });

  it("terminates when recursive backend variants share the same child types", () => {
    const results = check({
      frontend:
        'type Tree = { kind: "a" | "b"; children: Tree[] }; type ErdResponse = Tree;',
      backend: backend.replace(
        'export type GetApiErdResponses = { "2XX": { nodes: Node[] } };',
        'type Branch = { kind: "a"; children: Branch[] } | { kind: "b"; children: Branch[] }; export type GetApiErdResponses = { "2XX": Branch };',
      ),
      endpoint,
    });
    const response = results.find((r) => r.id.endsWith("response.2XX"));
    assert.equal(response?.status, "pass", response?.message);
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
    id: "exampleApi:example:response.2XX",
    endpointId: "exampleApi:example",
    file: "api.ts",
    line: 10,
    status: "mismatch",
    message: "email is nullable",
  };

  it("rejects new mismatches and permits explicitly baselined debt", () => {
    assert.equal(baselineProblems([result], []).length, 1);
    assert.deepEqual(baselineProblems([result], [result.endpointId]), []);
  });

  it("exempts every check on an endpoint as failures and coverage change", () => {
    assert.deepEqual(
      baselineProblems(
        [
          {
            ...result,
            status: "unverified",
            message: "response schema missing",
          },
          { ...result, id: "exampleApi:example:request.body" },
          { ...result, id: "exampleApi:example:request.path.0" },
        ],
        [result.endpointId],
      ),
      [],
    );
  });

  it("does not fail for fixed, ignored, or removed endpoints", () => {
    for (const status of ["pass", "ignored"] as const) {
      assert.deepEqual(
        baselineProblems([{ ...result, status }], [result.endpointId]),
        [],
      );
    }
    assert.deepEqual(baselineProblems([], [result.endpointId]), []);
  });

  it("enforces all failures once the endpoint exemption is removed", () => {
    for (const status of ["mismatch", "unverified"] as const) {
      assert.equal(baselineProblems([{ ...result, status }], []).length, 1);
    }
  });

  it("does not exempt another API's endpoint with the same name", () => {
    assert.equal(baselineProblems([result], ["anotherApi:example"]).length, 1);
  });
});

describe("endpoint identities", () => {
  const definition = `
    declare const builder: { query<R, A>(definition: unknown): unknown };
    const tableApi = { example: builder.query<{}, void>({ query: () => ({ url: "/api/user" }) }) };
  `;
  const checkFiles = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), "contract-identities-"));
    directories.push(root);
    const paths = Object.entries(files).map(([name, contents]) => {
      const file = join(root, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${contents}\nexport {};`);
      return file;
    });
    const generated = join(root, "types.gen.d.ts");
    writeFileSync(
      generated,
      `export type GetApiUserData = { url: "/api/user"; body?: never; query?: never; path?: never };
       export type GetApiUserResponses = { "2XX": {} };`,
    );
    const program = ts.createProgram([...paths, generated], { strict: true });
    return checkContracts(program, paths, generated, root);
  };

  it("preserves exemptions across file moves and line changes", () => {
    const before = checkFiles({ "api.ts": definition });
    const after = checkFiles({ "moved/table.ts": `\n\n${definition}` });
    assert.deepEqual(
      after.map((r) => r.id),
      before.map((r) => r.id),
    );
    assert.equal(after[0]?.endpointId, "tableApi:example");
    assert.notEqual(after[0]?.file, before[0]?.file);
    assert.notEqual(after[0]?.line, before[0]?.line);
  });

  it("identifies unsupported factories by declaration names instead of lines", () => {
    const factory = `
      declare const builder: { mutation<R, A>(definition: unknown): unknown };
      const dashboardApi = (() => {
        const updateProperties = () => builder.mutation<{}, void>({});
        return { updateProperties };
      })();
    `;
    const before = checkFiles({ "dashboard.ts": factory });
    const after = checkFiles({ "moved.ts": `\n\n${factory}` });
    assert.equal(before[0]?.endpointId, "dashboardApi:updateProperties");
    assert.equal(before[0]?.status, "unverified");
    assert.equal(after[0]?.id, before[0]?.id);
  });

  it("keeps the same endpoint name in different APIs separate", () => {
    const results = checkFiles({
      "table.ts": definition,
      "other.ts": definition.replace("tableApi", "otherApi"),
    });
    assert.equal(new Set(results.map((r) => r.endpointId)).size, 2);
  });

  it("rejects duplicate identities across source files", () => {
    assert.throws(
      () => checkFiles({ "first.ts": definition, "second.ts": definition }),
      /Duplicate endpoint identity tableApi:example/,
    );
  });

  it("requires a name instead of falling back to a line number", () => {
    assert.throws(
      () =>
        checkFiles({
          "unnamed.ts":
            "declare const builder: { query<R, A>(definition: unknown): unknown }; builder.query<{}, void>({});",
        }),
      /give its API or factory a named declaration/,
    );
  });
});
