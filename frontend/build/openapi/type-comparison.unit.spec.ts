import ts from "typescript";

import { typeShape } from "./shape";
import { cleanupFixtures, programFrom } from "./test-fixtures";
import { compareShape, renderDiagnostics } from "./type-comparison";

afterEach(cleanupFixtures);

function compare({
  kind = "response",
  frontend,
  backend,
  frontendDeclarations = "",
  backendDeclarations = "",
}: {
  kind?: "request" | "response";
  frontend: string;
  backend: string;
  frontendDeclarations?: string;
  backendDeclarations?: string;
}) {
  const { root, files, program, checker } = programFrom({
    "frontend.ts": `${frontendDeclarations} export type Compared = ${frontend};`,
    "backend.ts": `${backendDeclarations} export type Compared = ${backend};`,
  });
  const typeAt = (file: string) => {
    const source = program.getSourceFile(files[file] ?? "");
    const declaration = source?.statements.find(
      (node): node is ts.TypeAliasDeclaration =>
        ts.isTypeAliasDeclaration(node) && node.name.text === "Compared",
    );
    if (!declaration) {
      throw new Error(`Missing comparison type in ${file}`);
    }
    return { type: checker.getTypeAtLocation(declaration), declaration };
  };
  const front = typeAt("frontend.ts");
  const back = typeAt("backend.ts");
  const verdict = compareShape(
    { checker, root },
    kind,
    `example ${kind}`,
    typeShape(kind === "response" ? back.type : front.type),
    kind === "response" ? front.type : back.type,
    front.declaration,
  );
  return {
    status: verdict.status,
    ...renderDiagnostics(verdict.diagnostics, verdict.notes),
  };
}

