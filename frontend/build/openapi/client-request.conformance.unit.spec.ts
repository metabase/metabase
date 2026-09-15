import fs from "fs";
import os from "os";
import path from "path";

import type { BaseQueryApi } from "@reduxjs/toolkit/query/react";
import fetchMock from "fetch-mock";
import ts from "typescript";

import { baseQuery } from "metabase/api/api";

import {
  type ClientRequest,
  type SentPayload,
  type SentValue,
  modelClientRequest,
} from "./client-request";
import { resolveRtkRequest } from "./rtk-request";

type SentBody =
  | { kind: "none" }
  | { kind: "json"; value: unknown }
  | { kind: "raw"; type: string };

interface SentRequest {
  method: string;
  path: string;
  query: [string, string][];
  body: SentBody;
}

type Outcome = { kind: "sent"; request: SentRequest } | { kind: "thrown" };

interface Fixture {
  declarations?: string;
  endpoint: string;
  argument: string;
}

interface Modelled {
  request: ClientRequest;
  checker: ts.TypeChecker;
}

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fixtureSource({ declarations = "", endpoint, argument }: Fixture) {
  return `
    ${declarations}
    const endpoint = ${endpoint};
    const argument: Parameters<typeof endpoint.query>[0] = ${argument};
  `;
}

function model(fixture: Fixture): Modelled {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "client-conformance-"));
  directories.push(root);
  const file = path.join(root, "request.ts");
  fs.writeFileSync(file, fixtureSource(fixture));
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
  });
  const sourceFile = program.getSourceFile(file);
  if (!sourceFile) {
    throw new Error("The fixture was not compiled.");
  }
  // The runtime argument must have the type the model reads.
  const diagnostics = program.getSemanticDiagnostics(sourceFile);
  if (diagnostics.length) {
    throw new Error(
      diagnostics
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        )
        .join("\n"),
    );
  }
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
  visit(sourceFile);
  const rtk = config && resolveRtkRequest(config);
  if (!config || !rtk) {
    throw new Error("The fixture's query function is not a static request.");
  }
  const checker = program.getTypeChecker();
  return { request: modelClientRequest(checker, rtk, config), checker };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadFixture(fixture: Fixture): {
  query: (argument: unknown) => unknown;
  extraOptions: unknown;
  argument: unknown;
} {
  const { outputText } = ts.transpileModule(fixtureSource(fixture), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const loaded: unknown = new Function(
    `${outputText}\nreturn { endpoint, argument };`,
  )();
  if (
    !isRecord(loaded) ||
    !isRecord(loaded.endpoint) ||
    typeof loaded.endpoint.query !== "function"
  ) {
    throw new Error("The fixture did not define an endpoint query.");
  }
  const { query } = loaded.endpoint;
  return {
    query: (argument) => query(argument),
    extraOptions: loaded.endpoint.extraOptions,
    argument: loaded.argument,
  };
}

// The test `Request` stringifies every body, so record the body the client passes to it.
const requestInits: (RequestInit | undefined)[] = [];
const OriginalRequest = globalThis.Request;

class RecordingRequest extends OriginalRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init);
    requestInits.push(init);
  }
}

function sentBody(body: RequestInit["body"]): SentBody {
  if (body === undefined || body === null) {
    return { kind: "none" };
  }
  if (typeof body === "string") {
    return { kind: "json", value: JSON.parse(body) };
  }
  if (body instanceof FormData || body instanceof URLSearchParams) {
    return { kind: "raw", type: body.constructor.name };
  }
  throw new Error("The client sent a body kind this spec does not read.");
}

