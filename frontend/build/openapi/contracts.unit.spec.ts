import ts from "typescript";

import {
  type ContractResult,
  type ContractStatus,
  baselineProblems,
  checkContracts,
} from "./contracts";
import {
  COMPILER_OPTIONS,
  ENDPOINT_BUILDER,
  cleanupFixtures,
  programFrom,
} from "./test-fixtures";
import { TypeWalkError } from "./type-comparison";

const ENDPOINT_ID = "endpoints:example";

afterEach(cleanupFixtures);

function replaceOnce(source: string, target: string, replacement: string) {
  const index = source.indexOf(target);
  if (index === -1 || source.indexOf(target, index + 1) !== -1) {
    throw new Error(
      `Expected exactly one ${JSON.stringify(target)} in the fixture.`,
    );
  }
  return (
    source.slice(0, index) + replacement + source.slice(index + target.length)
  );
}

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
  // The builder shares the template's first line, so the line numbers the specs quote stay put.
  const { root, files, program } = programFrom(
    {
      "endpoint.ts": `${ENDPOINT_BUILDER}
    ${frontend}
    const endpoints = { example: ${endpoint} };
  `,
      "types.gen.d.ts": backend,
    },
    { options, checked: ["endpoint.ts"] },
  );
  return checkContracts(
    program,
    [files["endpoint.ts"] ?? ""],
    files["types.gen.d.ts"] ?? "",
    root,
  );
}

function resultFor(results: ContractResult[], part: string) {
  return results.find((result) => result.id === `${ENDPOINT_ID}:${part}`);
}

/** The message lines of a check, without the notes that record the client rules applied. */
function messageFor(results: ContractResult[], part: string) {
  return resultFor(results, part)
    ?.message.split("\n  ")
    .filter((line) => !line.startsWith("note: "));
}

