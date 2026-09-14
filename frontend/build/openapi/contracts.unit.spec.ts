import fs from "fs";
import os from "os";
import path from "path";

import ts from "typescript";

import {
  type ContractResult,
  type ContractStatus,
  baselineProblems,
  checkContracts,
} from "./contracts";

const ENDPOINT_ID = "endpoints:example";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createTempDir(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

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
  const root = createTempDir("api-contracts-");
  const file = path.join(root, "endpoint.ts");
  const generated = path.join(root, "types.gen.d.ts");
  fs.writeFileSync(
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
  fs.writeFileSync(generated, backend);
  const program = ts.createProgram([file, generated], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    ...options,
  });
  return checkContracts(program, [file], generated, root);
}

function resultFor(results: ContractResult[], part: string) {
  return results.find((result) => result.id === `${ENDPOINT_ID}:${part}`);
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
const responses = '{ "2XX": { nodes: Node[] } }';
const responsesDeclaration = `export type GetApiErdResponses = ${responses};`;

function withResponse(response: string) {
  return replaceOnce(backend, responses, `{ "2XX": ${response} }`);
}

describe("API contract checks", () => {
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

  it("should mark a request mapper with a fallthrough return as unverified", () => {
    const results = check({
      frontend,
      backend,
      endpoint:
        "builder.query<ErdResponse, number>({ query: id => { if (id) { return { url: `/api/erd/${id}` }; } } })",
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
      backend: replaceOnce(
        backend,
        responsesDeclaration,
        'type XYZ = "yo"; export type GetApiErdResponses = { "2XX": { schema: XYZ; unused: { deep: number } } };',
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
      backend: replaceOnce(
        backend,
        responsesDeclaration,
        'type Branch = { id: number; children: Branch[] }; export type GetApiErdResponses = { "2XX": Branch };',
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
      backend: replaceOnce(
        backend,
        responsesDeclaration,
        'type Branch = { kind: "a"; children: Branch[] } | { kind: "b"; children: Branch[] }; export type GetApiErdResponses = { "2XX": Branch };',
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
      backend: replaceOnce(
        backend,
        responsesDeclaration,
        'export type Branch = { id: number; children: Branch[] }; export type GetApiErdResponses = { "2XX": Branch };',
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
  const checkFiles = (files: Record<string, string>) => {
    const root = createTempDir("contract-identities-");
    const paths = Object.entries(files).map(([name, contents]) => {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${contents}\nexport {};`);
      return file;
    });
    const generated = path.join(root, "types.gen.d.ts");
    fs.writeFileSync(
      generated,
      `export type GetApiUserData = { url: "/api/user"; body?: never; query?: never; path?: never };
       export type GetApiUserResponses = { "2XX": {} };`,
    );
    const program = ts.createProgram([...paths, generated], { strict: true });
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
