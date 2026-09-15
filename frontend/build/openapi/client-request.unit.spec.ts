import fs from "fs";
import os from "os";
import path from "path";

import ts from "typescript";

import {
  type ClientRequest,
  type SentPayload,
  type SentValue,
  modelClientRequest,
} from "./client-request";
import { resolveRtkRequest } from "./rtk-request";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function model(source: string): {
  request: ClientRequest;
  checker: ts.TypeChecker;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "client-request-"));
  directories.push(root);
  const file = path.join(root, "request.ts");
  fs.writeFileSync(file, source);
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
  });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(file);
  let config: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "endpoint" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      config = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  if (sourceFile) {
    visit(sourceFile);
  }
  if (!config) {
    throw new Error("The fixture needs a `const endpoint = { ... }` object.");
  }
  const rtk = resolveRtkRequest(config);
  if (!rtk) {
    throw new Error("The fixture's query function is not a static request.");
  }
  return { request: modelClientRequest(checker, rtk, config), checker };
}

function values(checker: ts.TypeChecker, sent: SentValue[]): string[] {
  return sent.map((value) =>
    value.kind === "type"
      ? checker.typeToString(value.type)
      : value.kind === "text"
        ? JSON.stringify(value.text)
        : "empty",
  );
}

function objects(checker: ts.TypeChecker, sent: SentPayload[]): string[] {
  return sent.map((object) =>
    object.kind === "nothing"
      ? "nothing"
      : object.kind === "type"
        ? `type ${checker.typeToString(object.type)}`
        : `fields ${object.description}`,
  );
}

