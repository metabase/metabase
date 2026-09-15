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
import {
  ENDPOINT_PRELUDE,
  cleanupFixtures,
  endpointObject,
  programFrom,
} from "./test-fixtures";
import type { JsonView } from "./value-conversion";

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
function fixtureSource({ declarations = "", endpoint, argument }: Fixture) {
  return `
    ${ENDPOINT_PRELUDE}
    ${declarations}
    const endpoint = defineEndpoint(${endpoint});
    const argument: Parameters<typeof endpoint.query>[0] = ${argument};
  `;
}

function model(fixture: Fixture): Modelled {
  const { program, files, checker } = programFrom({
    "request.ts": fixtureSource(fixture),
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

/** Whether the text the client sent is one the modelled type can produce. */
function typeAcceptsText(
  checker: ts.TypeChecker,
  type: ts.Type,
  text: string,
): boolean {
  if (type.isUnion()) {
    return type.types.some((member) => typeAcceptsText(checker, member, text));
  }
  if (type.isStringLiteral()) {
    return type.value === text;
  }
  if (type.isNumberLiteral()) {
    return String(type.value) === text;
  }
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return checker.typeToString(type) === text;
  }
  if (type.flags & ts.TypeFlags.StringLike) {
    return true;
  }
  if (type.flags & ts.TypeFlags.NumberLike) {
    return text !== "" && Number.isFinite(Number(text));
  }
  if (type.flags & ts.TypeFlags.BooleanLike) {
    return text === "true" || text === "false";
  }
  if (type.flags & ts.TypeFlags.Null) {
    return text === "null";
  }
  if (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
    return text === "undefined";
  }
  const element =
    checker.isArrayType(type) &&
    checker.getIndexTypeOfType(type, ts.IndexKind.Number);
  if (element) {
    return typeAcceptsText(checker, element, text);
  }
  // The model makes no claim about the text of any other type.
  return true;
}

function valueAcceptsText(
  checker: ts.TypeChecker,
  value: SentValue,
  text: string,
): boolean {
  switch (value.kind) {
    case "empty":
      return text === "";
    case "text":
      return value.text === text;
    case "json":
      return value.view.kind === "type"
        ? typeAcceptsText(checker, value.view.type, text)
        : true;
  }
}

/** Whether the JSON value the client sent is one the view describes. */
function viewAccepts(
  checker: ts.TypeChecker,
  view: JsonView,
  value: unknown,
): boolean {
  switch (view.kind) {
    case "null":
      return value === null;
    case "empty":
      return isRecord(value) && Object.keys(value).length === 0;
    case "union":
      return view.members.some((member) => viewAccepts(checker, member, value));
    case "array":
      return (
        Array.isArray(value) &&
        value.every((item) => viewAccepts(checker, view.element, item))
      );
    case "object":
      return (
        isRecord(value) &&
        Object.keys(value).every((key) =>
          view.fields.some((field) => field.name === key),
        ) &&
        view.fields.every(
          (field) =>
            (field.optional && !(field.name in value)) ||
            (field.name in value &&
              viewAccepts(checker, field.view, value[field.name])),
        )
      );
    case "type": {
      const { type } = view;
      if (type.isStringLiteral()) {
        return value === type.value;
      }
      if (type.flags & ts.TypeFlags.StringLike) {
        return typeof value === "string";
      }
      if (type.flags & ts.TypeFlags.NumberLike) {
        return typeof value === "number";
      }
      if (type.flags & ts.TypeFlags.BooleanLike) {
        return typeof value === "boolean";
      }
      return true;
    }
    case "throws":
      return true;
  }
}

function valueAcceptsJson(
  checker: ts.TypeChecker,
  value: SentValue,
  sent: unknown,
): boolean {
  return value.kind === "json" ? viewAccepts(checker, value.view, sent) : true;
}

function isArrayValue(checker: ts.TypeChecker, value: SentValue): boolean {
  if (value.kind === "empty") {
    return false;
  }
  if (value.itemOf !== undefined) {
    return true;
  }
  return (
    value.kind === "json" &&
    value.view.kind === "type" &&
    (checker.isArrayType(value.view.type) ||
      checker.isTupleType(value.view.type))
  );
}

/**
 * Why one modelled payload does not describe the entries the client sent: a key the model has no field for,
 * a required field that was not sent, a value the field does not allow, or a key repeated without an array.
 */
function entryMismatches<Sent>(
  checker: ts.TypeChecker,
  variant: SentPayload,
  entries: [string, Sent][],
  accepts: (value: SentValue, sent: Sent) => boolean,
  label: string,
): string[] {
  if (variant.kind === "nothing") {
    return entries.map(
      ([key]) => `${label} ${key} is sent but nothing is modelled`,
    );
  }
  if (variant.kind === "type") {
    // Keys known only at runtime make no claim.
    return [];
  }
  const anyKey = variant.indexes.length > 0;
  const names = new Set(entries.map(([key]) => key));
  const mismatches: string[] = [];
  for (const name of names) {
    const field = variant.fields.find((candidate) => candidate.name === name);
    const sentValues = entries.filter(([key]) => key === name);
    if (!field) {
      if (!anyKey) {
        mismatches.push(`${label} ${name} is not a modelled field`);
      }
      continue;
    }
    if (
      sentValues.length > 1 &&
      !field.values.some((value) => isArrayValue(checker, value))
    ) {
      mismatches.push(`${label} ${name} is sent ${sentValues.length} times`);
    }
    for (const [, sent] of sentValues) {
      if (!field.values.some((value) => accepts(value, sent))) {
        mismatches.push(
          `${label} ${name}: ${JSON.stringify(sent)} is not a value the model allows`,
        );
      }
    }
  }
  for (const field of variant.fields) {
    if (!field.optional && !names.has(field.name)) {
      mismatches.push(`required ${label} ${field.name} is not sent`);
    }
  }
  return mismatches;
}

function bodyEntries(
  variant: SentPayload,
  body: SentBody,
): [string, unknown][] | string {
  if (variant.kind === "nothing") {
    return body.kind === "none" ? [] : "a body is sent but nothing is modelled";
  }
  if (body.kind === "none") {
    return "no body is sent but one is modelled";
  }
  if (body.kind !== "json" || !isRecord(body.value)) {
    return variant.kind === "type" ? [] : "the body is not a JSON object";
  }
  return Object.entries(body.value);
}

/** Why the model does not describe this outcome; empty when it does. */
function mismatches(modelled: Modelled, outcome: Outcome): string[] {
  const { request, checker } = modelled;
  if (request.unverified) {
    return [];
  }
  // The model predicts a throw as a request failure, or as a body value JSON.stringify throws for.
  const predictsThrow =
    request.failure !== undefined ||
    request.body.variants.some(
      (variant) =>
        variant.kind === "fields" &&
        variant.fields.some((field) =>
          field.values.some(
            (value) => value.kind === "json" && value.view.kind === "throws",
          ),
        ),
    );
  if (predictsThrow || outcome.kind === "thrown") {
    return predictsThrow && outcome.kind === "thrown"
      ? []
      : [
          `the model ${predictsThrow ? "predicts" : "does not predict"} a throw, and the client ${outcome.kind === "thrown" ? "threw" : "sent the request"}`,
        ];
  }
  const sent = outcome.request;
  // A part fits when any one of its variants describes what was sent.
  const anyVariant = (lists: string[][]) =>
    lists.some((list) => !list.length) ? [] : lists.flat();
  const pattern = new RegExp(
    `^${escapeRegExp(request.path).replaceAll(escapeRegExp("{param}"), "([^/]*)")}$`,
  );
  const match = pattern.exec(sent.path);
  return [
    ...(sent.method === request.method
      ? []
      : [`method ${sent.method} is not ${request.method}`]),
    ...(match
      ? request.pathParameters.flatMap((parameter, index) => {
          const segment = decodeURIComponent(match[index + 1] ?? "");
          return parameter.unverified ||
            parameter.values.some((value) =>
              valueAcceptsText(checker, value, segment),
            )
            ? []
            : [
                `path parameter ${index}: ${JSON.stringify(segment)} is not a text the model allows`,
              ];
        })
      : [`path ${sent.path} does not match ${request.path}`]),
    ...(request.query.unverified
      ? []
      : anyVariant(
          request.query.variants.map((variant) =>
            entryMismatches(
              checker,
              variant,
              sent.query,
              (value, text) => valueAcceptsText(checker, value, text),
              "query key",
            ),
          ),
        )),
    ...(request.body.unverified
      ? []
      : anyVariant(
          request.body.variants.map((variant) => {
            const entries = bodyEntries(variant, sent.body);
            return typeof entries === "string"
              ? [entries]
              : entryMismatches(
                  checker,
                  variant,
                  entries,
                  (value, json) => valueAcceptsJson(checker, value, json),
                  "body key",
                );
          }),
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

/**
 * Sends the fixture through the real client and checks the model describes what arrived.
 * `ruleNotApplied` is what the client would send without the rule under test; the model must reject it.
 */
async function expectConformance(
  fixture: Fixture,
  expected: Outcome,
  ruleNotApplied?: Outcome,
) {
  const modelled = model(fixture);
  const outcome = await send(fixture);
  expect(outcome).toEqual(expected);
  expect(mismatches(modelled, outcome)).toEqual([]);
  if (ruleNotApplied) {
    expect(mismatches(modelled, ruleNotApplied)).not.toEqual([]);
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

  it("should leave an object query value unverified, because its text is known only at runtime", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          '{ query: (params: { options: { a: number } }) => ({ url: "/api/x", params }) }',
        argument: "{ options: { a: 1 } }",
      },
      sentRequest({ query: [["options", "[object Object]"]] }),
    );
    expect(request.query.unverified).toMatch(
      /^options \({ a: number; }\) is sent as text, and its text is known only at runtime/,
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

  it("should leave a URL tag filled from an object unverified, because its text is known only at runtime", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          '{ query: (params: { options: { a: number } }) => ({ url: "/api/x/:options", params }) }',
        argument: "{ options: { a: 1 } }",
      },
      sentRequest({ path: "/api/x/%5Bobject%20Object%5D" }),
    );
    expect(request.pathParameters[0]?.unverified).toMatch(
      /^:options \({ a: number; }\) is sent as text, and its text is known only at runtime/,
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

  it("should leave an object template span unverified, because its text is known only at runtime", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          "{ query: (options: { a: number }) => ({ url: `/api/x/${options}` }) }",
        argument: "{ a: 1 }",
      },
      sentRequest({ path: "/api/x/[object%20Object]" }),
    );
    expect(request.pathParameters[0]?.unverified).toBe(
      "${options} ({ a: number; }) is sent as text, and its text is known only at runtime (the template literal applies String)",
    );
  });

  it("should leave a tuple template span unverified, because its text is known only at runtime", async () => {
    const { request } = await expectConformance(
      {
        endpoint: "{ query: (pair: [1, null]) => ({ url: `/api/x/${pair}` }) }",
        argument: "[1, null]",
      },
      sentRequest({ path: "/api/x/1," }),
    );
    expect(request.pathParameters[0]?.unverified).toMatch(
      /known only at runtime/,
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

  it("should leave the query unverified when an inline query span is not one known text", async () => {
    const { request } = await expectConformance(
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
    );
    expect(request.query.unverified).toMatch(
      /^\$\{flag\} is put into the URL template's query string/,
    );
  });

  it("should read an unencoded inline query span that carries its own query separator", async () => {
    await expectConformance(
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
      sentRequest({ query: [["v", "x&y=1"]] }),
    );
  });

  it("should read inline query text after URLSearchParams decoding", async () => {
    await expectConformance(
      {
        endpoint: "{ query: (_: void) => ({ url: `/api/x?q=a+b%21#skip=1` }) }",
        argument: "undefined",
      },
      sentRequest({ query: [["q", "a b!"]] }),
      sentRequest({
        query: [
          ["q", "a+b%21"],
          ["skip", "1"],
        ],
      }),
    );
  });

  it("should not treat a local encodeURIComponent as the global one", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (id: number) => { function encodeURIComponent(value: number): "fixed" { return "fixed"; } return { url: `/api/x/${encodeURIComponent(id)}` }; } }',
        argument: "7",
      },
      sentRequest({ path: "/api/x/fixed" }),
      sentRequest({ path: "/api/x/7" }),
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

  it("should send a class instance body without its methods and accessors", async () => {
    await expectConformance(
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
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { x: 1, sum: 2 } },
      }),
    );
  });

  it.each([
    ["a lib object", "Date", "new Date(0)"],
    ["a primitive", "number", "7"],
  ])(
    "should leave a body that is %s unverified",
    async (_name, type, argument) => {
      const { request } = await expectConformance(
        {
          endpoint: `{ query: (body: ${type}) => ({ method: "POST", url: "/api/x", body }) }`,
          argument,
        },
        sentRequest({ method: "POST", body: { kind: "json", value: {} } }),
      );
      expect(request.body.unverified).toMatch(/copied with \{ \.\.\.value \}/);
    },
  );

  it("should send a Date body field as the text its toJSON gives", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (body: { when: Date }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "{ when: new Date(0) }",
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { when: "1970-01-01T00:00:00.000Z" } },
      }),
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { when: 0 } },
      }),
    );
  });

  it("should send an undefined array item in a body as null", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (body: { ids: (number | undefined)[] }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "{ ids: [1, undefined] }",
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { ids: [1, null] } },
      }),
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { ids: [1, "null"] } },
      }),
    );
  });

  it("should send a Map body field and a function body field as JSON.stringify writes them", async () => {
    await expectConformance(
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
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { tags: { a: "b" }, name: "n" } },
      }),
    );
  });

  it("should send a numeric object key as text", async () => {
    await expectConformance(
      {
        endpoint:
          '{ query: (body: { collections: Record<number, boolean> }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "{ collections: { 1: true } }",
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { collections: { "1": true } } },
      }),
    );
  });

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

  it("should send a DELETE body of an empty object literal", async () => {
    await expectConformance(
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
      sentRequest({ method: "DELETE", path: "/api/x/1" }),
    );
  });

  it("should leave a DELETE body built from an empty object rest unverified", async () => {
    const { request } = await expectConformance(
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
    );
    expect(request.body.unverified).toMatch(/object rest body/);
  });

  it("should leave the query unverified for an empty object rest in a GET body", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          "{ query: ({ id, ...body }: { id: number }) => ({ url: `/api/x/${id}`, body }) }",
        argument: "{ id: 1 }",
      },
      sentRequest({ path: "/api/x/1" }),
    );
    expect(request.query.unverified).toMatch(/object rest body/);
    expect(request.body.unverified).toBeUndefined();
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

  it("should mark GET query parameters unverified when a value with no declared keys is merged with other fields", async () => {
    const { request } = await expectConformance(
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
    );
    expect(request.query.unverified).toMatch(/more than one source/);
  });

  it("should leave the query unverified for an empty object rest in params", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          "{ query: ({ id, ...params }: { id: number }) => ({ url: `/api/x/${id}`, params }) }",
        argument: "{ id: 1 }",
      },
      sentRequest({ path: "/api/x/1" }),
    );
    expect(request.query.unverified).toMatch(/object rest params/);
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

  it("should leave a body that is an unknown value unverified", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          '{ query: (body: unknown) => ({ method: "POST", url: "/api/x", body }) }',
        argument: '{ any: "thing" }',
      },
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { any: "thing" } },
      }),
    );
    expect(request.body.unverified).toMatch(/known only at runtime/);
  });

  it("should keep a nested field that drops undefined as optional in the JSON body", async () => {
    const { request } = await expectConformance(
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
      sentRequest({
        method: "POST",
        body: { kind: "json", value: { inner: { a: null, b: 1 } } },
      }),
    );
    expect(request.body.variants.map((variant) => variant.kind)).toEqual([
      "fields",
    ]);
  });

  it("should leave the query unverified when an inline query key is built at runtime", async () => {
    const { request } = await expectConformance(
      {
        declarations: 'const search: string = "built=later";',
        endpoint: "{ query: (_: void) => ({ url: `/api/x?${search}` }) }",
        argument: "undefined",
      },
      sentRequest({ query: [["built", "later"]] }),
    );
    expect(request.query.unverified).toMatch(/query string/);
  });

  // `JSON.stringify` throws for a bigint, so the client never sends this body.
  it("should mark a bigint body field as a request the client never sends", async () => {
    const { request } = await expectConformance(
      {
        endpoint:
          '{ query: (body: { big: bigint }) => ({ method: "POST", url: "/api/x", body }) }',
        argument: "{ big: 1n }",
      },
      { kind: "thrown" },
    );
    const [variant] = request.body.variants;
    const big =
      variant?.kind === "fields"
        ? variant.fields.find((field) => field.name === "big")
        : undefined;
    expect(
      big?.values.map((value) =>
        value.kind === "json" ? value.view.kind : value.kind,
      ),
    ).toEqual(["throws"]);
  });
});