function statuses(results: ContractResult[]): Record<string, ContractStatus> {
  return Object.fromEntries(
    results.map((result) => [result.id, result.status]),
  );
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
const responsesDeclaration =
  'export type GetApiErdResponses = { "2XX": { nodes: Node[] } };';

function withResponse(response: string, declarations = "") {
  return replaceOnce(
    backend,
    responsesDeclaration,
    `${declarations} export type GetApiErdResponses = { "2XX": ${response} };`,
  );
}

describe("API contract checks", () => {
  it("should check repeated response types with their own union siblings", () => {
    const results = check({
      frontend:
        "type T = { x: number; a?: string }; type ErdResponse = { first: T; second: T };",
      backend: withResponse(
        "{ first: S | Alt; second: S }",
        "type S = { x: number }; type Alt = { x: number; a: string };",
      ),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "mismatch",
      message: expect.stringContaining("$.second.a"),
    });
  });

  it("should report a disagreement at the path that failed after trying a union", () => {
    const results = check({
      frontend:
        "type A = { x: number; a?: string }; type B = { x: number }; type ErdResponse = { first: A | B; second: A };",
      backend: withResponse(
        "{ first: S; second: S }",
        "type S = { x: number };",
      ),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "mismatch",
      message: expect.stringContaining("$.second.a"),
    });
  });

  it("should keep checking a typed EndpointBuilder after its variable is renamed", () => {
    const results = check({
      frontend: `${frontend}\ndeclare const renamed: EndpointBuilder;`,
      backend,
      endpoint: replaceOnce(endpoint, "builder.query", "renamed.query"),
    });
    expect(statuses(results)).toEqual({
      [`${ENDPOINT_ID}:request.body`]: "compatible",
      [`${ENDPOINT_ID}:request.path.0`]: "compatible",
      [`${ENDPOINT_ID}:request.query`]: "compatible",
      [`${ENDPOINT_ID}:response.2XX`]: "compatible",
    });
  });

  it.each([
    '["params"]: { schema: 123 },',
    "get params() { return { schema: 123 }; },",
  ])("should not silently ignore request property %s", (property) => {
    const results = check({
      frontend,
      backend,
      endpoint: replaceOnce(endpoint, "url: `", `${property} url: \``),
    });
    expect(statuses(results)).toEqual({
      [`${ENDPOINT_ID}:endpoint`]: "unverified",
    });
  });

  it("should refuse to compare contracts with strict null checking disabled", () => {
    expect(() =>
      check({
        frontend,
        backend,
        endpoint,
        options: { strictNullChecks: false },
      }),
    ).toThrow(/strictNullChecks/);
  });

  it("should fail on malformed generated declarations rather than checking a partial AST", () => {
    expect(() =>
      check({
        frontend,
        backend: `${backend}\nexport type Broken = ;`,
        endpoint,
      }),
    ).toThrow(/Type expected/);
  });

  it("should find multiple independent nested field mismatches", () => {
    const results = check({
      frontend: replaceOnce(
        replaceOnce(frontend, "string | null", "string"),
        "id: number",
        "id: string",
      ),
      backend,
      endpoint,
    });
    const response = resultFor(results, "response.2XX");
    expect(response?.status).toBe("mismatch");
    expect(response?.message).toMatch(/nodes\[\]\.owner\.email/);
    expect(response?.message).toMatch(/nodes\[\]\.fields\[\]\.id/);
  });

  it("should explain optional-property presence independently of its value type", () => {
    const results = check({
      frontend: "type ErdResponse = { label: string | undefined };",
      backend: withResponse("{ label?: string }"),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "mismatch",
      message: expect.stringMatching(/label.*optional.*required/),
    });
  });

  it("should accept primitive aliases and response subsets without copying generated entities", () => {
    const results = check({
      frontend: 'type ErdResponse = { schema: "yo" };',
      backend: withResponse(
        "{ schema: XYZ; unused: { deep: number } }",
        'type XYZ = "yo";',
      ),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")?.status).toBe("compatible");
  });

  it.each([
    {
      name: "should reject optional frontend fields absent from the backend schema",
      frontend: "{ id: number; email?: string }",
      backend: "{ id: number }",
      missing: "$.email",
    },
    {
      name: "should check optional nested fields through nullable aliases and readonly arrays",
      frontend:
        "{ nodes: ReadonlyArray<{ owner?: { email: string; nickname?: string } | null }> }",
      backend: "{ nodes: { owner: { email: string } | null }[] }",
      missing: "$.nodes[].owner.nickname",
    },
    {
      name: "should not borrow an optional field from a different discriminated variant",
      frontend:
        '{ kind: "ok"; error?: string } | { kind: "error"; error: string }',
      backend: '{ kind: "ok" } | { kind: "error"; error: string }',
      missing: "$.error",
    },
    {
      name: "should check tuple fields at their own positions",
      frontend: "[{ id: number; email?: string }, { email: string }]",
      backend: "[{ id: number }, { email: string }]",
      missing: "$[0].email",
    },
    {
      name: "should check nested fields in dictionaries",
      frontend: "{ users: Record<string, { id: number; nickname?: string }> }",
      backend: "{ users: Record<string, { id: number }> }",
      missing: "$.users[key].nickname",
    },
    {
      name: "should reject a frontend dictionary unsupported by the backend schema",
      frontend: "{ users: Record<string, { id: number }> }",
      backend: "{ users: { alice: { id: number } } }",
      missing: "$.users[key]",
    },
    {
      name: "should check whether named properties match backend template index signatures",
      frontend: '{ metadata: { "x-id"?: string; other?: string } }',
      backend: "{ metadata: { [key: `x-${string}`]: string } }",
      missing: "$.metadata.other",
    },
    {
      name: "should not use numeric index signatures to justify nonnumeric properties",
      frontend: "{ values: { 0?: string; extra?: string } }",
      backend: "{ values: { [key: number]: string } }",
      missing: "$.values.extra",
    },
  ])("$name", (sample) => {
    const results = check({
      frontend: `type ErdResponse = ${sample.frontend};`,
      backend: withResponse(sample.backend),
      endpoint,
    });
    const response = resultFor(results, "response.2XX");
    expect(response?.status).toBe("mismatch");
    expect(response?.message).toContain(sample.missing);
    expect(response?.message).toMatch(/not declared in the backend/);
  });

  it.each([
    {
      name: "should allow the frontend to omit backend fields at every level",
      frontend: "{ nodes: { owner: { email?: string } }[] }",
      backend:
        "{ nodes: { id: number; owner: { email: string; name: string } }[]; count: number }",
    },
    {
      name: "should allow an optional field declared in one compatible backend union variant",
      frontend: '{ kind: "ok" | "error"; data?: { id: number } }',
      backend:
        '{ kind: "ok"; data: { id: number; name: string } } | { kind: "error" }',
    },
    {
      name: "should accept independently named discriminated unions with nested subsets",
      frontend:
        '{ kind: "ok"; data: { id: number } } | { kind: "error"; message: string }',
      backend:
        '{ kind: "ok"; data: { id: number; name: string } } | { kind: "error"; message: string; code: number }',
    },
    {
      name: "should accept a named optional property supported by a backend index signature",
      frontend: "{ users: { alice?: { id: number } } }",
      backend: "{ users: Record<string, { id: number; name: string }> }",
    },
  ])("$name", (sample) => {
    const results = check({
      frontend: `type ErdResponse = ${sample.frontend};`,
      backend: withResponse(sample.backend),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "compatible",
    });
  });

  it("should check optional field values supplied by a backend index signature", () => {
    const results = check({
      frontend: 'type ErdResponse = { metadata: { "x-id"?: string } };',
      backend: withResponse("{ metadata: { [key: `x-${string}`]: number } }"),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "mismatch",
      message: expect.stringMatching(/metadata.x-id.*number.*not assignable/),
    });
  });

  it("should check separate occurrences of a shared frontend alias against their own backend shapes", () => {
    const results = check({
      frontend:
        "type Shared = { id: number; name?: string }; type ErdResponse = { first: Shared; second: Shared };",
      backend: withResponse(
        "{ first: { id: number; name: string }; second: { id: number } }",
      ),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "mismatch",
      message: expect.stringMatching(/second.name.*not declared/),
    });
  });

  it("should check fields after revisiting recursive aliases", () => {
    const results = check({
      frontend:
        "type Tree = { id: number; children: Tree[]; name?: string }; type ErdResponse = Tree;",
      backend: withResponse(
        "Branch",
        "type Branch = { id: number; children: Branch[] };",
      ),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "mismatch",
      message: expect.stringMatching(/name.*not declared/),
    });
  });

  it("should keep unmatched frontend object variants unverified", () => {
    const results = check({
      frontend:
        'type ErdResponse = { kind: "ok" } | { kind: "error"; message?: string };',
      backend: withResponse('{ kind: "ok" }'),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "unverified",
      message: expect.stringMatching(/union variant/),
    });
  });

  it("should terminate when recursive backend variants share the same child types", () => {
    const results = check({
      frontend:
        'type Tree = { kind: "a" | "b"; children: Tree[] }; type ErdResponse = Tree;',
      backend: withResponse(
        "Branch",
        'type Branch = { kind: "a"; children: Branch[] } | { kind: "b"; children: Branch[] };',
      ),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "compatible",
    });
  });

  it("should resolve differently named nested entities without importing generated types into the frontend", () => {
    const results = check({ frontend, backend, endpoint });
    expect(results.map((result) => result.status)).toEqual([
      "compatible",
      "compatible",
      "compatible",
      "compatible",
    ]);
  });

  it("should reject a nullable field several referenced entities deep", () => {
    const results = check({
      frontend: replaceOnce(frontend, "string | null", "string"),
      backend,
      endpoint,
    });
    expect(resultFor(results, "response.2XX")?.status).toBe("mismatch");
  });

  it("should check every union response variant, including missing fields on failures", () => {
    const results = check({
      frontend,
      backend: withResponse("{ nodes: Node[] } | { error: string }"),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")?.status).toBe("mismatch");
  });

  it("should compare a scalar query argument with its actual path slot, including URL encoding", () => {
    const results = check({
      frontend,
      backend,
      endpoint: replaceOnce(endpoint, "${id}", "${encodeURIComponent(id)}"),
    });
    expect(resultFor(results, "request.path.0")?.status).toBe("compatible");
  });

  it("should reject an incompatible path value despite different parameter names", () => {
    const results = check({
      frontend,
      backend,
      endpoint: replaceOnce(
        endpoint,
        "ErdResponse, number",
        "ErdResponse, string",
      ),
    });
    expect(resultFor(results, "request.path.0")?.status).toBe("mismatch");
  });

  it("should check the query object constructed by the mapper", () => {
    const results = check({
      frontend,
      backend,
      endpoint: replaceOnce(
        endpoint,
        "url: `",
        "params: { schema: 123 }, url: `",
      ),
    });
    expect(resultFor(results, "request.query")?.status).toBe("mismatch");
  });

  it("should not accept a missing required body", () => {
    const results = check({
      frontend,
      backend: replaceOnce(backend, "body?: never", "body: { name: string }"),
      endpoint,
    });
    expect(resultFor(results, "request.body")?.status).toBe("mismatch");
  });

  it("should mark transformed responses unverified instead of comparing the transformed result to the wire response", () => {
    const results = check({
      frontend,
      backend,
      endpoint: replaceOnce(
        endpoint,
        "query: id",
        "transformResponse: () => ({ nodes: [] }), query: id",
      ),
    });
    expect(resultFor(results, "response")?.status).toBe("unverified");
  });

  it("should record intentional response discards separately from compatibility", () => {
    const results = check({
      frontend,
      backend,
      endpoint: replaceOnce(endpoint, "ErdResponse,", "void,"),
    });
    expect(resultFor(results, "response")?.status).toBe("ignored");
  });

  it.each(["any", "unknown", "MissingType"])(
    "should never report a contract containing %s as verified",
    (loose) => {
      const results = check({
        frontend: replaceOnce(frontend, "string | null", loose),
        backend,
        endpoint,
      });
      expect(resultFor(results, "response.2XX")?.status).toBe("unverified");
    },
  );

  it("should report dynamic requests as coverage gaps", () => {
    const results = check({
      frontend,
      backend,
      endpoint: "builder.query<ErdResponse, number>({ queryFn: () => ({}) })",
    });
    expect(statuses(results)).toEqual({
      [`${ENDPOINT_ID}:endpoint`]: "unverified",
    });
  });

  it("should match by HTTP method as well as URL", () => {
    const results = check({
      frontend,
      backend,
      endpoint: replaceOnce(endpoint, "url: `", 'method: "POST", url: `'),
    });
    expect(results).toEqual([
      expect.objectContaining({
        id: `${ENDPOINT_ID}:endpoint`,
        status: "unverified",
        message: expect.stringMatching(/No generated operation for POST/),
      }),
    ]);
  });

  it("should support recursive component references without copying or infinitely expanding them", () => {
    const results = check({
      frontend:
        "type Tree = { id: number; children: Tree[] }; type ErdResponse = Tree;",
      backend: withResponse(
        "Branch",
        "export type Branch = { id: number; children: Branch[] };",
      ),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")?.status).toBe("compatible");
  });

  it("should fail closed when generation produces no recognizable operations", () => {
    expect(() =>
      check({ frontend, backend: "export type Nothing = {};", endpoint }),
    ).toThrow(/No operations found/);
  });
});

describe("diagnostic messages", () => {
  const route = "GET /api/erd/{database-id}";

  it("should name the backend and frontend types in a response mismatch", () => {
    const results = check({
      frontend: "interface ErdResponse { label: string }",
      backend: withResponse("{ label: number }"),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      "$.label (endpoint.ts:10 ErdResponse.label): backend type number is not assignable to frontend type string",
    ]);
  });

  it("should name the frontend and backend types in a request mismatch", () => {
    const results = check({
      frontend,
      backend,
      endpoint: replaceOnce(
        endpoint,
        "ErdResponse, number",
        "ErdResponse, string",
      ),
    });
    expect(messageFor(results, "request.path.0")).toEqual([
      "$: frontend type string is not assignable to backend type number",
    ]);
  });

  it("should name the sides of a property missing from the backend response", () => {
    const results = check({
      frontend: "interface ErdResponse { label: string }",
      backend: withResponse("{ other: string }"),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      "$.label (endpoint.ts:10 ErdResponse.label): property required by the frontend type is missing from the backend type",
    ]);
  });

  it("should name the sides of a property missing from the frontend request", () => {
    const results = check({
      frontend,
      backend: replaceOnce(
        backend,
        "query?: { schema?: string }",
        "query: { schema: string }",
      ),
      endpoint: replaceOnce(
        endpoint,
        "url: `",
        'params: { other: "x" }, url: `',
      ),
    });
    expect(messageFor(results, "request.query")).toEqual([
      "$.schema: property required by the backend type is missing from the frontend type",
      "$.other (endpoint.ts:14): frontend sends a field the backend type does not declare",
    ]);
  });

  it("should name the sides of a property that is optional in the backend response", () => {
    const results = check({
      frontend: "interface ErdResponse { label: string | undefined }",
      backend: withResponse("{ label?: string }"),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      "$.label (endpoint.ts:10 ErdResponse.label): property is optional in the backend type but required by the frontend type",
    ]);
  });

  it("should name the sides of a property that is optional in the frontend request", () => {
    const results = check({
      frontend: `${frontend} type Query = { schema?: string }; declare const query: Query;`,
      backend: replaceOnce(
        backend,
        "query?: { schema?: string }",
        "query: { schema: string }",
      ),
      endpoint: replaceOnce(endpoint, "url: `", "params: query, url: `"),
    });
    expect(messageFor(results, "request.query")).toEqual([
      expect.stringMatching(
        /^\$\.schema \(endpoint\.ts:\d+ Query\.schema\): property is optional in the frontend type but required by the backend type$/,
      ),
    ]);
  });

  it("should name the route, part and side of an unconstrained backend type", () => {
    const results = check({
      frontend,
      backend: withResponse("unknown"),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      `Unconstrained or unresolved types in ${route} response 2XX:`,
      "$: backend type unknown",
    ]);
  });

  it("should locate an unconstrained frontend field", () => {
    const results = check({
      frontend: "interface ErdResponse { nodes: any }",
      backend,
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      `Unconstrained or unresolved types in ${route} response 2XX:`,
      "ErdResponse.nodes (endpoint.ts:10): frontend type any at $.nodes",
    ]);
  });

  it("should list every unconstrained declaration on both sides", () => {
    const results = check({
      frontend:
        "interface ErdResponse { label: any; nodes: { owner: unknown }[] }",
      backend: withResponse(
        "{ label: unknown; nodes: { owner: string }[]; extra: unknown }",
      ),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      `Unconstrained or unresolved types in ${route} response 2XX:`,
      "extra (types.gen.d.ts:10:92): backend type unknown at $.extra",
      "label (types.gen.d.ts:10:48): backend type unknown at $.label",
      "ErdResponse.label (endpoint.ts:10): frontend type any at $.label",
      "owner (endpoint.ts:10:50): frontend type unknown at $.nodes[].owner",
    ]);
  });

  it("should list an unconstrained declaration once, at the shortest path that reaches it", () => {
    const results = check({
      frontend,
      backend: withResponse(
        "{ second: Shared; first: Shared; nodes: Node[]; list: Shared[] }",
        "type Shared = { value: unknown };",
      ),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      `Unconstrained or unresolved types in ${route} response 2XX:`,
      "Shared.value (types.gen.d.ts:10): backend type unknown at $.second.value",
    ]);
  });

  it("should stop where a recursive type repeats", () => {
    const results = check({
      frontend,
      backend: withResponse(
        "Tree",
        "type Tree = { value: unknown; children: Tree[]; meta: Record<string, unknown> };",
      ),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      `Unconstrained or unresolved types in ${route} response 2XX:`,
      "Tree.value (types.gen.d.ts:10): backend type unknown at $.value",
      "$.meta[key]: backend type unknown",
    ]);
  });

  it("should name the path parameter of an unconstrained backend path type", () => {
    const results = check({
      frontend,
      backend: replaceOnce(
        backend,
        'path: { "database-id": number }',
        'path: { "database-id": unknown }',
      ),
      endpoint,
    });
    expect(messageFor(results, "request.path.0")).toEqual([
      `Unconstrained or unresolved types in ${route} request path parameter database-id:`,
      "$: backend type unknown",
    ]);
  });

  it("should locate a frontend index signature missing from the backend", () => {
    const results = check({
      frontend:
        "interface ErdResponse { users: Users } interface Users { [key: string]: { id: number } }",
      backend: withResponse("{ users: { alice: { id: number } } }"),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      "$.users[key] (endpoint.ts:10 Users[key]): frontend index signature is not declared in the backend schema.",
    ]);
  });

  it("should give only the location of a field declared in a nested type literal", () => {
    const results = check({
      frontend: "type ErdResponse = { meta: { label: string } };",
      backend: withResponse("{ meta: { label: number } }"),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      "$.meta.label (endpoint.ts:10): backend type number is not assignable to frontend type string",
    ]);
  });

  it("should keep only the path for a field without a declaration", () => {
    const results = check({
      frontend: 'type ErdResponse = Record<"label", string>;',
      backend: withResponse("{ label: number }"),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      "$.label: backend type number is not assignable to frontend type string",
    ]);
  });

  it("should name the frontend union variant that no backend type matches", () => {
    const results = check({
      frontend:
        'type ErdResponse = { kind: "ok" } | { kind: "error"; message?: string };',
      backend: withResponse('{ kind: "ok" }'),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      '$: cannot establish frontend field coverage for frontend union variant { kind: "error"; message?: string | undefined; }, which no backend type at this position is assignable to.',
    ]);
  });

  it("should list every mismatch", () => {
    const names = "abcdefg".split("");
    const results = check({
      frontend: `interface ErdResponse { ${names.map((name) => `${name}: string;`).join(" ")} }`,
      backend: withResponse(
        `{ ${names.map((name) => `${name}: number;`).join(" ")} }`,
      ),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual(
      names.map(
        (name) =>
          `$.${name} (endpoint.ts:10 ErdResponse.${name}): backend type number is not assignable to frontend type string`,
      ),
    );
  });

  it("should report a deeply nested mismatch at its own path", () => {
    const depth = 12;
    const nest = (leaf: string) =>
      Array.from({ length: depth }).reduce<string>(
        (inner) => `{ child: ${inner} }`,
        `{ label: ${leaf} }`,
      );
    const results = check({
      frontend: `type ErdResponse = ${nest("string")};`,
      backend: withResponse(nest("number")),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      `$${".child".repeat(depth)}.label (endpoint.ts:10): backend type number is not assignable to frontend type string`,
    ]);
  });

  it("should report a recursive mismatch once, where the types first repeat", () => {
    const results = check({
      frontend:
        "interface Tree { name: string; children: Tree[] } type ErdResponse = Tree;",
      backend: withResponse(
        "Branch",
        "type Branch = { name: number; children: Branch[] };",
      ),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      "$.name (endpoint.ts:10 Tree.name): backend type number is not assignable to frontend type string",
    ]);
  });

  it("should list every frontend field missing from the backend", () => {
    const results = check({
      frontend: "interface ErdResponse { id: number; a?: string; b?: string }",
      backend: withResponse("{ id: number }"),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "mismatch",
      message: [
        "$.a (endpoint.ts:10 ErdResponse.a): frontend field is not declared in the backend schema.",
        "$.b (endpoint.ts:10 ErdResponse.b): frontend field is not declared in the backend schema.",
      ].join("\n  "),
    });
  });

  it("should report a mismatch alongside an unverified field coverage problem", () => {
    const results = check({
      frontend:
        'interface ErdResponse { extra?: string; item: { kind: "ok" } | { kind: "error" } }',
      backend: withResponse('{ item: { kind: "ok" } }'),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "mismatch",
      message: [
        "$.extra (endpoint.ts:10 ErdResponse.extra): frontend field is not declared in the backend schema.",
        '$.item (endpoint.ts:10 ErdResponse.item): cannot establish frontend field coverage for frontend union variant { kind: "error"; }, which no backend type at this position is assignable to.',
      ].join("\n  "),
    });
  });

  it("should reference a repeated disagreement that was actually reported", () => {
    const results = check({
      frontend:
        "interface Owner { id: number; nickname?: string } interface ErdResponse { first: Owner; second: Owner }",
      backend: withResponse(
        "{ first: BackendOwner; second: BackendOwner }",
        "type BackendOwner = { id: number };",
      ),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")).toMatchObject({
      status: "mismatch",
      message: [
        "$.first.nickname (endpoint.ts:10 Owner.nickname): frontend field is not declared in the backend schema.",
        "$.second (endpoint.ts:10 ErdResponse.second): same problems as at $.first",
      ].join("\n  "),
    });
  });

  it("should not point to an earlier path whose shape had no problems", () => {
    const results = check({
      frontend:
        "interface Owner { id: number } interface ErdResponse { first: Owner; second: Owner }",
      backend: withResponse(
        "{ first: BackendOwner; second: BackendOwner }",
        "type BackendOwner = { id: number };",
      ),
      endpoint,
    });
    expect(resultFor(results, "response.2XX")?.message).toBe("Compatible");
  });

  it("should stay unverified when every field coverage problem is unverified", () => {
    const results = check({
      frontend:
        'interface ErdResponse { first: { kind: "ok" } | { kind: "error" }; second: { kind: "ok" } | { kind: "error" } }',
      backend: withResponse(
        '{ first: { kind: "ok" }; second: { kind: "ok" } }',
      ),
      endpoint,
    });
    expect(messageFor(results, "response.2XX")).toEqual([
      '$.first (endpoint.ts:10 ErdResponse.first): cannot establish frontend field coverage for frontend union variant { kind: "error"; }, which no backend type at this position is assignable to.',
      '$.second (endpoint.ts:10 ErdResponse.second): cannot establish frontend field coverage for frontend union variant { kind: "error"; }, which no backend type at this position is assignable to.',
    ]);
    expect(resultFor(results, "response.2XX")?.status).toBe("unverified");
  });
});

describe("walks that do not finish", () => {
  const growing = "type Grow<T> = { value: T; next: Grow<T[]> };";

  function checkWith(
    frontendTypes: string,
    backendTypes: string,
    options: Parameters<typeof checkContracts>[4],
    configureChecker?: (checker: ts.TypeChecker) => void,
  ) {
    const { root, files, program } = programFrom({
      "endpoint.ts": `${ENDPOINT_BUILDER}
      ${frontendTypes}
      const endpoints = { example: ${endpoint} };
    `,
      "types.gen.d.ts": backendTypes,
    });
    configureChecker?.(program.getTypeChecker());
    return () =>
      checkContracts(
        program,
        [files["endpoint.ts"] ?? ""],
        files["types.gen.d.ts"] ?? "",
        root,
        options,
      );
  }

  it("should stop the run with the check, type and path when a walk goes past its step budget", () => {
    const run = checkWith(
      "type ErdResponse = { first: { value: unknown }; second: { value: unknown } };",
      withResponse("{ first: { value: string } }"),
      { walkStepBudget: 3 },
    );
    expect(run).toThrow(TypeWalkError);
    expect(run).toThrow(
      "API contract check endpoints:example:response.2XX stopped: the unconstrained type walk went past its budget of 3 steps at $.second in type { value: unknown; } (ErdResponse.second (endpoint.ts:10))",
    );
  });

  it("should stop the run on a type that grows each time it recurs", () => {
    const run = checkWith(
      `${growing} type ErdResponse = Grow<string>;`,
      withResponse("Node", "export type Node = { value: string; next: Node };"),
      { walkDepthBudget: 50 },
    );
    expect(run).toThrow(
      /^API contract check endpoints:example:response\.2XX stopped: the unconstrained type walk went past its depth budget of 50 at \$\.next×\d+/,
    );
  });

  it("should report a stack overflow inside a walk with the check, type and path", () => {
    let calls = 0;
    const run = checkWith(
      "type ErdResponse = { nodes: { owner: { email: number } }[] };",
      backend,
      {},
      (checker) => {
        const assignable = checker.isTypeAssignableTo.bind(checker);
        jest
          .spyOn(checker, "isTypeAssignableTo")
          .mockImplementation((from, to) => {
            calls += 1;
            if (calls > 1) {
              throw new RangeError("Maximum call stack size exceeded");
            }
            return assignable(from, to);
          });
      },
    );
    expect(run).toThrow(
      /^API contract check endpoints:example:response\.2XX stopped: the field walk overflowed the call stack at \$/,
    );
  });

  it("should report a stack overflow outside a walk with the check", () => {
    const run = checkWith(
      "type ErdResponse = { nodes: { owner: { email: number } }[] };",
      backend,
      {},
      (checker) => {
        const symbolType = checker.getTypeOfSymbolAtLocation.bind(checker);
        jest
          .spyOn(checker, "getTypeOfSymbolAtLocation")
          .mockImplementation((symbol, node) => {
            if (symbol.name === "2XX") {
              throw new RangeError("Maximum call stack size exceeded");
            }
            return symbolType(symbol, node);
          });
      },
    );
    expect(run).toThrow(
      "API contract check endpoints:example:response.2XX stopped: the call stack overflowed outside a type walk",
    );
  });
});

describe("type printing order", () => {
  const orderedBackend = (members: string) =>
    replaceOnce(
      backend,
      "query?: { schema?: string };",
      `query?: { schema?: ${members} };`,
    );
  const orderedEndpoint = (members: string) =>
    `builder.query<ErdResponse, { id: number; schema: ${members} }>({ query: ({ id, schema }) => ({ url: \`/api/erd/\${id}\`, params: { schema } }) })`;

  it("should print unions the same however their members were first written", () => {
    const written = check({
      frontend,
      backend: orderedBackend('"p" | "q" | "r"'),
      endpoint: orderedEndpoint('"s" | "t"'),
    });
    const reversed = check({
      frontend,
      backend: orderedBackend('"r" | "q" | "p"'),
      endpoint: orderedEndpoint('"t" | "s"'),
    });
    expect(resultFor(reversed, "request.query")?.message).toEqual(
      resultFor(written, "request.query")?.message,
    );
    expect(resultFor(written, "request.query")?.message.split("\n  ")).toEqual([
      '$.schema (endpoint.ts:14): frontend type "s" is not assignable to backend type "p" | "q" | "r" | undefined',
      '$.schema (endpoint.ts:14): frontend type "t" is not assignable to backend type "p" | "q" | "r" | undefined',
    ]);
  });

  function checkInBothOrders(
    backendDeclarations: string,
    endpoints: Record<string, { declarations: string; endpoint: string }>,
  ) {
    const { root, files } = programFrom(
      {
        "types.gen.d.ts": backendDeclarations,
        ...Object.fromEntries(
          Object.entries(endpoints).map(
            ([name, { declarations, endpoint }]) => [
              `${name}.ts`,
              `
          export {};
          ${ENDPOINT_BUILDER}
          ${declarations}
          const ${name}Endpoints = { example: ${endpoint} };
        `,
            ],
          ),
        ),
      },
      { checked: [] },
    );
    const generated = files["types.gen.d.ts"] ?? "";
    const endpointFiles = Object.values(files).filter(
      (file) => file !== generated,
    );
    // The program is built twice, so the order the endpoint files are read in is what changes.
    const run = (ordered: string[]) =>
      checkContracts(
        ts.createProgram([...ordered, generated], COMPILER_OPTIONS),
        ordered,
        generated,
        root,
      );
    return {
      inOrder: run(endpointFiles),
      reversed: run([...endpointFiles].reverse()),
    };
  }

  it("should give the same results whichever endpoint file is checked first", () => {
    const { inOrder, reversed } = checkInBothOrders(
      orderedBackend('"p" | "q" | "r"'),
      {
        left: {
          declarations: frontend,
          endpoint: orderedEndpoint('"s" | "t" | "r"'),
        },
        right: {
          declarations: frontend,
          endpoint: orderedEndpoint('"t" | "r" | "s"'),
        },
      },
    );
    expect(reversed).toEqual(inOrder);
  });

  it("should list mapped type properties the same whichever key type was created first", () => {
    const { inOrder, reversed } = checkInBothOrders(
      withResponse("{ a: number; b: number }"),
      {
        keys: {
          declarations: 'type ErdResponse = Record<"b" | "a", number>;',
          endpoint,
        },
        picked: {
          declarations:
            'interface Card { a: string; b: string }\n          type ErdResponse = Pick<Card, "a" | "b">;',
          endpoint,
        },
      },
    );
    expect(reversed).toEqual(inOrder);
    expect(
      inOrder
        .find((result) => result.id === "pickedEndpoints:example:response.2XX")
        ?.message.split("\n  "),
    ).toEqual([
      "$.a (picked.ts:12 Card.a): backend type number is not assignable to frontend type string",
      "$.b (picked.ts:12 Card.b): backend type number is not assignable to frontend type string",
    ]);
  });
});

describe("request comparison rules", () => {
  const frontend = "type ErdResponse = { id: number };";

  it.each([
    [
      "undefined params",
      "undefined",
      '{ url: "/api/user", params: arg }',
      "Get",
      "query: { required: string }",
      "request.query",
      "mismatch",
    ],
    [
      "undefined params with a body",
      "undefined",
      '{ method: "POST", url: "/api/user", params: arg, body: { bad: 1 } }',
      "Post",
      "body: { required: string }",
      "request.body",
      "mismatch",
    ],
    [
      "duplicate inline query keys",
      "void",
      '{ url: "/api/user?flag=true&flag=oops" }',
      "Get",
      "query: { flag: boolean }",
      "request.query",
      "unverified",
    ],
    [
      "converted union member",
      '{ kind: "a"; date: Date }',
      '{ method: "POST", url: "/api/user", body: arg }',
      "Post",
      'body: { kind: "a"; date: string } | { kind: "b"; count: number }',
      "request.body",
      "compatible",
    ],
    [
      "mixed union members",
      '{ kind: "a"; count: number }',
      '{ method: "POST", url: "/api/user", body: arg }',
      "Post",
      'body: { kind: "a"; date: string } | { kind: "b"; count: number }',
      "request.body",
      "mismatch",
    ],
    [
      "unsupported conversion against a union",
      "{ value: { toJSON(): { id: string } } }",
      '{ method: "POST", url: "/api/user", body: arg }',
      "Post",
      "body: { value: { id: string } } | { value: { name: string } }",
      "request.body",
      "unverified",
    ],
    [
      "optional symbol",
      "{ inner: { a?: string | symbol; b: number } }",
      '{ method: "POST", url: "/api/user", body: arg }',
      "Post",
      "body: { inner: { a?: string; b: number } }",
      "request.body",
      "compatible",
    ],
    [
      "optional function",
      "{ inner: { a?: string | (() => void); b: number } }",
      '{ method: "POST", url: "/api/user", body: arg }',
      "Post",
      "body: { inner: { a?: string; b: number } }",
      "request.body",
      "compatible",
    ],
    [
      "JSON index signatures",
      "{ inner: { a: Date; [key: string]: unknown } }",
      '{ method: "POST", url: "/api/user", body: arg }',
      "Post",
      "body: { inner: { a: string } }",
      "request.body",
      "unverified",
    ],
    [
      "own toJSON",
      "{ id: number; toJSON: () => { name: string } }",
      '{ method: "POST", url: "/api/user", body: arg }',
      "Post",
      "body: { id: number }",
      "request.body",
      "unverified",
    ],
    [
      "branded primitive",
      'string & { readonly __brand: "Id" }',
      '{ method: "POST", url: "/api/user", body: { id: arg } }',
      "Post",
      'body: { id: { length: number; __brand: "Id" } }',
      "request.body",
      "mismatch",
    ],
    [
      "own getter",
      "{ inner: { get a(): number } }",
      '{ method: "POST", url: "/api/user", body: arg }',
      "Post",
      "body: { inner: { a: number } }",
      "request.body",
      "compatible",
    ],
  ])(
    "should handle %s without a false verdict",
    (_name, argument, expression, method, contract, part, status) => {
      const results = check({
        frontend: `${frontend} type Args = ${argument};`,
        backend: `export type ${method}UserData = { url: "/api/user"; ${contract} }; export type ${method}UserResponses = { "2XX": { id: number } };`,
        endpoint: request("Args", `arg => (${expression})`),
      });
      expect(resultFor(results, part)?.status).toBe(status);
    },
  );

  function operation({
    method = "Get",
    url = "/api/user",
    path = "path?: never",
    query = "query?: never",
    body = "body?: never",
  } = {}) {
    return `
      export type ${method}UserData = { url: "${url}"; ${body}; ${query}; ${path} };
      export type ${method}UserResponses = { "2XX": { id: number } };
    `;
  }

  function request(argument: string, query: string) {
    return `builder.query<ErdResponse, ${argument}>({ query: ${query} })`;
  }

  it("should inspect nested cache keys after removing the top-level key", () => {
    const results = check({
      frontend: `${frontend} type Args = { __rtkCacheKey?: unknown; child?: Args };`,
      backend: `type Backend = { __rtkCacheKey?: string; child?: Backend }; ${operation({ method: "Post", body: "body: { child?: Backend }" })}`,
      endpoint: request(
        "Args",
        '(body) => ({ method: "POST", url: "/api/user", body })',
      ),
    });
    expect(resultFor(results, "request.body")?.status).toBe("unverified");
  });

  it("should leave conversions in a recursive JSON body unverified", () => {
    const results = check({
      frontend: `${frontend} interface TreeNode { date: Date; children: TreeNode[] }`,
      backend: `type BackendNode = { date: string; children: BackendNode[] }; ${operation({ method: "Post", body: "body: BackendNode" })}`,
      endpoint: request(
        "TreeNode",
        '(body) => ({ method: "POST", url: "/api/user", body })',
      ),
    });
    expect(resultFor(results, "request.body")).toMatchObject({
      status: "unverified",
      message: expect.stringContaining(
        "JSON conversions inside a recursive type",
      ),
    });
  });

  it("should finish JSON modelling when a small type graph has millions of paths", () => {
    const graph = ["type T0 = { value: string | undefined };"];
    for (let depth = 1; depth <= 24; depth++) {
      graph.push(`type T${depth} = { a: T${depth - 1}; b: T${depth - 1} };`);
    }
    const results = check({
      frontend: `${frontend} ${graph.join("\n")}`,
      backend: `${graph.join("\n")} ${operation({ method: "Post", body: "body: T24" })}`,
      endpoint: request(
        "T24",
        '(body) => ({ method: "POST", url: "/api/user", body })',
      ),
    });
    expect(resultFor(results, "request.body")?.status).toBe("mismatch");
  });

  it("should compare the text String gives for query values", () => {
    const results = check({
      frontend,
      backend: operation({
        query: "query: { ids: number[]; archived: boolean; limit: number }",
      }),
      endpoint: request(
        "{ ids: (number | null)[]; archived: boolean; limit: number }",
        '(params) => ({ url: "/api/user", params })',
      ),
    });
    const result = resultFor(results, "request.query");
    expect(result?.status).toBe("mismatch");
    expect(result?.message.split("\n  ")).toEqual(
      expect.arrayContaining([
        "$.ids (endpoint.ts:11): property is optional in the frontend type but required by the backend type",
        '$.ids[] (endpoint.ts:11): frontend value "null" is not assignable to backend type number',
      ]),
    );
  });

  it("should compare a recursive JSON body from the declared type at the point it recurs", () => {
    const recursive = (backend: string) =>
      check({
        frontend: `${frontend} interface TreeNode { id: number; children: TreeNode[] }`,
        backend: `export type BackendNode = ${backend}; ${operation({ method: "Post", body: "body: BackendNode" })}`,
        endpoint: request(
          "TreeNode",
          '(body) => ({ method: "POST", url: "/api/user", body })',
        ),
      });
    expect(
      resultFor(
        recursive("{ id: number; children: BackendNode[] }"),
        "request.body",
      )?.status,
    ).toBe("compatible");
    expect(
      resultFor(
        recursive("{ id: string; children: BackendNode[] }"),
        "request.body",
      )?.status,
    ).toBe("mismatch");
  });

  it("should reject a query key the backend type does not declare", () => {
    const results = check({
      frontend,
      backend: operation({ query: "query?: { other?: boolean }" }),
      endpoint: request(
        "{ ignore_view: boolean }",
        '(params) => ({ url: "/api/user", params })',
      ),
    });
    expect(resultFor(results, "request.query")).toMatchObject({
      status: "mismatch",
      message: expect.stringContaining(
        "$.ignore_view (endpoint.ts:11): frontend sends a field the backend type does not declare",
      ),
    });
  });

  it("should reject a body key the backend type does not declare, at any depth", () => {
    const results = check({
      frontend,
      backend: operation({
        method: "Post",
        body: "body: { user: { name: string } }",
      }),
      endpoint: request(
        "{ user: { name: string; nickname: string } }",
        '(body) => ({ method: "POST", url: "/api/user", body })',
      ),
    });
    expect(resultFor(results, "request.body")).toMatchObject({
      status: "mismatch",
      message: expect.stringContaining(
        "$.user.nickname (endpoint.ts:11): frontend sends a field the backend type does not declare",
      ),
    });
  });

  it("should accept a sent key the backend takes through an index signature", () => {
    const results = check({
      frontend,
      backend: operation({
        method: "Post",
        body: "body: { user: { [key: string]: string } }",
      }),
      endpoint: request(
        "{ user: { name: string } }",
        '(body) => ({ method: "POST", url: "/api/user", body })',
      ),
    });
    expect(resultFor(results, "request.body")?.status).toBe("compatible");
  });

  it("should accept numeric keys through a string index signature, since JSON keys are text", () => {
    const results = check({
      frontend,
      backend: operation({
        method: "Post",
        body: "body: { collections: { [key: string]: boolean } | null }",
      }),
      endpoint: request(
        "{ collections: Record<number, boolean> }",
        '(body) => ({ method: "POST", url: "/api/user", body })',
      ),
    });
    expect(resultFor(results, "request.body")?.status).toBe("compatible");
  });

  it("should accept an optional backend field the frontend does not send", () => {
    const results = check({
      frontend,
      backend: operation({
        method: "Post",
        body: "body: { name: string; nickname?: string }",
      }),
      endpoint: request(
        "{ name: string }",
        '(body) => ({ method: "POST", url: "/api/user", body })',
      ),
    });
    expect(resultFor(results, "request.body")?.status).toBe("compatible");
  });

  it("should compare the text String gives for a URL tag with the backend path parameter", () => {
    const results = check({
      frontend,
      backend: operation({
        url: "/api/user/{id}",
        path: "path: { id: number }",
      }),
      endpoint: request(
        "{ id: boolean }",
        '(params) => ({ url: "/api/user/:id", params })',
      ),
    });
    expect(messageFor(results, "request.path.0")).toEqual([
      '$: frontend value "false" is not assignable to backend type number',
      '$: frontend value "true" is not assignable to backend type number',
    ]);
    // The notes name the client rules that produced the texts.
    expect(resultFor(results, "request.path.0")?.message).toMatch(
      /\n {2}note: .*substituteUrlTags/,
    );
  });

  it("should compare the text String gives for a template span with the backend path parameter", () => {
    const results = check({
      frontend,
      backend: operation({
        url: "/api/user/{id}",
        path: "path: { id: number }",
      }),
      endpoint: request("boolean", "(flag) => ({ url: `/api/user/${flag}` })"),
    });
    expect(messageFor(results, "request.path.0")).toEqual([
      '$: frontend value "false" is not assignable to backend type number',
      '$: frontend value "true" is not assignable to backend type number',
    ]);
  });

  it("should send no query parameters for a void params argument", () => {
    const results = check({
      frontend,
      backend: operation(),
      endpoint: request("void", '(params) => ({ url: "/api/user", params })'),
    });
    expect(resultFor(results, "request.query")?.status).toBe("compatible");
  });

  it("should still check the object part of a params argument that may be void", () => {
    const results = check({
      frontend,
      backend: operation(),
      endpoint: request(
        "{ limit: number } | void",
        '(params) => ({ url: "/api/user", params })',
      ),
    });
    expect(resultFor(results, "request.query")?.status).toBe("mismatch");
    expect(messageFor(results, "request.query")).toEqual([
      "$: frontend type { limit: number; } is not assignable to backend type undefined",
    ]);
  });

  it("should require the backend to accept no query when params may be void", () => {
    const results = check({
      frontend,
      backend: operation({ query: "query: { limit: number }" }),
      endpoint: request(
        "{ limit: number } | void",
        '(params) => ({ url: "/api/user", params })',
      ),
    });
    expect(resultFor(results, "request.query")?.status).toBe("mismatch");
  });

  it("should reject a body built from an empty object rest when the backend declares no body", () => {
    const results = check({
      frontend,
      backend: operation({ method: "Delete" }),
      endpoint: request(
        "{ id: number }",
        '({ id, ...body }) => ({ method: "DELETE", url: "/api/user", body })',
      ),
    });
    expect(resultFor(results, "request.body")).toMatchObject({
      status: "mismatch",
      message: expect.stringContaining(
        "$: the client always sends this part, and the backend declares none",
      ),
    });
  });

  it("should leave a body built from an empty object rest unverified against a declared body", () => {
    const results = check({
      frontend,
      backend: operation({
        method: "Delete",
        body: "body?: { reason?: string }",
      }),
      endpoint: request(
        "{ id: number }",
        '({ id, ...body }) => ({ method: "DELETE", url: "/api/user", body })',
      ),
    });
    expect(resultFor(results, "request.body")?.status).toBe("unverified");
  });

  it("should still check an empty object type that is not an object rest", () => {
    const results = check({
      frontend: `${frontend} declare const empty: {};`,
      backend: operation(),
      endpoint: request("void", '() => ({ url: "/api/user", params: empty })'),
    });
    expect(resultFor(results, "request.query")?.status).toBe("mismatch");
  });

  it("should reject a URL tag that can become an empty path segment", () => {
    const results = check({
      frontend,
      backend: operation({
        url: "/api/user/{user-id}",
        path: 'path: { "user-id": number }',
      }),
      endpoint: request(
        "{ id?: number }",
        '(params) => ({ url: "/api/user/:id", params })',
      ),
    });
    expect(resultFor(results, "request.path.0")?.status).toBe("mismatch");
    expect(resultFor(results, "request.path.0")?.message).toMatch(
      /:id may be replaced with an empty string/,
    );
  });

  it("should send a null POST body as an empty JSON object", () => {
    const optional = check({
      frontend,
      backend: operation({ method: "Post", body: "body?: { a?: string }" }),
      endpoint: request(
        "void",
        '() => ({ method: "POST", url: "/api/user", body: null })',
      ),
    });
    expect(resultFor(optional, "request.body")?.status).toBe("compatible");
    const required = check({
      frontend,
      backend: operation({ method: "Post", body: "body: { a: string }" }),
      endpoint: request(
        "void",
        '() => ({ method: "POST", url: "/api/user", body: null })',
      ),
    });
    expect(resultFor(required, "request.body")?.message).toMatch(
      /^\$\.a: property required by the backend type is missing from the frontend type/,
    );
  });
});

describe("incremental enforcement", () => {
  const result: ContractResult = {
    id: "exampleApi:example:response.2XX",
    endpointId: "exampleApi:example",
    kind: "response",
    part: "2XX",
    file: "api.ts",
    line: 10,
    status: "mismatch",
    message: "email is nullable",
  };

  it("should reject new mismatches and permit explicitly baselined debt", () => {
    expect(baselineProblems([result], [])).toHaveLength(1);
    expect(baselineProblems([result], [result.endpointId])).toEqual([]);
  });

  it("should exempt every check on an endpoint whatever its failures", () => {
    expect(
      baselineProblems(
        [
          {
            ...result,
            status: "unverified",
            message: "response schema missing",
          },
          {
            ...result,
            id: "exampleApi:example:request.body",
            kind: "request",
            part: "body",
          },
          {
            ...result,
            id: "exampleApi:example:request.path.0",
            kind: "request",
            part: "path.0",
          },
        ],
        [result.endpointId],
      ),
    ).toEqual([]);
  });

  it.each(["compatible", "ignored"] as const)(
    "should not fail for a %s endpoint that is still exempted",
    (status) => {
      expect(
        baselineProblems([{ ...result, status }], [result.endpointId]),
      ).toEqual([]);
    },
  );

  it("should not fail for an exemption whose endpoint was removed", () => {
    expect(baselineProblems([], [result.endpointId])).toEqual([]);
  });

  it.each(["mismatch", "unverified"] as const)(
    "should enforce a %s once the endpoint exemption is removed",
    (status) => {
      expect(baselineProblems([{ ...result, status }], [])).toHaveLength(1);
    },
  );

  it("should not exempt another API's endpoint with the same name", () => {
    expect(baselineProblems([result], ["anotherApi:example"])).toHaveLength(1);
  });
});

describe("endpoint identities", () => {
  const definition = `
    type EndpointBuilder = { query<R, A>(definition: unknown): unknown };
    declare const builder: EndpointBuilder;
    const tableApi = { example: builder.query<{}, void>({ query: () => ({ url: "/api/user" }) }) };
  `;
  const checkFiles = (sources: Record<string, string>) => {
    const { root, files, program } = programFrom(
      {
        ...Object.fromEntries(
          Object.entries(sources).map(([name, contents]) => [
            name,
            `${contents}\nexport {};`,
          ]),
        ),
        "types.gen.d.ts": `export type GetApiUserData = { url: "/api/user"; body?: never; query?: never; path?: never };
       export type GetApiUserResponses = { "2XX": {} };`,
      },
      { checked: [] },
    );
    const generated = files["types.gen.d.ts"] ?? "";
    const paths = Object.values(files).filter((file) => file !== generated);
    return checkContracts(program, paths, generated, root);
  };

  it("should preserve exemptions across file moves and line changes", () => {
    const before = checkFiles({ "api.ts": definition });
    const after = checkFiles({ "moved/table.ts": `\n\n${definition}` });
    expect(after.map((result) => result.id)).toEqual(
      before.map((result) => result.id),
    );
    expect(after[0]?.endpointId).toBe("tableApi:example");
    expect(after[0]?.file).not.toBe(before[0]?.file);
    expect(after[0]?.line).not.toBe(before[0]?.line);
  });

  it("should identify unsupported factories by declaration names instead of lines", () => {
    const factory = `
      type EndpointBuilder = { mutation<R, A>(definition: unknown): unknown };
      declare const builder: EndpointBuilder;
      const dashboardApi = (() => {
        const updateProperties = () => builder.mutation<{}, void>({});
        return { updateProperties };
      })();
    `;
    const before = checkFiles({ "dashboard.ts": factory });
    const after = checkFiles({ "moved.ts": `\n\n${factory}` });
    expect(before).toEqual([
      expect.objectContaining({
        id: "dashboardApi:updateProperties:endpoint",
        status: "unverified",
      }),
    ]);
    expect(after[0]?.id).toBe(before[0]?.id);
  });

  it("should keep the same endpoint name in different APIs separate", () => {
    const results = checkFiles({
      "table.ts": definition,
      "other.ts": replaceOnce(definition, "tableApi", "otherApi"),
    });
    expect(new Set(results.map((result) => result.endpointId))).toEqual(
      new Set(["tableApi:example", "otherApi:example"]),
    );
  });

  it("should reject duplicate identities across source files", () => {
    expect(() =>
      checkFiles({ "first.ts": definition, "second.ts": definition }),
    ).toThrow(/Duplicate endpoint identity tableApi:example/);
  });

  it("should require a name instead of falling back to a line number", () => {
    expect(() =>
      checkFiles({
        "unnamed.ts": `
          type EndpointBuilder = { query<R, A>(definition: unknown): unknown };
          declare const builder: EndpointBuilder;
          builder.query<{}, void>({});
        `,
      }),
    ).toThrow(/give its API or factory a named declaration/);
  });
});