describe("modelClientRequest", () => {
  it("should send GET without a method and keep a template path parameter's type", () => {
    const { request, checker } = model(`
      const endpoint = { query: (id: number) => ({ url: \`/api/card/\${encodeURIComponent(id)}\` }) };
    `);
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/api/card/{param}");
    expect(
      request.pathParameters.map((parameter) =>
        values(checker, parameter.values),
      ),
    ).toEqual([["number"]]);
    expect(objects(checker, request.query.variants)).toEqual(["nothing"]);
    expect(objects(checker, request.body.variants)).toEqual(["nothing"]);
  });

  it("should consume URL tags from params and leave the other params in the query", () => {
    const { request, checker } = model(`
      type Args = { cardId: number; paramId: string; query?: string | null };
      const endpoint = { query: (params: Args) => ({ url: "/api/card/:cardId/params/:paramId", params }) };
    `);
    expect(request.path).toBe("/api/card/{param}/params/{param}");
    expect(
      request.pathParameters.map((parameter) =>
        values(checker, parameter.values),
      ),
    ).toEqual([["number"], ["string"]]);
    expect(objects(checker, request.query.variants)).toEqual([
      "fields Args sent as { query?: string; }",
    ]);
  });

  it("should fall back to the body for a URL tag and add an empty value when neither has one", () => {
    const { request, checker } = model(`
      type Args = { token?: string; name: string };
      const endpoint = { query: (body: Args) => ({ method: "POST", url: "/api/embed/:token", body }) };
    `);
    expect(values(checker, request.pathParameters[0]?.values ?? [])).toEqual([
      "string",
      "empty",
    ]);
    expect(objects(checker, request.body.variants)).toEqual([
      "fields Args sent as { name: string; }",
    ]);
  });

  it("should fill a URL tag only from the body when the params value is always undefined", () => {
    const { request, checker } = model(`
      type Args = { params: { token: undefined }; body: { token: string; name: string } };
      const endpoint = { query: (arg: Args) => ({ method: "POST", url: "/api/embed/:token", params: arg.params, body: arg.body }) };
    `);
    expect(request.pathParameters[0]?.notes).toEqual([
      ":token is filled from body.token, because params.token is undefined (utils.ts:165-173)",
    ]);
    expect(values(checker, request.pathParameters[0]?.values ?? [])).toEqual([
      "string",
    ]);
    expect(objects(checker, request.body.variants)).toEqual([
      "fields { name: string; token: string; } sent as { name: string; }",
    ]);
  });

  it("should keep both URL tag sources when the params value may be undefined", () => {
    const { request, checker } = model(`
      type Args = { params: { token: string | undefined }; body: { token: string; name: string } };
      const endpoint = { query: (arg: Args) => ({ method: "POST", url: "/api/embed/:token", params: arg.params, body: arg.body }) };
    `);
    expect(request.pathParameters[0]?.notes).toEqual([
      ":token is filled from params.token when it is defined, otherwise from body.token, which is then removed from the body (utils.ts:165-173)",
    ]);
    expect(objects(checker, request.body.variants)).toEqual([
      "fields { name: string; token: string; } sent as { token?: string; name: string; }",
    ]);
  });

  it("should send query values as the text String gives, keeping values it cannot know", () => {
    const { request, checker } = model(`
      type Args = { archived: boolean; limit: 10 | 20; ids: (number | null)[]; name: string; id: NanoID };
      type NanoID = string & { __brand: "NanoID" };
      const endpoint = { query: (params: Args) => ({ url: "/api/x", params }) };
    `);
    expect(objects(checker, request.query.variants)).toEqual([
      'fields Args sent as { archived: "false" | "true"; limit: "10" | "20"; ids?: (number | "null")[]; name: string; id: NanoID; }',
    ]);
    expect(request.query.notes).toEqual([
      'archived (boolean) is sent as "false" | "true" (utils.ts:50-56)',
      'limit (10 | 20) is sent as "10" | "20" (utils.ts:50-56)',
      "ids ((number | null)[]) is not sent when its array is empty (utils.ts:50-53)",
      'ids ((number | null)[]) is sent as (number | "null")[] (utils.ts:50-56)',
    ]);
    expect(request.query.unverified).toBeUndefined();
  });

  it("should leave the query unverified when a value's text is known only at runtime", () => {
    const { request } = model(`
      class Stamp { toString() { return "stamp"; } }
      type Args = { options: { a: number }; stamp: Stamp; date: Date };
      const endpoint = { query: (params: Args) => ({ url: "/api/x", params }) };
    `);
    expect(request.query.unverified).toBe(
      "options ({ a: number; }) is sent as text, and its text is known only at runtime (utils.ts:50-56)",
    );
  });

  it("should fill URL tags with the text String gives", () => {
    const { request, checker } = model(`
      type Args = { flag: boolean; options: { a: number }; id: number; ids: number[] };
      const endpoint = { query: (params: Args) => ({ url: "/api/x/:flag/:options/:id/:ids", params }) };
    `);
    expect(
      request.pathParameters.map((parameter) =>
        values(checker, parameter.values),
      ),
    ).toEqual([
      ['"false"', '"true"'],
      ["{ a: number; }"],
      ["number"],
      ["number[]"],
    ]);
    expect(request.pathParameters.map((parameter) => parameter.notes)).toEqual([
      [
        ":flag is filled from params.flag (utils.ts:165-168)",
        ':flag (boolean) is sent as "false" | "true" (utils.ts:180)',
      ],
      [":options is filled from params.options (utils.ts:165-168)"],
      [":id is filled from params.id (utils.ts:165-168)"],
      [":ids is filled from params.ids (utils.ts:165-168)"],
    ]);
    expect(
      request.pathParameters.map((parameter) => parameter.unverified),
    ).toEqual([
      undefined,
      ":options ({ a: number; }) is sent as text, and its text is known only at runtime (utils.ts:180)",
      undefined,
      ":ids (number[]) is sent as text, and its text is known only at runtime (utils.ts:180)",
    ]);
  });

  it("should send template spans as the text String gives", () => {
    const { request, checker } = model(`
      type Args = { flag: boolean; options: { a: number }; pair: [1, null]; missing: number | undefined };
      const endpoint = { query: ({ flag, options, pair, missing }: Args) => ({ url: \`/api/x/\${flag}/\${options}/\${pair}/\${encodeURIComponent(missing ?? 0)}/\${missing}\` }) };
    `);
    expect(
      request.pathParameters.map((parameter) =>
        values(checker, parameter.values),
      ),
    ).toEqual([
      ['"false"', '"true"'],
      ["{ a: number; }"],
      ["[1, null]"],
      ["number"],
      ["number", '"undefined"'],
    ]);
    expect(request.pathParameters.map((parameter) => parameter.notes)).toEqual([
      [
        '${flag} (boolean) is sent as "false" | "true" (the template literal applies String)',
      ],
      [],
      [],
      [],
      [
        '${missing} (number | undefined) is sent as number | "undefined" (the template literal applies String)',
      ],
    ]);
    expect(
      request.pathParameters.map((parameter) => parameter.unverified),
    ).toEqual([
      undefined,
      "${options} ({ a: number; }) is sent as text, and its text is known only at runtime (the template literal applies String)",
      "${pair} ([1, null]) is sent as text, and its text is known only at runtime (the template literal applies String)",
      undefined,
      undefined,
    ]);
  });

  it("should read inline query spans after String, encoding and query string parsing", () => {
    const { request, checker } = model(`
      const endpoint = { query: ({ flag, id }: { flag: boolean; id: number }) => ({ url: \`/api/x?a=\${flag}&b=\${encodeURIComponent(flag)}&c=\${id}\` }) };
    `);
    expect(objects(checker, request.query.variants)).toEqual([
      'fields { a: "false" | "true"; b: "false" | "true"; c: number; }',
    ]);
    expect(request.query.notes).toEqual([
      '${flag} (boolean) is sent as "false" | "true" (the template literal applies String)',
      '${encodeURIComponent(flag)} (boolean) is sent as "false" | "true" (encodeURIComponent applies String)',
      "the URL template's inline query string is kept by new URL (client.ts:38)",
    ]);
  });

  it("should parse known inline query text the way URLSearchParams does", () => {
    const { request, checker } = model(`
      const endpoint = { query: (value: "x&y=1") => ({ url: \`/api/x?q=a+b%21&v=\${value}#ignored=1\` }) };
    `);
    expect(objects(checker, request.query.variants)).toEqual([
      'fields { q: "a b!"; v: "x"; y: "1"; }',
    ]);
    expect(request.query.notes).toContain(
      "the URL template's query string ends at #, and fetch does not send the fragment after it (client.ts:38)",
    );
  });

  it("should note an unencoded string span in the query whose text is unknown", () => {
    const { request } = model(`
      const endpoint = { query: (name: string) => ({ url: \`/api/x?name=\${name}\` }) };
    `);
    expect(request.query.notes).toContain(
      '${name} is put into the query string without encoding, so an "&", "#", "+" or "%" in its text would change what is sent, which the checker does not model (client.ts:38)',
    );
  });

  it("should only treat the global encodeURIComponent as encoding a span", () => {
    const { request, checker } = model(`
      export {};
      function encodeURIComponent(value: number): "fixed" { return "fixed"; }
      const endpoint = { query: (id: number) => ({ url: \`/api/x/\${encodeURIComponent(id)}\` }) };
    `);
    expect(values(checker, request.pathParameters[0]?.values ?? [])).toEqual([
      '"fixed"',
    ]);
  });

  it("should leave a path span unverified when its known text is not one path segment", () => {
    const { request } = model(`
      const endpoint = { query: (value: "a/b" | "c") => ({ url: \`/api/x/\${value}\` }) };
    `);
    expect(request.pathParameters[0]?.unverified).toBe(
      '${value} may be "a/b", which new URL does not keep as one path segment (client.ts:38)',
    );
  });

  it("should leave a template span of a symbol unverified", () => {
    const { request } = model(`
      const endpoint = { query: (value: symbol) => ({ url: \`/api/x/\${String(value).length}/\${value as unknown as symbol}\` }) };
    `);
    expect(
      request.pathParameters.map((parameter) => parameter.unverified),
    ).toEqual([
      undefined,
      "${value} (symbol) is sent as text, and its text is known only at runtime (the template literal applies String)",
    ]);
  });

  it("should model the spread copy the client makes of params and body", () => {
    const { request, checker } = model(`
      class Point { x = 1; get sum() { return 2; } toText() { return "p"; } }
      const endpoint = { query: ({ point, when }: { point: Point; when: Date }) => ({ method: "POST", url: "/api/x", params: when, body: point }) };
    `);
    expect(objects(checker, request.query.variants)).toEqual(["nothing"]);
    expect(objects(checker, request.body.variants)).toEqual([
      "fields Point sent as { x: number; }",
    ]);
    expect(request.query.notes).toContain(
      "the params Date is copied with { ...value } as {}, because a Date keeps its data behind prototype accessors (client.ts:74-75)",
    );
    expect(request.body.notes).toEqual([
      "sum is a method or accessor, which { ...value } and JSON.stringify both leave out (client.ts:74-75)",
      "toText is a method or accessor, which { ...value } and JSON.stringify both leave out (client.ts:74-75)",
    ]);
  });

  it("should copy a tuple of params into numbered keys and leave an array unverified", () => {
    const { request, checker } = model(`
      const endpoint = { query: (params: [number, "a"]) => ({ url: "/api/x", params }) };
    `);
    expect(objects(checker, request.query.variants)).toEqual([
      'fields { 0: number; 1: "a"; }',
    ]);
    const { request: unknownKeys } = model(`
      const endpoint = { query: (params: number[]) => ({ url: "/api/x", params }) };
    `);
    expect(unknownKeys.query.unverified).toBe(
      "the params is copied with { ...value } before it is sent, and an array is copied one numbered key at a time (client.ts:74-75)",
    );
  });

  it("should send a primitive body as {} and leave a string body unverified", () => {
    const { request, checker } = model(`
      const endpoint = { query: (body: number) => ({ method: "POST", url: "/api/x", body }) };
    `);
    expect(objects(checker, request.body.variants)).toEqual(["fields {}"]);
    expect(request.body.notes).toEqual([
      "the body number is copied with { ...value } as {}, because a number has no own properties (client.ts:74-75)",
    ]);
    const { request: text } = model(`
      const endpoint = { query: (body: string) => ({ method: "POST", url: "/api/x", body }) };
    `);
    expect(text.body.unverified).toBe(
      "the body is copied with { ...value } before it is sent, and a string is copied one character key at a time (client.ts:74-75)",
    );
  });

  it("should model what JSON.stringify writes for a body", () => {
    const { request, checker } = model(`
      type Args = { when: Date; run: () => void; ids: (number | undefined)[]; tags: Map<string, string>; big: bigint; name: string };
      const endpoint = { query: (body: Args) => ({ method: "POST", url: "/api/x", body }) };
    `);
    expect(objects(checker, request.body.variants)).toEqual([
      "fields Args sent as { when: string; ids: (number | null)[]; tags: {}; big: bigint; name: string; }",
    ]);
    expect(request.body.notes).toEqual([
      "run is a method or accessor, which { ...value } and JSON.stringify both leave out (client.ts:74-75)",
      "JSON.stringify writes 1 value differently at $.when: Date is written as string by its toJSON (client.ts:250)",
      "JSON.stringify writes 1 value differently at $.ids[]: undefined is written as null, because JSON.stringify writes undefined in an array as null (client.ts:250)",
      "JSON.stringify writes 1 value differently at $.tags: Map<string, string> is written as {}, because a Map<string, string> has no own properties to serialise (client.ts:250)",
    ]);
  });

  it("should leave a URL tag unverified when params keys are only known at runtime", () => {
    const { request } = model(`
      const endpoint = { query: (params: Record<string, string>) => ({ url: "/api/card/:cardId", params }) };
    `);
    expect(request.pathParameters[0]?.unverified).toBe(
      "whether the params has a cardId key depends on an index signature whose keys are known only at runtime (utils.ts:166)",
    );
  });

  it("should drop the RTK cache key and nullish query values", () => {
    const { request, checker } = model(`
      type Args = { __rtkCacheKey?: unknown; a: string | null; b: undefined; ids: number[] };
      const endpoint = { query: (params: Args) => ({ url: "/api/search", params }) };
    `);
    expect(objects(checker, request.query.variants)).toEqual([
      "fields Args sent as { a?: string; ids?: number[]; }",
    ]);
    expect(request.query.notes).toEqual([
      "__rtkCacheKey is removed from the params before sending (api.ts:43-56)",
      "a (string | null) is not sent when it is null or undefined (utils.ts:47)",
      "b (undefined) is null or undefined, so it is not sent (utils.ts:47)",
      "ids (number[]) is not sent when its array is empty (utils.ts:50-53)",
    ]);
  });

  it("should send void or null params as nothing and keep the object part", () => {
    const { request, checker } = model(`
      const endpoint = { query: (params: { limit: number } | void) => ({ url: "/api/list", params }) };
    `);
    expect(objects(checker, request.query.variants)).toEqual([
      "type { limit: number; }",
      "nothing",
    ]);
  });

  it("should fold GET body fields into the query and send no body", () => {
    const { request, checker } = model(`
      const endpoint = { query: (token: string) => ({ url: "/api/session", params: { a: 1 }, body: { token } }) };
    `);
    expect(objects(checker, request.query.variants)).toEqual([
      "fields { a: number; token: string; }",
    ]);
    expect(objects(checker, request.body.variants)).toEqual(["nothing"]);
  });

  it("should send nothing for a GET FormData body", () => {
    const { request, checker } = model(`
      const endpoint = { query: (body: FormData) => ({ url: "/api/upload", body }) };
    `);
    expect(objects(checker, request.query.variants)).toEqual(["nothing"]);
    expect(request.query.unverified).toBeUndefined();
  });

  it("should leave a POST FormData body unverified", () => {
    const { request } = model(`
      const endpoint = { query: (body: FormData) => ({ method: "POST", url: "/api/upload", body }) };
    `);
    expect(request.body.unverified).toBe(
      "a FormData body is sent as-is (client.ts:242-248), and its fields are appended at runtime",
    );
  });

  it("should send a null non-GET body as {} and an undefined one as nothing", () => {
    const nullBody = model(`
      const endpoint = { query: () => ({ method: "PUT", url: "/api/thing", body: null }) };
    `);
    expect(objects(nullBody.checker, nullBody.request.body.variants)).toEqual([
      "fields {}",
    ]);
    const undefinedBody = model(`
      const endpoint = { query: () => ({ method: "PUT", url: "/api/thing", body: undefined }) };
    `);
    expect(
      objects(undefinedBody.checker, undefinedBody.request.body.variants),
    ).toEqual(["nothing"]);
  });

  it("should leave a body built from an empty object rest unverified", () => {
    const { request } = model(`
      const endpoint = { query: ({ id, ...body }: { id: number }) => ({ method: "DELETE", url: \`/api/thing/\${id}\`, body }) };
    `);
    expect(request.body.unverified).toBe(
      "the body comes from the object rest body, which has no declared properties and carries whatever keys the caller passed beyond the destructured ones (client.ts:250)",
    );
  });

  it("should keep a nested field that drops undefined as optional in the JSON body", () => {
    const { request, checker } = model(`
      type Args = { inner: { a: string | undefined; b: number } };
      const endpoint = { query: (body: Args) => ({ method: "POST", url: "/api/thing", body }) };
    `);
    expect(objects(checker, request.body.variants)).toEqual([
      "fields Args sent as { inner: { a?: string; b: number; }; }",
    ]);
  });

  it("should leave undefined JSON body fields out", () => {
    const { request, checker } = model(`
      const endpoint = { query: (body: { a: string | undefined; b: undefined }) => ({ method: "POST", url: "/api/thing", body }) };
    `);
    expect(objects(checker, request.body.variants)).toEqual([
      "fields { a: string | undefined; b: undefined; } sent as { a?: string; }",
    ]);
  });

  it("should report that the client throws for an array body or an unsupported method", () => {
    expect(
      model(`
        const endpoint = { query: (ids: number[]) => ({ method: "POST", url: "/api/thing", body: ids }) };
      `).request.failure,
    ).toBe(
      "the client throws before sending an array body (client.ts:200-202)",
    );
    expect(
      model(`
        const endpoint = { query: () => ({ method: "PATCH", url: "/api/thing" }) };
      `).request.failure,
    ).toBe(
      'the client throws "Invalid HTTP method" for PATCH (client.ts:99-101)',
    );
  });

  it("should read literal and template values from an inline query string", () => {
    const { request, checker } = model(`
      const endpoint = { query: (id: number) => ({ method: "PUT", url: \`/api/graph?skip-graph=true&id=\${id}\` }) };
    `);
    expect(request.path).toBe("/api/graph");
    const [query] = request.query.variants;
    expect(
      query?.kind === "fields" &&
        query.fields.map((field) => [
          field.name,
          values(checker, field.values),
        ]),
    ).toEqual([
      ["skip-graph", ['"true"']],
      ["id", ["number"]],
    ]);
  });

  it("should leave the query unverified when an inline query key is built at runtime", () => {
    const { request } = model(`
      declare const search: string;
      const endpoint = { query: () => ({ url: \`/api/activity?\${search}\` }) };
    `);
    expect(request.query.unverified).toBe(
      "a query string key in the URL template is built at runtime",
    );
  });

  it("should leave the request unverified when extraOptions can replace its fields", () => {
    const { request } = model(`
      declare const options: { params?: object };
      const endpoint = { extraOptions: options, query: () => ({ url: "/api/thing" }) };
    `);
    expect(request.unverified).toBe(
      "extraOptions is spread over the request after url, method, params and body (api.ts:92)",
    );
  });
});