describe("type comparison", () => {
  it("should leave an unreachable object branch unverified", () => {
    expect(
      compare({ frontend: "{ id: number } | null", backend: "null" }).status,
    ).toBe("unverified");
  });
  it.each(["", " | { id: number }"])(
    "should identify missing fields across overlapping response branches %s",
    (base) => {
      const result = compare({
        frontend:
          "{ id: number; label?: string } | { id: number; title?: string }" +
          base,
        backend: "{ id: number }",
      });
      expect(result.status).toBe("mismatch");
      expect(result.message).toContain("$.label");
      expect(result.message).toContain("$.title");
    },
  );
  it("should check response tuple rest fields", () => {
    expect(
      compare({
        frontend: "[string, ...{ id: number; nickname?: string }[]]",
        backend: "[string, { id: number }]",
      }).status,
    ).not.toBe("compatible");
  });
  it("should respect every applicable backend index signature", () => {
    expect(
      compare({
        kind: "request",
        frontend: "{ [key: number]: string }",
        backend: "{ [key: string]: string | number; [key: number]: number }",
      }).status,
    ).toBe("mismatch");
  });

  it("should ignore unconsumed response fields throughout nested arrays", () => {
    expect(
      compare({
        frontend: "{ items: { id: number }[] }",
        backend:
          "{ items: { id: number; metadata: unknown }[]; extra: unknown }",
      }).status,
    ).toBe("compatible");
  });

  it("should diagnose a definite response mismatch alongside a consumed unknown", () => {
    const result = compare({
      frontend: "{ id: number; label: string }",
      backend: "{ id: string; label: unknown; extra: unknown }",
    });
    expect(result.status).toBe("mismatch");
    expect(result.message).toContain("$.id");
    expect(result.message).toContain("$.label");
    expect(result.message).not.toContain("$.extra");
  });

  it("should keep a discriminated union unverified when the matching variant contains an unknown", () => {
    const result = compare({
      frontend:
        '{ kind: "ok"; id: string } | { kind: "error"; message: string }',
      backend:
        '{ kind: "ok"; id: unknown } | { kind: "error"; message: string }',
    });
    expect(result.status).toBe("unverified");
    expect(result.message).toContain("$.id");
  });

  it("should accept an omitted optional request field with an unconstrained backend type", () => {
    expect(
      compare({
        kind: "request",
        frontend: "{ id: number }",
        backend: "{ id: number; metadata?: unknown }",
      }).status,
    ).toBe("compatible");
  });

  it("should check each backend tuple element against the consumed array fields", () => {
    const result = compare({
      frontend: "{ id: number; nickname?: string }[]",
      backend: "[{ id: number; nickname: string }, { id: number }]",
    });
    expect(result.status).toBe("mismatch");
    expect(result.message).toContain("$[1].nickname");
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
    const response = compare({
      frontend: sample.frontend,
      backend: sample.backend,
    });
    expect(response.status).toBe("mismatch");
    expect(response.message).toContain(sample.missing);
    expect(response.message).toMatch(/not declared in the backend/);
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
    const response = compare({
      frontend: sample.frontend,
      backend: sample.backend,
    });
    expect(response).toMatchObject({
      status: "compatible",
    });
  });
  it.each([
    {
      name: "should check repeated response types with their own union siblings",
      frontend: "{ first: T; second: T }",
      frontendDeclarations: "type T = { x: number; a?: string };",
      backend: "{ first: S | Alt; second: S }",
      backendDeclarations:
        "type S = { x: number }; type Alt = { x: number; a: string };",
      status: "mismatch",
      message: "$.second.a",
    },
    {
      name: "should report an overlapping branch at its first occurrence",
      frontend: "{ first: A | B; second: A }",
      frontendDeclarations:
        "type A = { x: number; a?: string }; type B = { x: number };",
      backend: "{ first: S; second: S }",
      backendDeclarations: "type S = { x: number };",
      status: "mismatch",
      message: "$.first.a",
    },
    {
      name: "should explain optional-property presence independently of its value type",
      frontend: "{ label: string | undefined }",
      backend: "{ label?: string }",
      status: "mismatch",
      message: /label.*optional.*required/,
    },
    {
      name: "should accept primitive aliases and response subsets without copying generated entities",
      frontend: '{ schema: "yo" }',
      backend: "{ schema: XYZ; unused: { deep: number } }",
      backendDeclarations: 'type XYZ = "yo";',
      status: "compatible",
    },
    {
      name: "should check optional field values supplied by a backend index signature",
      frontend: '{ metadata: { "x-id"?: string } }',
      backend: "{ metadata: { [key: `x-${string}`]: number } }",
      status: "mismatch",
      message: /metadata.x-id.*number.*not assignable/,
    },
    {
      name: "should check separate occurrences of a shared frontend alias against their own backend shapes",
      frontend: "{ first: Shared; second: Shared }",
      frontendDeclarations: "type Shared = { id: number; name?: string };",
      backend:
        "{ first: { id: number; name: string }; second: { id: number } }",
      status: "mismatch",
      message: /second.name.*not declared/,
    },
    {
      name: "should check fields after revisiting recursive aliases",
      frontend: "Tree",
      frontendDeclarations:
        "type Tree = { id: number; children: Tree[]; name?: string };",
      backend: "Branch",
      backendDeclarations: "type Branch = { id: number; children: Branch[] };",
      status: "mismatch",
      message: /name.*not declared/,
    },
    {
      name: "should keep unmatched frontend object variants unverified",
      frontend: '{ kind: "ok" } | { kind: "error"; message?: string }',
      backend: '{ kind: "ok" }',
      status: "unverified",
      message: /union variant/,
    },
    {
      name: "should terminate when recursive backend variants share the same child types",
      frontend: "Tree",
      frontendDeclarations:
        'type Tree = { kind: "a" | "b"; children: Tree[] };',
      backend: "Branch",
      backendDeclarations:
        'type Branch = { kind: "a"; children: Branch[] } | { kind: "b"; children: Branch[] };',
      status: "compatible",
    },
    {
      name: "should support recursive component references without copying or infinitely expanding them",
      frontend: "Tree",
      frontendDeclarations: "type Tree = { id: number; children: Tree[] };",
      backend: "Branch",
      backendDeclarations:
        "export type Branch = { id: number; children: Branch[] };",
      status: "compatible",
    },
  ])("$name", (sample) => {
    const result = compare(sample);
    expect(result.status).toBe(sample.status);
    expect(result.message).toMatch(sample.message ?? /^Compatible$/);
  });

  it.each([
    {
      name: "should find multiple independent nested field mismatches",
      frontend:
        "{ nodes: { owner: { email: string }; fields: { id: string }[] }[] }",
      backend:
        "{ nodes: { owner: { email: string | null }; fields: { id: number }[] }[] }",
      status: "mismatch",
      lines: [
        /nodes\[\]\.owner\.email.*not assignable/,
        /nodes\[\]\.fields\[\]\.id.*not assignable/,
      ],
    },
    {
      name: "should report a recursive mismatch once, where the types first repeat",
      frontend: "Tree",
      frontendDeclarations: "interface Tree { name: string; children: Tree[] }",
      backend: "Branch",
      backendDeclarations:
        "type Branch = { name: number; children: Branch[] };",
      status: "mismatch",
      lines: [
        /^\$\.name .*backend type number is not assignable to frontend type string$/,
      ],
    },
    {
      name: "should list every frontend field missing from the backend",
      frontend: "{ id: number; a?: string; b?: string }",
      backend: "{ id: number }",
      status: "mismatch",
      lines: [
        /^\$\.a .*not declared in the backend/,
        /^\$\.b .*not declared in the backend/,
      ],
    },
    {
      name: "should report a mismatch alongside an unverified field coverage problem",
      frontend: '{ extra?: string; item: { kind: "ok" } | { kind: "error" } }',
      backend: '{ item: { kind: "ok" } }',
      status: "mismatch",
      lines: [
        /^\$\.extra .*not declared in the backend/,
        /^\$\.item .*cannot establish frontend field coverage.*kind: "error"/,
      ],
    },
    {
      name: "should reference a repeated disagreement that was actually reported",
      frontend: "{ first: Owner; second: Owner }",
      frontendDeclarations: "interface Owner { id: number; nickname?: string }",
      backend: "{ first: BackendOwner; second: BackendOwner }",
      backendDeclarations: "type BackendOwner = { id: number };",
      status: "mismatch",
      lines: [
        /^\$\.first.nickname .*not declared in the backend/,
        /^\$\.second .*same problems as at \$\.first$/,
      ],
    },
    {
      name: "should not point to an earlier path whose shape had no problems",
      frontend: "{ first: Owner; second: Owner }",
      frontendDeclarations: "interface Owner { id: number }",
      backend: "{ first: BackendOwner; second: BackendOwner }",
      backendDeclarations: "type BackendOwner = { id: number };",
      status: "compatible",
      lines: [/^Compatible$/],
    },
    {
      name: "should stay unverified when every field coverage problem is unverified",
      frontend:
        '{ first: { kind: "ok" } | { kind: "error" }; second: { kind: "ok" } | { kind: "error" } }',
      backend: '{ first: { kind: "ok" }; second: { kind: "ok" } }',
      status: "unverified",
      lines: [
        /^\$\.first .*cannot establish frontend field coverage.*kind: "error"/,
        /^\$\.second .*cannot establish frontend field coverage.*kind: "error"/,
      ],
    },
  ])("$name", (sample) => {
    const result = compare(sample);
    expect(result.status).toBe(sample.status);
    expect(result.message.split("\n  ")).toEqual(
      sample.lines.map((line) => expect.stringMatching(line)),
    );
  });

  it("should reject a nullable field several referenced entities deep", () => {
    expect(
      compare({
        frontend: "{ nodes: { owner: User }[] }",
        frontendDeclarations: "type User = { email: string };",
        backend: "{ nodes: Node[] }",
        backendDeclarations:
          "type Owner = { email: string | null }; type Node = { owner: Owner };",
      }).status,
    ).toBe("mismatch");
  });

  it("should check every union response variant, including missing fields on failures", () => {
    expect(
      compare({
        frontend: "{ nodes: number[] }",
        backend: "{ nodes: number[] } | { error: string }",
      }).status,
    ).toBe("mismatch");
  });

  it.each(["any", "unknown", "MissingType"])(
    "should never report a contract containing %s as verified",
    (loose) => {
      expect(
        compare({
          frontend: `{ nodes: { owner: { email: ${loose} } }[] }`,
          backend: "{ nodes: { owner: { email: string } }[] }",
        }).status,
      ).toBe("unverified");
    },
  );
  it.each([
    [
      "should handle mixed union members without a false verdict",
      '{ kind: "a"; count: number }',
      '{ kind: "a"; date: string } | { kind: "b"; count: number }',
      "mismatch",
    ],
    [
      "should accept a sent key the backend takes through an index signature",
      "{ user: { name: string } }",
      "{ user: { [key: string]: string } }",
      "compatible",
    ],
    [
      "should accept numeric keys through a string index signature, since JSON keys are text",
      "{ collections: Record<number, boolean> }",
      "{ collections: { [key: string]: boolean } | null }",
      "compatible",
    ],
    [
      "should accept an optional backend field the frontend does not send",
      "{ name: string }",
      "{ name: string; nickname?: string }",
      "compatible",
    ],
  ])("%s", (_name, frontend, backend, status) => {
    expect(compare({ kind: "request", frontend, backend }).status).toBe(status);
  });
});