async function send(fixture: Fixture): Promise<Outcome> {
  fetchMock.route("begin:http", {});
  const { query, extraOptions, argument } = loadFixture(fixture);
  const controller = new AbortController();
  const api: BaseQueryApi = {
    signal: controller.signal,
    abort: () => controller.abort(),
    dispatch: jest.fn(),
    getState: () => ({}),
    extra: undefined,
    endpoint: "conformance",
    type: "query",
  };
  const result = await baseQuery(
    // The fixture's type check guarantees this is what the RTK endpoint returns.
    query(argument) as Parameters<typeof baseQuery>[0],
    api,
    isRecord(extraOptions) ? extraOptions : {},
  );
  const call = fetchMock.callHistory.lastCall("begin:http");
  const init = requestInits.at(-1);
  if (!call || !init) {
    expect(result.error).toBeDefined();
    return { kind: "thrown" };
  }
  const url = new URL(call.url);
  return {
    kind: "sent",
    request: {
      method: init.method ?? "GET",
      path: url.pathname,
      query: [...url.searchParams.entries()],
      body: sentBody(init.body),
    },
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valueViolation(
  values: SentValue[],
  text: string,
  label: string,
): string | undefined {
  if (text === "") {
    return values.some((value) => value.kind === "empty")
      ? undefined
      : `${label}: an empty value is not modelled`;
  }
  const texts = values.flatMap((value) =>
    value.kind === "text" ? [value.text] : [],
  );
  if (values.every((value) => value.kind === "text") && !texts.includes(text)) {
    return `${label}: ${JSON.stringify(text)} is not one of ${JSON.stringify(texts)}`;
  }
  return undefined;
}

function pathViolations({ request }: Modelled, sent: SentRequest): string[] {
  const pattern = new RegExp(
    `^${escapeRegExp(request.path).replaceAll(escapeRegExp("{param}"), "([^/]*)")}$`,
  );
  const match = pattern.exec(sent.path);
  if (!match) {
    return [`path ${sent.path} does not match ${request.path}`];
  }
  return request.pathParameters.flatMap((parameter, index) => {
    if (parameter.unverified) {
      return [];
    }
    const segment = decodeURIComponent(match[index + 1] ?? "");
    const violation = valueViolation(
      parameter.values,
      segment,
      `path parameter ${index}`,
    );
    return violation ? [violation] : [];
  });
}

function isArrayValue(checker: ts.TypeChecker, value: SentValue): boolean {
  if (value.kind === "empty") {
    return false;
  }
  return (
    value.itemOf !== undefined ||
    (value.kind === "type" &&
      (checker.isArrayType(value.type) || checker.isTupleType(value.type)))
  );
}

interface ModelledField {
  name: string;
  values: SentValue[];
  optional: boolean;
}

interface ModelledFields {
  fields: ModelledField[];
  anyKey: boolean;
}

// A variant that keeps its declared type claims that type's properties are sent unchanged.
function modelledFields(
  checker: ts.TypeChecker,
  variant: Exclude<SentPayload, { kind: "nothing" }>,
): ModelledFields | undefined {
  if (variant.kind === "fields") {
    return { fields: variant.fields, anyKey: variant.indexes.length > 0 };
  }
  const { type } = variant;
  const isObject =
    (type.flags & ts.TypeFlags.Object) !== 0 &&
    !checker.isArrayType(type) &&
    !checker.isTupleType(type);
  if (!isObject) {
    return undefined;
  }
  return {
    fields: type.getProperties().map((property) => ({
      name: property.name,
      values: [{ kind: "type", type: checker.getTypeOfSymbol(property) }],
      optional: (property.flags & ts.SymbolFlags.Optional) !== 0,
    })),
    anyKey: checker.getIndexInfosOfType(type).length > 0,
  };
}

function queryVariantViolations(
  checker: ts.TypeChecker,
  variant: SentPayload,
  entries: [string, string][],
): string[] {
  if (variant.kind === "nothing") {
    return entries.map(
      ([key]) => `query key ${key} is sent but nothing is modelled`,
    );
  }
  const modelled = modelledFields(checker, variant);
  if (!modelled) {
    return [];
  }
  const violations: string[] = [];
  const names = new Set(entries.map(([key]) => key));
  for (const name of names) {
    const field = modelled.fields.find((candidate) => candidate.name === name);
    const sentValues = entries.filter(([key]) => key === name);
    if (!field) {
      if (!modelled.anyKey) {
        violations.push(`query key ${name} is not a modelled field`);
      }
      continue;
    }
    if (
      sentValues.length > 1 &&
      !field.values.some((value) => isArrayValue(checker, value))
    ) {
      violations.push(`query key ${name} is sent ${sentValues.length} times`);
    }
    for (const [, text] of sentValues) {
      const violation = valueViolation(field.values, text, `query key ${name}`);
      if (violation) {
        violations.push(violation);
      }
    }
  }
  for (const field of modelled.fields) {
    if (!field.optional && !names.has(field.name)) {
      violations.push(`required query key ${field.name} is not sent`);
    }
  }
  return violations;
}

function bodyVariantViolations(
  checker: ts.TypeChecker,
  variant: SentPayload,
  body: SentBody,
): string[] {
  if (variant.kind === "nothing") {
    return body.kind === "none"
      ? []
      : ["a body is sent but nothing is modelled"];
  }
  if (body.kind === "none") {
    return ["no body is sent but one is modelled"];
  }
  const modelled = modelledFields(checker, variant);
  if (!modelled) {
    return [];
  }
  if (body.kind !== "json" || !isRecord(body.value)) {
    return ["the body is not a JSON object"];
  }
  const sentKeys = Object.keys(body.value);
  return [
    ...sentKeys
      .filter(
        (key) =>
          !modelled.anyKey &&
          !modelled.fields.some((field) => field.name === key),
      )
      .map((key) => `body key ${key} is not a modelled field`),
    ...modelled.fields
      .filter((field) => !field.optional && !sentKeys.includes(field.name))
      .map((field) => `required body key ${field.name} is not sent`),
  ];
}

/** Why the model does not allow this outcome; empty when it does. */
function violations(modelled: Modelled, outcome: Outcome): string[] {
  const { request, checker } = modelled;
  if (request.unverified) {
    return [];
  }
  if (request.failure || outcome.kind === "thrown") {
    return request.failure && outcome.kind === "thrown"
      ? []
      : [`failure ${request.failure ?? "is not modelled"} vs ${outcome.kind}`];
  }
  const sent = outcome.request;
  const matchingVariant = (variantViolations: string[][]) =>
    variantViolations.some((list) => !list.length)
      ? []
      : variantViolations.flat();
  return [
    ...(sent.method === request.method
      ? []
      : [`method ${sent.method} is not ${request.method}`]),
    ...pathViolations(modelled, sent),
    ...(request.query.unverified
      ? []
      : matchingVariant(
          request.query.variants.map((variant) =>
            queryVariantViolations(checker, variant, sent.query),
          ),
        )),
    ...(request.body.unverified
      ? []
      : matchingVariant(
          request.body.variants.map((variant) =>
            bodyVariantViolations(checker, variant, sent.body),
          ),
        )),
  ];
}

function sentRequest(request: Partial<SentRequest>): Outcome {
  return {
    kind: "sent",
    request: {
      method: "GET",
      path: "/api/x",
      query: [],
      body: { kind: "none" },
      ...request,
    },
  };
}

async function expectConformance(
  fixture: Fixture,
  expected: Outcome,
  ruleNotApplied?: Outcome,
) {
  const modelled = model(fixture);
  const outcome = await send(fixture);
  expect(outcome).toEqual(expected);
  expect(violations(modelled, outcome)).toEqual([]);
  if (ruleNotApplied) {
    expect(violations(modelled, ruleNotApplied)).not.toEqual([]);
  }
  return modelled;
}

describe("modelClientRequest against the real API client", () => {
  beforeEach(() => {
    requestInits.splice(0);
    globalThis.Request = RecordingRequest;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.Request = OriginalRequest;
    jest.restoreAllMocks();
  });

  it("should send GET when the request names no method", async () => {
    await expectConformance(
      {
        endpoint: "{ query: (id: number) => ({ url: `/api/x/${id}` }) }",
        argument: "7",
      },
      sentRequest({ path: "/api/x/7" }),
      sentRequest({ method: "POST", path: "/api/x/7" }),
    );
  });

  it("should throw for a method the client does not support", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          '{ query: (_: void) => ({ method: "PATCH", url: "/api/x" }) }',
        argument: "undefined",
      },
      { kind: "thrown" },
      sentRequest({ method: "PATCH" }),
    );
    expect(request.failure).toMatch(/Invalid HTTP method/);
  });

  it("should send a JSON body for a non-GET request", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (body: { name: string }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: '{ name: "n" }',
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { name: "n" } },
      }),
      sentRequest({ method: "POST" }),
    );
  });

  it("should send a GET body as query parameters", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (body: { name: string }) => ({ url: "/api/x", body }) }',
        argument: '{ name: "n" }',
      },
      sentRequest({ query: [["name", "n"]] }),
      sentRequest({ body: { kind: "json", value: { name: "n" } } }),
    );
  });

  it.each([
    ["void", "undefined"],
    ["null", "null"],
  ])("should send no query parameters for %s params", async (type, value) => {
    await expectConformance(
      {
        endpoint: `{ query: (params: ${type}) => ({ url: "/api/x", params }) }`,
        argument: value,
      },
      sentRequest({}),
      sentRequest({ query: [["key", "value"]] }),
    );
  });

  it.each([
    ["null", "null"],
    ["undefined", "undefined"],
  ])("should leave out a %s query value", async (type, value) => {
    await expectConformance(
      {
        endpoint: `{ query: (params: { skipped: ${type}; kept: string }) => ({ url: "/api/x", params }) }`,
        argument: `{ skipped: ${value}, kept: "k" }`,
      },
      sentRequest({ query: [["kept", "k"]] }),
      sentRequest({
        query: [
          ["skipped", value],
          ["kept", "k"],
        ],
      }),
    );
  });

  it("should leave out a nullable query value that is null", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { q: string | null; kept: string }) => ({ url: "/api/x", params }) }',
        argument: '{ q: null, kept: "k" }',
      },
      sentRequest({ query: [["kept", "k"]] }),
    );
  });

  it("should send number and boolean query values as text", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { limit: number; archived: boolean }) => ({ url: "/api/x", params }) }',
        argument: "{ limit: 10, archived: true }",
      },
      sentRequest({
        query: [
          ["limit", "10"],
          ["archived", "true"],
        ],
      }),
      sentRequest({ query: [["limit", "10"]] }),
    );
  });

  it("should send an object query value as [object Object]", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { options: { a: number } }) => ({ url: "/api/x", params }) }',
        argument: "{ options: { a: 1 } }",
      },
      sentRequest({ query: [["options", "[object Object]"]] }),
      sentRequest({ query: [["options", '{"a":1}']] }),
    );
  });

  it("should send null and undefined array items as text", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { ids: (null | undefined)[] }) => ({ url: "/api/x", params }) }',
        argument: "{ ids: [null, undefined] }",
      },
      sentRequest({
        query: [
          ["ids", "null"],
          ["ids", "undefined"],
        ],
      }),
      sentRequest({
        query: [
          ["ids", "nil"],
          ["ids", "undefined"],
        ],
      }),
    );
  });

  it("should send a boolean query value as true or false", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { flag: boolean }) => ({ url: "/api/x", params }) }',
        argument: "{ flag: true }",
      },
      sentRequest({ query: [["flag", "true"]] }),
      sentRequest({ query: [["flag", "1"]] }),
    );
  });

  it("should leave out an empty array and repeat the key for each array item", async () => {
    const endpoint =
      '{ query: (params: { ids: number[] }) => ({ url: "/api/x", params }) }';
    await expectConformance(
      { endpoint, argument: "{ ids: [] }" },
      sentRequest({}),
    );
    await expectConformance(
      { endpoint, argument: "{ ids: [1, 2] }" },
      sentRequest({
        query: [
          ["ids", "1"],
          ["ids", "2"],
        ],
      }),
    );
  });

  it("should fill a URL tag from params and leave the other params in the query", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { cardId: number; q: string }) => ({ url: "/api/x/:cardId/query", params }) }',
        argument: '{ cardId: 5, q: "text" }',
      },
      sentRequest({ path: "/api/x/5/query", query: [["q", "text"]] }),
      sentRequest({
        path: "/api/x/5/query",
        query: [
          ["cardId", "5"],
          ["q", "text"],
        ],
      }),
    );
  });

  it("should fill a URL tag with the text String gives for a boolean", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { flag: boolean }) => ({ url: "/api/x/:flag", params }) }',
        argument: "{ flag: true }",
      },
      sentRequest({ path: "/api/x/true" }),
      sentRequest({ path: "/api/x/1" }),
    );
  });

  it("should fill a URL tag with the text String gives for an object", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { options: { a: number } }) => ({ url: "/api/x/:options", params }) }',
        argument: "{ options: { a: 1 } }",
      },
      sentRequest({ path: "/api/x/%5Bobject%20Object%5D" }),
      sentRequest({ path: "/api/x/%7B%22a%22%3A1%7D" }),
    );
  });

  it("should send a boolean template span as its text", async () => {
    await expectConformance(
      {
        endpoint: "{ query: (flag: boolean) => ({ url: `/api/x/${flag}` }) }",
        argument: "true",
      },
      sentRequest({ path: "/api/x/true" }),
      sentRequest({ path: "/api/x/1" }),
    );
  });

  it("should send an object template span as [object Object]", async () => {
    await expectConformance(
      {
        endpoint:
          "{ query: (options: { a: number }) => ({ url: `/api/x/${options}` }) }",
        argument: "{ a: 1 }",
      },
      sentRequest({ path: "/api/x/[object%20Object]" }),
      sentRequest({ path: "/api/x/%7B%22a%22%3A1%7D" }),
    );
  });

  it("should send a tuple template span as its comma-joined items", async () => {
    await expectConformance(
      {
        endpoint: "{ query: (pair: [1, null]) => ({ url: `/api/x/${pair}` }) }",
        argument: "[1, null]",
      },
      sentRequest({ path: "/api/x/1," }),
      sentRequest({ path: "/api/x/1,null" }),
    );
  });

  it("should send an undefined template span as undefined", async () => {
    await expectConformance(
      {
        endpoint: "{ query: (id: undefined) => ({ url: `/api/x/${id}` }) }",
        argument: "undefined",
      },
      sentRequest({ path: "/api/x/undefined" }),
      sentRequest({ path: "/api/x/missing" }),
    );
  });

  it("should encode a URL tag value", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { name: string }) => ({ url: "/api/x/:name", params }) }',
        argument: '{ name: "a/b" }',
      },
      sentRequest({ path: "/api/x/a%2Fb" }),
    );
  });

  it("should fill a URL tag from the body when the params value is undefined", async () => {
    await expectConformance(
      {
        declarations:
          "type Args = { params: { token: undefined }; body: { token: string; name: string } };",
        endpoint:
          '{ query: (arg: Args) => ({ method: "POST", url: "/api/x/:token", params: arg.params, body: arg.body }) }',
        argument:
          '{ params: { token: undefined }, body: { token: "t", name: "n" } }',
      },
      sentRequest({
        method: "POST",
        path: "/api/x/t",
        body: { kind: "json", value: { name: "n" } },
      }),
      sentRequest({
        method: "POST",
        path: "/api/x/t",
        body: { kind: "json", value: { token: "t", name: "n" } },
      }),
    );
  });

  it("should fill a URL tag from params and keep the body key when the params value is defined", async () => {
    await expectConformance(
      {
        declarations:
          "type Args = { params: { token: string | undefined }; body: { token: string; name: string } };",
        endpoint:
          '{ query: (arg: Args) => ({ method: "POST", url: "/api/x/:token", params: arg.params, body: arg.body }) }',
        argument: '{ params: { token: "p" }, body: { token: "t", name: "n" } }',
      },
      sentRequest({
        method: "POST",
        path: "/api/x/p",
        body: { kind: "json", value: { token: "t", name: "n" } },
      }),
    );
  });

  it("should fill a URL tag from the body and remove it when the params value may be undefined", async () => {
    await expectConformance(
      {
        declarations:
          "type Args = { params: { token: string | undefined }; body: { token: string; name: string } };",
        endpoint:
          '{ query: (arg: Args) => ({ method: "POST", url: "/api/x/:token", params: arg.params, body: arg.body }) }',
        argument:
          '{ params: { token: undefined }, body: { token: "t", name: "n" } }',
      },
      sentRequest({
        method: "POST",
        path: "/api/x/t",
        body: { kind: "json", value: { name: "n" } },
      }),
    );
  });

  it("should send an empty path segment when a URL tag has no value", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (params: { cardId?: number }) => ({ url: "/api/x/:cardId/query", params }) }',
        argument: "{}",
      },
      sentRequest({ path: "/api/x//query" }),
    );
  });

  it("should keep an inline query string from the URL template", async () => {
    await expectConformance(
      {
        endpoint:
          "{ query: (id: number) => ({ url: `/api/x/${id}?flag=true` }) }",
        argument: "1",
      },
      sentRequest({ path: "/api/x/1", query: [["flag", "true"]] }),
      sentRequest({ path: "/api/x/1", query: [["flag", "false"]] }),
    );
  });

  it("should encode a template span passed through encodeURIComponent", async () => {
    await expectConformance(
      {
        endpoint:
          "{ query: (id: string) => ({ url: `/api/x/${encodeURIComponent(id)}` }) }",
        argument: '"a b"',
      },
      sentRequest({ path: "/api/x/a%20b" }),
    );
  });

  it.each([
    [
      "params",
      '{ query: (params: { __rtkCacheKey: string; q: string }) => ({ url: "/api/x", params }) }',
      sentRequest({ query: [["q", "text"]] }),
      sentRequest({
        query: [
          ["__rtkCacheKey", "key"],
          ["q", "text"],
        ],
      }),
    ],
    [
      "body",
      '{ query: (body: { __rtkCacheKey: string; q: string }) => ({ method: "POST", url: "/api/x", body }) }',
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { q: "text" } },
      }),
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { __rtkCacheKey: "key", q: "text" } },
      }),
    ],
  ])(
    "should remove __rtkCacheKey from the %s",
    async (_channel, endpoint, expected, ruleNotApplied) => {
      await expectConformance(
        { endpoint, argument: '{ __rtkCacheKey: "key", q: "text" }' },
        expected,
        ruleNotApplied,
      );
    },
  );

  it.each(["FormData", "URLSearchParams"])(
    "should send nothing for a GET %s body",
    async (type) => {
      await expectConformance(
        {
          endpoint: `{ query: (body: ${type}) => ({ url: "/api/x", body }) }`,
          argument: `new ${type}()`,
        },
        sentRequest({}),
        sentRequest({ body: { kind: "raw", type } }),
      );
    },
  );

  it.each(["FormData", "URLSearchParams"])(
    "should send a non-GET %s body as it is",
    async (type) => {
      const { request } = await expectConformance(
        {
          endpoint: `{ query: (body: ${type}) => ({ method: "POST", url: "/api/x", body }) }`,
          argument: `new ${type}()`,
        },
        sentRequest({ method: "POST", body: { kind: "raw", type } }),
      );
      expect(request.body.unverified).toMatch(/sent as-is/);
    },
  );

  it("should send a null non-GET body as an empty JSON object", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (body: null) => ({ method: "PUT", url: "/api/x", body }) }',
        argument: "null",
      },
      sentRequest({ method: "PUT", body: { kind: "json", value: {} } }),
      sentRequest({ method: "PUT" }),
    );
  });

  it("should send no body for a null GET body", async () => {
    await expectConformance(
      {
        endpoint: '{ query: (body: null) => ({ url: "/api/x", body }) }',
        argument: "null",
      },
      sentRequest({}),
      sentRequest({ body: { kind: "json", value: {} } }),
    );
  });

  it("should send no body for an undefined non-GET body", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (body: undefined) => ({ method: "PUT", url: "/api/x", body }) }',
        argument: "undefined",
      },
      sentRequest({ method: "PUT" }),
      sentRequest({ method: "PUT", body: { kind: "json", value: {} } }),
    );
  });

  it.each([
    [
      "an empty object",
      '{ query: (id: number) => ({ method: "DELETE", url: `/api/x/${id}`, body: {} }) }',
      "1",
    ],
    [
      "an empty object rest",
      '{ query: ({ id, ...body }: { id: number }) => ({ method: "DELETE", url: `/api/x/${id}`, body }) }',
      "{ id: 1 }",
    ],
  ])("should send a DELETE body of %s", async (_name, endpoint, argument) => {
    await expectConformance(
      { endpoint, argument },
      sentRequest({
        method: "DELETE",
        path: "/api/x/1",
        body: { kind: "json", value: {} },
      }),
      sentRequest({ method: "DELETE", path: "/api/x/1" }),
    );
  });

  it("should send no query parameters for an empty object rest in a GET body", async () => {
    await expectConformance(
      {
        endpoint:
          "{ query: ({ id, ...body }: { id: number }) => ({ url: `/api/x/${id}`, body }) }",
        argument: "{ id: 1 }",
      },
      sentRequest({ path: "/api/x/1" }),
      sentRequest({ path: "/api/x/1", query: [["id", "1"]] }),
    );
  });

  it("should leave a URL tag unverified when params keys are known only at runtime", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          '{ query: (params: Record<string, string>) => ({ url: "/api/x/:cardId", params }) }',
        argument: '{ cardId: "5", q: "text" }',
      },
      sentRequest({ path: "/api/x/5", query: [["q", "text"]] }),
    );
    expect(request.pathParameters[0]?.unverified).toMatch(/index signature/);
  });

  it("should mark GET query parameters unverified when an opaque value is merged with other fields", async () => {
    const { request } = await expectConformance(
      {
        declarations: "type Args = { params: object; body: { name: string } };",
        endpoint:
          '{ query: (arg: Args) => ({ url: "/api/x", params: arg.params, body: arg.body }) }',
        argument: '{ params: { q: "text" }, body: { name: "n" } }',
      },
      sentRequest({
        query: [
          ["q", "text"],
          ["name", "n"],
        ],
      }),
    );
    expect(request.query.unverified).toMatch(/known only at runtime/);
  });

  it("should send no query parameters for an empty object rest in params", async () => {
    await expectConformance(
      {
        endpoint:
          "{ query: ({ id, ...params }: { id: number }) => ({ url: `/api/x/${id}`, params }) }",
        argument: "{ id: 1 }",
      },
      sentRequest({ path: "/api/x/1" }),
      sentRequest({ path: "/api/x/1", query: [["id", "1"]] }),
    );
  });

  it("should leave an undefined property out of a JSON body", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (body: { name: string; note: undefined }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: '{ name: "n", note: undefined }',
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { name: "n" } },
      }),
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { name: "n", note: null } },
      }),
    );
  });

  it("should throw before sending an array body", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          '{ query: (body: string[]) => ({ method: "POST", url: "/api/x", body }) }',
        argument: '["a"]',
      },
      { kind: "thrown" },
      sentRequest({ method: "POST", body: { kind: "json", value: ["a"] } }),
    );
    expect(request.failure).toMatch(/array body/);
  });

  it("should mark a key sent from both GET params and body unverified", async () => {
    const { request } = await expectConformance(
      {
        declarations:
          "type Args = { params: { q: string }; body: { q: string } };",
        endpoint:
          '{ query: (arg: Args) => ({ url: "/api/x", params: arg.params, body: arg.body }) }',
        argument: '{ params: { q: "a" }, body: { q: "b" } }',
      },
      sentRequest({
        query: [
          ["q", "a"],
          ["q", "b"],
        ],
      }),
    );
    expect(request.query.unverified).toMatch(/twice/);
  });

  it("should mark a request unverified when extraOptions replaces its URL", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          '{ query: (_: void) => ({ url: "/api/x" }), extraOptions: { url: "/api/y" } }',
        argument: "undefined",
      },
      sentRequest({ path: "/api/y" }),
    );
    expect(request.unverified).toMatch(/extraOptions/);
    expect(request.path).toBe("/api/x");
  });
});
