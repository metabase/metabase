import type { BaseQueryApi } from "@reduxjs/toolkit/query/react";
import fetchMock from "fetch-mock";
import ts from "typescript";

import { baseQuery } from "metabase/api/api";

import { type ClientRequest, modelClientRequest } from "./client-request";
import { resolveRtkRequest } from "./rtk-request";
import { type Shape, describeShape } from "./shape";
import {
  ENDPOINT_PRELUDE,
  cleanupFixtures,
  endpointObject,
  programFrom,
} from "./test-fixtures";

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

afterEach(cleanupFixtures);

// The same source is compiled for the model and run for the client, so the argument has the type the model reads.
function fixtureSource(
  { declarations = "", endpoint }: Omit<Fixture, "argument">,
  arguments_: string[],
) {
  return `
    ${ENDPOINT_PRELUDE}
    ${declarations}
    const endpoint = defineEndpoint(${endpoint});
    const arguments_: Parameters<typeof endpoint.query>[0][] = [${arguments_.join(",")}];
  `;
}

function model(source: string): Modelled {
  const { program, files, checker } = programFrom({
    "request.ts": source,
  });
  const config = endpointObject(program, files["request.ts"] ?? "");
  const rtk = resolveRtkRequest(config);
  if (!rtk) {
    throw new Error("The fixture's query function is not a static request.");
  }
  return { request: modelClientRequest(checker, rtk, config), checker };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadFixture(source: string): {
  query: (argument: unknown) => unknown;
  extraOptions: unknown;
  arguments_: unknown[];
} {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const loaded: unknown = new Function(
    `${outputText}\nreturn { endpoint, arguments_ };`,
  )();
  if (
    !isRecord(loaded) ||
    !isRecord(loaded.endpoint) ||
    typeof loaded.endpoint.query !== "function" ||
    !Array.isArray(loaded.arguments_)
  ) {
    throw new Error("The fixture did not define an endpoint query.");
  }
  const { query } = loaded.endpoint;
  return {
    query: (argument) => query(argument),
    extraOptions: loaded.endpoint.extraOptions,
    arguments_: loaded.arguments_,
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

async function send(
  { query, extraOptions }: ReturnType<typeof loadFixture>,
  argument: unknown,
): Promise<Outcome> {
  fetchMock.clearHistory();
  requestInits.splice(0);
  fetchMock.route("begin:http", {});
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

type PayloadProjection = string | Record<string, string[]>;
interface Projection {
  method: string;
  path: string;
  parameters: (string | string[])[];
  query: string | PayloadProjection[];
  body: string | PayloadProjection[];
  failure: boolean;
  unverified: boolean;
}

function projected(overrides: Partial<Projection>): Projection {
  return {
    method: "GET",
    path: "/api/x",
    parameters: [],
    query: ["nothing"],
    body: ["nothing"],
    failure: false,
    unverified: false,
    ...overrides,
  };
}

function valuesProjection(checker: ts.TypeChecker, values: Shape[]): string[] {
  return values
    .flatMap((value): string[] => {
      if (value.kind === "union") {
        return valuesProjection(checker, value.members);
      }
      if (value.kind === "items") {
        return valuesProjection(checker, [value.item]).map(
          (text) => `each ${text}`,
        );
      }
      return [
        value.kind === "throws" || value.kind === "unverified"
          ? value.kind
          : describeShape(checker, value),
      ];
    })
    .sort();
}

function partProjection(
  checker: ts.TypeChecker,
  part: ClientRequest["query"],
): string | PayloadProjection[] {
  if (part.unverified) {
    return "unverified";
  }
  return part.variants.map((variant) => {
    if (variant.kind === "type") {
      return variant.type.flags & ts.TypeFlags.Undefined
        ? "nothing"
        : checker.typeToString(variant.type);
    }
    if (variant.kind !== "object") {
      throw new Error(`Unexpected payload shape ${variant.kind}`);
    }
    return Object.fromEntries([
      ...variant.fields.map((field) => [
        `${field.name}${field.optional ? "?" : ""}`,
        valuesProjection(checker, [field.shape]),
      ]),
      ...variant.indexes.map((index) => [
        `[${checker.typeToString(index.keyType)}]`,
        valuesProjection(checker, [index.shape]),
      ]),
    ]);
  });
}

function projection({ checker, request }: Modelled): Projection | "unverified" {
  if (request.unverified) {
    return "unverified";
  }
  return {
    method: request.method,
    path: request.path,
    parameters: request.pathParameters.map((parameter) =>
      parameter.unverified
        ? "unverified"
        : valuesProjection(checker, parameter.values),
    ),
    query: partProjection(checker, request.query),
    body: partProjection(checker, request.body),
    failure: request.failure !== undefined,
    unverified: request.unverified !== undefined,
  };
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
  fixture: Omit<Fixture, "argument">,
  expectedModel: Projection | "unverified",
  examples: [
    { argument: string; expected: Outcome },
    ...{ argument: string; expected: Outcome }[],
  ],
) {
  const source = fixtureSource(
    fixture,
    examples.map(({ argument }) => argument),
  );
  expect(projection(model(source))).toEqual(expectedModel);
  const loaded = loadFixture(source);
  for (const [index, { expected }] of examples.entries()) {
    expect(await send(loaded, loaded.arguments_[index])).toEqual(expected);
  }
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

  it.each([
    ["void", "undefined"],
    ["undefined", "undefined"],
    ["null", "null"],
  ])("should send no query parameters for %s params", async (type, value) => {
    await expectConformance(
      {
        endpoint: `{ query: (params: ${type}) => ({ url: "/api/x", params }) }`,
      },
      projected({}),
      [{ argument: value, expected: sentRequest({}) }],
    );
  });

  it.each([
    ["null", "null"],
    ["undefined", "undefined"],
  ])("should leave out a %s query value", async (type, value) => {
    await expectConformance(
      {
        endpoint: `{ query: (params: { skipped: ${type}; kept: string }) => ({ url: "/api/x", params }) }`,
      },
      projected({ query: [{ kept: ["string"] }] }),
      [
        {
          argument: `{ skipped: ${value}, kept: "k" }`,
          expected: sentRequest({ query: [["kept", "k"]] }),
        },
      ],
    );
  });

  it("should leave out an empty array and repeat the key for each array item", async () => {
    const endpoint =
      '{ query: (params: { ids: number[] }) => ({ url: "/api/x", params }) }';
    await expectConformance(
      { endpoint },
      projected({ query: [{ "ids?": ["number[]"] }] }),
      [
        { argument: "{ ids: [] }", expected: sentRequest({}) },
        {
          argument: "{ ids: [1, 2] }",
          expected: sentRequest({
            query: [
              ["ids", "1"],
              ["ids", "2"],
            ],
          }),
        },
      ],
    );
  });

  it.each([
    [
      "params",
      '{ query: (params: { __rtkCacheKey: string; q: string }) => ({ url: "/api/x", params }) }',
      sentRequest({ query: [["q", "text"]] }),
    ],
    [
      "body",
      '{ query: (body: { __rtkCacheKey: string; q: string }) => ({ method: "POST", url: "/api/x", body }) }',
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { q: "text" } },
      }),
    ],
  ])(
    "should remove __rtkCacheKey from the %s",
    async (_channel, endpoint, expected) => {
      await expectConformance(
        { endpoint },
        projected(
          _channel === "body"
            ? { method: "POST", body: [{ q: ["string"] }] }
            : { query: [{ q: ["string"] }] },
        ),
        [{ argument: '{ __rtkCacheKey: "key", q: "text" }', expected }],
      );
    },
  );

  it.each(["FormData", "URLSearchParams"])(
    "should send nothing for a GET %s body",
    async (type) => {
      await expectConformance(
        { endpoint: `{ query: (body: ${type}) => ({ url: "/api/x", body }) }` },
        projected({}),
        [{ argument: `new ${type}()`, expected: sentRequest({}) }],
      );
    },
  );

  it.each(["FormData", "URLSearchParams"])(
    "should send a non-GET %s body as it is",
    async (type) => {
      await expectConformance(
        {
          endpoint: `{ query: (body: ${type}) => ({ method: "POST", url: "/api/x", body }) }`,
        },
        projected({ method: "POST", body: "unverified" }),
        [
          {
            argument: `new ${type}()`,
            expected: sentRequest({
              method: "POST",
              body: { kind: "raw", type },
            }),
          },
        ],
      );
    },
  );

  it.each([
    ["a lib object", "Date", "new Date(0)"],
    ["a primitive", "number", "7"],
  ])(
    "should leave a body that is %s unverified",
    async (_name, type, argument) => {
      await expectConformance(
        {
          endpoint: `{ query: (body: ${type}) => ({ method: "POST", url: "/api/x", body }) }`,
        },
        projected({ method: "POST", body: "unverified" }),
        [
          {
            argument,
            expected: sentRequest({
              method: "POST",
              body: { kind: "json", value: {} },
            }),
          },
        ],
      );
    },
  );

  // `JSON.stringify` throws for a bigint, so the client never sends this body.

  it("should retain the absent query alternative of a nullable GET body", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (body: { limit: number } | null) => ({ url: "/api/x", params: {}, body }) }',
      },
      projected({ query: [{ limit: ["number"] }, "nothing"] }),
      [{ argument: "null", expected: sentRequest({}) }],
    );
  });

  const cases: [string, Fixture, Outcome, Projection | "unverified"][] = [
    [
      "should send GET when the request names no method",
      {
        endpoint: "{ query: (id: number) => ({ url: `/api/x/${id}` }) }",
        argument: "7",
      },
      sentRequest({ path: "/api/x/7" }),
      projected({ path: "/api/x/{param}", parameters: [["number"]] }),
    ],
    [
      "should send a JSON body for a non-GET request",
      {
        endpoint:
          '{ query: (body: { name: string }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: '{ name: "n" }',
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { name: "n" } },
      }),
      projected({ method: "POST", body: [{ name: ["string"] }] }),
    ],
    [
      "should send a GET body as query parameters",
      {
        endpoint:
          '{ query: (body: { name: string }) => ({ url: "/api/x", body }) }',
        argument: '{ name: "n" }',
      },
      sentRequest({ query: [["name", "n"]] }),
      projected({ query: [{ name: ["string"] }] }),
    ],
    [
      "should leave out a nullable query value that is null",
      {
        endpoint:
          '{ query: (params: { q: string | null; kept: string }) => ({ url: "/api/x", params }) }',
        argument: '{ q: null, kept: "k" }',
      },
      sentRequest({ query: [["kept", "k"]] }),
      projected({ query: [{ "q?": ["string"], kept: ["string"] }] }),
    ],
    [
      "should send number and boolean query values as text",
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
      projected({
        query: [{ limit: ["number"], archived: ['"false"', '"true"'] }],
      }),
    ],
    [
      "should leave an object query value unverified, because its text is known only at runtime",
      {
        endpoint:
          '{ query: (params: { options: { a: number } }) => ({ url: "/api/x", params }) }',
        argument: "{ options: { a: 1 } }",
      },
      sentRequest({ query: [["options", "[object Object]"]] }),
      projected({ query: "unverified" }),
    ],
    [
      "should send null and undefined array items as text",
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
      projected({ query: [{ "ids?": ['each "null"', 'each "undefined"'] }] }),
    ],
    [
      "should send a boolean query value as true or false",
      {
        endpoint:
          '{ query: (params: { flag: boolean }) => ({ url: "/api/x", params }) }',
        argument: "{ flag: true }",
      },
      sentRequest({ query: [["flag", "true"]] }),
      projected({ query: [{ flag: ['"false"', '"true"'] }] }),
    ],
    [
      "should fill a URL tag from params and leave the other params in the query",
      {
        endpoint:
          '{ query: (params: { cardId: number; q: string }) => ({ url: "/api/x/:cardId/query", params }) }',
        argument: '{ cardId: 5, q: "text" }',
      },
      sentRequest({ path: "/api/x/5/query", query: [["q", "text"]] }),
      projected({
        path: "/api/x/{param}/query",
        parameters: [["number"]],
        query: [{ q: ["string"] }],
      }),
    ],
    [
      "should fill a URL tag with the text String gives for a boolean",
      {
        endpoint:
          '{ query: (params: { flag: boolean }) => ({ url: "/api/x/:flag", params }) }',
        argument: "{ flag: true }",
      },
      sentRequest({ path: "/api/x/true" }),
      projected({
        path: "/api/x/{param}",
        parameters: [['"false"', '"true"']],
      }),
    ],
    [
      "should leave a URL tag filled from an object unverified, because its text is known only at runtime",
      {
        endpoint:
          '{ query: (params: { options: { a: number } }) => ({ url: "/api/x/:options", params }) }',
        argument: "{ options: { a: 1 } }",
      },
      sentRequest({ path: "/api/x/%5Bobject%20Object%5D" }),
      projected({ path: "/api/x/{param}", parameters: ["unverified"] }),
    ],
    [
      "should send a boolean template span as its text",
      {
        endpoint: "{ query: (flag: boolean) => ({ url: `/api/x/${flag}` }) }",
        argument: "true",
      },
      sentRequest({ path: "/api/x/true" }),
      projected({
        path: "/api/x/{param}",
        parameters: [['"false"', '"true"']],
      }),
    ],
    [
      "should leave an object template span unverified, because its text is known only at runtime",
      {
        endpoint:
          "{ query: (options: { a: number }) => ({ url: `/api/x/${options}` }) }",
        argument: "{ a: 1 }",
      },
      sentRequest({ path: "/api/x/[object%20Object]" }),
      projected({ path: "/api/x/{param}", parameters: ["unverified"] }),
    ],
    [
      "should leave a tuple template span unverified, because its text is known only at runtime",
      {
        endpoint: "{ query: (pair: [1, null]) => ({ url: `/api/x/${pair}` }) }",
        argument: "[1, null]",
      },
      sentRequest({ path: "/api/x/1," }),
      projected({ path: "/api/x/{param}", parameters: ["unverified"] }),
    ],
    [
      "should send an undefined template span as undefined",
      {
        endpoint: "{ query: (id: undefined) => ({ url: `/api/x/${id}` }) }",
        argument: "undefined",
      },
      sentRequest({ path: "/api/x/undefined" }),
      projected({ path: "/api/x/{param}", parameters: [['"undefined"']] }),
    ],
    [
      "should encode a URL tag value",
      {
        endpoint:
          '{ query: (params: { name: string }) => ({ url: "/api/x/:name", params }) }',
        argument: '{ name: "a/b" }',
      },
      sentRequest({ path: "/api/x/a%2Fb" }),
      projected({ path: "/api/x/{param}", parameters: [["string"]] }),
    ],
    [
      "should fill a URL tag from the body when the params value is undefined",
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
      "unverified",
    ],
    [
      "should fill a URL tag from params and keep the body key when the params value is defined",
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
      "unverified",
    ],
    [
      "should fill a URL tag from the body and remove it when the params value may be undefined",
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
      "unverified",
    ],
    [
      "should send an empty path segment when a URL tag has no value",
      {
        endpoint:
          '{ query: (params: { cardId?: number }) => ({ url: "/api/x/:cardId/query", params }) }',
        argument: "{}",
      },
      sentRequest({ path: "/api/x//query" }),
      projected({
        path: "/api/x/{param}/query",
        parameters: [['""', "number"]],
      }),
    ],
    [
      "should keep an inline query string from the URL template",
      {
        endpoint:
          "{ query: (id: number) => ({ url: `/api/x/${id}?flag=true` }) }",
        argument: "1",
      },
      sentRequest({ path: "/api/x/1", query: [["flag", "true"]] }),
      projected({
        path: "/api/x/{param}",
        parameters: [["number"]],
        query: [{ flag: ['"true"'] }],
      }),
    ],
    [
      "should leave the query unverified when an inline query span is not one known text",
      {
        endpoint:
          "{ query: (flag: boolean) => ({ url: `/api/x?a=${flag}&b=${encodeURIComponent(flag)}` }) }",
        argument: "true",
      },
      sentRequest({
        query: [
          ["a", "true"],
          ["b", "true"],
        ],
      }),
      projected({ query: "unverified" }),
    ],
    [
      "should leave dynamic inline query separators unverified",
      {
        endpoint:
          '{ query: (value: "x&y=1") => ({ url: `/api/x?v=${value}` }) }',
        argument: '"x&y=1"',
      },
      sentRequest({
        query: [
          ["v", "x"],
          ["y", "1"],
        ],
      }),
      projected({ query: "unverified" }),
    ],
    [
      "should read inline query text after URLSearchParams decoding",
      {
        endpoint: "{ query: (_: void) => ({ url: `/api/x?q=a+b%21#skip=1` }) }",
        argument: "undefined",
      },
      sentRequest({ query: [["q", "a b!"]] }),
      projected({ query: [{ q: ['"a b!"'] }] }),
    ],
    [
      "should not treat a local encodeURIComponent as the global one",
      {
        endpoint:
          '{ query: (id: number) => { function encodeURIComponent(value: number): "fixed" { return "fixed"; } return { url: `/api/x/${encodeURIComponent(id)}` }; } }',
        argument: "7",
      },
      sentRequest({ path: "/api/x/fixed" }),
      projected({ path: "/api/x/{param}", parameters: [['"fixed"']] }),
    ],
    [
      "should encode a template span passed through encodeURIComponent",
      {
        endpoint:
          "{ query: (id: number) => ({ url: `/api/x/${encodeURIComponent(id)}` }) }",
        argument: "7",
      },
      sentRequest({ path: "/api/x/7" }),
      projected({ path: "/api/x/{param}", parameters: [["number"]] }),
    ],
    [
      "should send a class instance body without its methods and accessors",
      {
        declarations:
          'class Point { x = 1; get sum() { return 2; } toText() { return "p"; } }',
        endpoint:
          '{ query: (body: Point) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "new Point()",
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { x: 1 } },
      }),
      projected({ method: "POST", body: [{ x: ["number"] }] }),
    ],
    [
      "should send a Date body field as the text its toJSON gives",
      {
        endpoint:
          '{ query: (body: { when: Date }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "{ when: new Date(0) }",
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { when: "1970-01-01T00:00:00.000Z" } },
      }),
      projected({ method: "POST", body: [{ when: ["string"] }] }),
    ],
    [
      "should send an undefined array item in a body as null",
      {
        endpoint:
          '{ query: (body: { ids: (number | undefined)[] }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "{ ids: [1, undefined] }",
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { ids: [1, null] } },
      }),
      projected({ method: "POST", body: [{ ids: ["(number | null)[]"] }] }),
    ],
    [
      "should send a Map body field and a function body field as JSON.stringify writes them",
      {
        endpoint:
          '{ query: (body: { tags: Map<string, string>; run: () => void; name: string }) => ({ method: "POST", url: "/api/x", body }) }',
        argument:
          '{ tags: new Map([["a", "b"]]), run: () => undefined, name: "n" }',
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { tags: {}, name: "n" } },
      }),
      projected({ method: "POST", body: [{ tags: ["{}"], name: ["string"] }] }),
    ],
    [
      "should send a numeric object key as text",
      {
        endpoint:
          '{ query: (body: { collections: Record<number, boolean> }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "{ collections: { 1: true } }",
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { collections: { "1": true } } },
      }),
      projected({
        method: "POST",
        body: [{ collections: ["Record<number, boolean>"] }],
      }),
    ],
    [
      "should send a null non-GET body as an empty JSON object",
      {
        endpoint:
          '{ query: (body: null) => ({ method: "PUT", url: "/api/x", body }) }',
        argument: "null",
      },
      sentRequest({ method: "PUT", body: { kind: "json", value: {} } }),
      projected({ method: "PUT", body: [{}] }),
    ],
    [
      "should send no body for a null GET body",
      {
        endpoint: '{ query: (body: null) => ({ url: "/api/x", body }) }',
        argument: "null",
      },
      sentRequest({}),
      projected({}),
    ],
    [
      "should send no body for an undefined non-GET body",
      {
        endpoint:
          '{ query: (body: undefined) => ({ method: "PUT", url: "/api/x", body }) }',
        argument: "undefined",
      },
      sentRequest({ method: "PUT" }),
      projected({ method: "PUT" }),
    ],
    [
      "should send a DELETE body of an empty object literal",
      {
        endpoint:
          '{ query: (id: number) => ({ method: "DELETE", url: `/api/x/${id}`, body: {} }) }',
        argument: "1",
      },
      sentRequest({
        method: "DELETE",
        path: "/api/x/1",
        body: { kind: "json", value: {} },
      }),
      projected({
        path: "/api/x/{param}",
        parameters: [["number"]],
        method: "DELETE",
        body: [{}],
      }),
    ],
    [
      "should leave a DELETE body built from an empty object rest unverified",
      {
        endpoint:
          '{ query: ({ id, ...body }: { id: number }) => ({ method: "DELETE", url: `/api/x/${id}`, body }) }',
        argument: "{ id: 1 }",
      },
      sentRequest({
        method: "DELETE",
        path: "/api/x/1",
        body: { kind: "json", value: {} },
      }),
      projected({
        path: "/api/x/{param}",
        parameters: [["number"]],
        method: "DELETE",
        body: "unverified",
      }),
    ],
    [
      "should leave the query unverified for an empty object rest in a GET body",
      {
        endpoint:
          "{ query: ({ id, ...body }: { id: number }) => ({ url: `/api/x/${id}`, body }) }",
        argument: "{ id: 1 }",
      },
      sentRequest({ path: "/api/x/1" }),
      projected({
        path: "/api/x/{param}",
        parameters: [["number"]],
        query: "unverified",
      }),
    ],
    [
      "should leave a URL tag unverified when params keys are known only at runtime",
      {
        endpoint:
          '{ query: (params: Record<string, string>) => ({ url: "/api/x/:cardId", params }) }',
        argument: '{ cardId: "5", q: "text" }',
      },
      sentRequest({ path: "/api/x/5", query: [["q", "text"]] }),
      "unverified",
    ],
    [
      "should mark GET query parameters unverified when a value with no declared keys is merged with other fields",
      {
        declarations: "type Args = { params: {}; body: { name: string } };",
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
      projected({ query: "unverified" }),
    ],
    [
      "should leave the query unverified for an empty object rest in params",
      {
        endpoint:
          "{ query: ({ id, ...params }: { id: number }) => ({ url: `/api/x/${id}`, params }) }",
        argument: "{ id: 1 }",
      },
      sentRequest({ path: "/api/x/1" }),
      projected({
        path: "/api/x/{param}",
        parameters: [["number"]],
        query: "unverified",
      }),
    ],
    [
      "should leave an undefined property out of a JSON body",
      {
        endpoint:
          '{ query: (body: { name: string; note: undefined }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: '{ name: "n", note: undefined }',
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { name: "n" } },
      }),
      projected({ method: "POST", body: [{ name: ["string"] }] }),
    ],
    [
      "should throw before sending an array body",
      {
        endpoint:
          '{ query: (body: string[]) => ({ method: "POST", url: "/api/x", body }) }',
        argument: '["a"]',
      },
      { kind: "thrown" },
      projected({ method: "POST", failure: true, query: [], body: [] }),
    ],
    [
      "should mark a key sent from both GET params and body unverified",
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
      projected({ query: "unverified" }),
    ],
    [
      "should mark a request unverified when extraOptions replaces its URL",
      {
        endpoint:
          '{ query: (_: void) => ({ url: "/api/x" }), extraOptions: { url: "/api/y" } }',
        argument: "undefined",
      },
      sentRequest({ path: "/api/y" }),
      "unverified",
    ],
    [
      "should leave a body that is an unknown value unverified",
      {
        endpoint:
          '{ query: (body: unknown) => ({ method: "POST", url: "/api/x", body }) }',
        argument: '{ any: "thing" }',
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { any: "thing" } },
      }),
      projected({ method: "POST", body: "unverified" }),
    ],
    [
      "should keep a nested field that drops undefined as optional in the JSON body",
      {
        declarations:
          "type Args = { inner: { a: string | undefined; b: number } };",
        endpoint:
          '{ query: (body: Args) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "{ inner: { a: undefined, b: 1 } }",
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { inner: { b: 1 } } },
      }),
      projected({
        method: "POST",
        body: [{ inner: ["{ a?: string; b: number; }"] }],
      }),
    ],
    [
      "should leave the query unverified when an inline query key is built at runtime",
      {
        declarations: 'const search: string = "built=later";',
        endpoint: "{ query: (_: void) => ({ url: `/api/x?${search}` }) }",
        argument: "undefined",
      },
      sentRequest({ query: [["built", "later"]] }),
      projected({ query: "unverified" }),
    ],
    [
      "should mark a bigint body field as a request the client never sends",
      {
        endpoint:
          '{ query: (body: { big: bigint }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "{ big: 1n }",
      },
      { kind: "thrown" },
      projected({ method: "POST", body: [{ big: ["throws"] }] }),
    ],
  ];
  it.each(cases)("%s", async (_name, fixture, expected, expectedModel) => {
    await expectConformance(fixture, expectedModel, [
      { argument: fixture.argument, expected },
    ]);
  });
});
