#!/usr/bin/env bun
/**
 * Static triage of Cypress e2e specs for the e2e-to-unit skill.
 *
 * It parses each spec with the TypeScript compiler API, gets signals for each
 * `it()` block, guesses a bucket (A, B or C?), and ranks the specs by yield:
 * (A + B tests) × spec duration. It does not call an LLM, edit specs, run
 * Cypress or call the network.
 *
 * Usage:
 *   bun .claude/skills/e2e-to-unit/triage.ts [spec ...] [--flakes <file.json>] [--json]
 *
 * With no spec, it reads all of `e2e/test/scenarios/**\/*.cy.spec.{js,ts}`.
 * The output is Markdown, or JSON with `--json`.
 *
 * The flakes file is a JSON object keyed by spec path. Each value is a number
 * (flakes) or `{ "flakes": n, "failures": n }`.
 */
import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

export type Bucket = "A" | "B" | "C?";

export type TestTriage = {
  title: string;
  line: number;
  bucket: Bucket;
  reason: string;
  issues: string[];
  tags: string[];
  token: string | null;
  antiPatterns: string[];
  generated: boolean;
};

export type SpecTriage = {
  path: string;
  durationMs: number | null;
  flakes: number | null;
  failures: number | null;
  yield: number;
  counts: Record<Bucket, number>;
  tests: TestTriage[];
};

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const SCENARIOS_PREFIX = "e2e/test/scenarios/";

// Cypress commands that act on the page.
const UI_ACTIONS = new Set([
  "click",
  "dblclick",
  "rightclick",
  "type",
  "clear",
  "select",
  "check",
  "uncheck",
  "trigger",
  "selectFile",
  "realClick",
  "realHover",
  "realType",
  "realPress",
]);

// `H.*` helpers that do UI actions. Extend this list when a helper is missing.
const UI_ACTION_HELPERS = new Set([
  "tableHeaderClick",
  "openNotebook",
  "summarize",
  "filter",
  "selectFilterOperator",
  "addSummaryField",
  "addSummaryGroupingField",
  "editDashboard",
  "setFilter",
  "selectDashboardFilter",
  "openVizSettingsSidebar",
  "openNavigationSidebar",
  "openQuestionActions",
  "openDashboardMenu",
  "openSharingMenu",
  "newButton",
  "startNewQuestion",
  "startNewNativeQuestion",
  "startNewModel",
  "enterCustomColumnDetails",
  "moveColumnDown",
  "toggleFilterWidgetValues",
  "clickActionsPopover",
  "commandPaletteSearch",
]);

// `H.*` helpers whose action persists through the backend.
const BACKEND_HELPERS = new Set([
  "saveDashboard",
  "saveQuestion",
  "saveSavedQuestion",
  "saveQuestionToCollection",
  "saveMetadataChanges",
  "publishChanges",
  "archiveQuestion",
  "archiveDashboard",
  "getInbox",
]);

// `H.*` helpers that run or show real query results.
const QUERY_HELPERS = new Set([
  "visitQuestion",
  "visitQuestionAdhoc",
  "visitDashboard",
  "visitModel",
  "visitMetric",
  "visitEmbeddedPage",
  "visitFullAppEmbeddingUrl",
  "openOrdersTable",
  "openProductsTable",
  "openPeopleTable",
  "openReviewsTable",
  "openTable",
  "runNativeQuery",
  "visualize",
  "queryBuilderHeader",
  "queryBuilderMain",
  "tableInteractive",
  "tableInteractiveBody",
  "echartsContainer",
  "assertTableData",
  "assertQueryBuilderRowCount",
]);

// `H.*` helpers that create a question through the API. They give query data
// when the test also visits a page.
const QUERY_SEED_HELPERS = new Set([
  "createQuestion",
  "createNativeQuestion",
  "createQuestionAndDashboard",
  "createNativeQuestionAndDashboard",
  "createDashboardWithQuestions",
]);

// Chart elements. A UI action on them needs a real browser.
const CHART_HELPERS = new Set([
  "echartsContainer",
  "cartesianChartCircle",
  "cartesianChartCircleWithColor",
  "cartesianChartCircles",
  "chartPathWithFillColor",
  "chartPathsWithFillColors",
  "pieSlices",
  "pieSlice",
  "trendLine",
]);

const REAL_BROWSER_HELPERS = new Set([
  "echartsTooltip",
  "assertEChartsTooltip",
  "dragAndDrop",
  "moveDnDKitElement",
  "dragField",
  "getIframeBody",
  "frameLoaded",
  "iframe",
  "downloadAndAssert",
  "readClipboard",
  "writeClipboard",
]);

const DRAG_EVENTS = new Set([
  "mousedown",
  "mousemove",
  "pointerdown",
  "pointermove",
  "dragstart",
  "dragover",
  "drop",
]);

// Queries that find an element by its visible text or label.
const LABEL_QUERIES = new Set([
  "button",
  "contains",
  "findByText",
  "findAllByText",
  "findByLabelText",
  "findAllByLabelText",
]);

// URL paths of pages that run a query.
const QUERY_PAGE = /\/(model|question|table|dashboard|metric)(\/|#|$|-|\$)/;

// A click on an element with one of these labels probably sends a request.
const SUBMIT_LABEL =
  /^(save|connect|create|send|submit|delete|remove|add|apply|update|done|confirm|load|test|clear|publish|archive|move|duplicate|revoke|regenerate|enable|disable|run|import|upload|sync|discard|reset|invite|deactivate|reactivate)\b/i;

const HTTP_METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i;

type InterceptResponse = "static" | "partial" | "wait";

type Event =
  | {
      kind: "intercept";
      alias: string | null;
      method: string | null;
      url: string;
      response: InterceptResponse;
    }
  | { kind: "wait"; aliases: string[] }
  | { kind: "visit" }
  | { kind: "reload" }
  | { kind: "action"; name: string; submitLabel: string | null }
  | { kind: "backend"; name: string }
  | { kind: "query"; name: string }
  | { kind: "seed"; name: string; visits: boolean }
  | { kind: "realBrowser"; what: string }
  | { kind: "token"; value: string }
  | { kind: "assert"; absence: boolean }
  | { kind: "commit"; how: string }
  | { kind: "anti"; what: string }
  | { kind: "opaque"; name: string };

// What a body needs to resolve the functions that it calls.
type Ctx = {
  sf: ts.SourceFile;
  // Functions declared in the spec, by name.
  locals: Map<string, ts.Node>;
  // Names imported from spec helpers. The script cannot see what they do.
  opaque: Set<string>;
  binding: Map<string, ts.Expression> | null;
  visited: Set<ts.Node>;
};

type Scope = {
  describes: string[];
  tags: string[];
  hooks: ts.Block[];
  binding: Map<string, ts.Expression> | null;
};

type RawTest = {
  title: string;
  line: number;
  tags: string[];
  describes: string[];
  hooks: ts.Block[];
  body: ts.Node;
  binding: Map<string, ts.Expression> | null;
  generated: boolean;
};

const text = (node: ts.Node, sf: ts.SourceFile) => node.getText(sf);

const lineOf = (node: ts.Node, sf: ts.SourceFile) =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

const stringValue = (node: ts.Node | undefined): string | null =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;

// The identifier at the start of a call chain, such as `cy` in `cy.get().click()`.
const chainRoot = (node: ts.Expression): string | null => {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node)) {
    return chainRoot(node.expression);
  }
  return null;
};

const methodName = (call: ts.CallExpression): string | null =>
  ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : ts.isIdentifier(call.expression)
      ? call.expression.text
      : null;

// The name of an `H.foo()` call, or of a bare `foo()` call (named imports).
const helperName = (call: ts.CallExpression): string | null => {
  if (ts.isIdentifier(call.expression)) {
    return call.expression.text;
  }
  return ts.isPropertyAccessExpression(call.expression) &&
    chainRoot(call.expression) === "H"
    ? call.expression.name.text
    : null;
};

// The calls that come before this one in its chain, nearest first.
const receiverCalls = (call: ts.CallExpression): ts.CallExpression[] => {
  const walk = (node: ts.Expression): ts.CallExpression[] =>
    ts.isCallExpression(node)
      ? [node, ...walk(node.expression)]
      : ts.isPropertyAccessExpression(node)
        ? walk(node.expression)
        : [];
  return walk(call.expression).filter((node) => node !== call);
};

const descendants = (node: ts.Node): ts.Node[] => {
  const children: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child, ...descendants(child));
  });
  return children;
};

const objectProp = (
  node: ts.Node | undefined,
  name: string,
): ts.Expression | null => {
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return null;
  }
  const prop = node.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name,
  );
  return prop?.initializer ?? null;
};

const tagsOf = (options: ts.Node | undefined): string[] => {
  const tags = objectProp(options, "tags");
  if (!tags) {
    return [];
  }
  if (ts.isArrayLiteralExpression(tags)) {
    return tags.elements.map(stringValue).filter((t): t is string => !!t);
  }
  const tag = stringValue(tags);
  return tag ? [tag] : [];
};

const classifyInterceptHandler = (
  handler: ts.Expression | undefined,
): InterceptResponse => {
  if (!handler) {
    return "wait";
  }
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) {
    return "static";
  }
  const calls = descendants(handler).filter(ts.isCallExpression);
  const isPartial = calls.some(
    (call) =>
      (methodName(call) === "continue" && call.arguments.length > 0) ||
      (methodName(call) === "on" &&
        /response/.test(stringValue(call.arguments[0]) ?? "")),
  );
  if (isPartial) {
    return "partial";
  }
  return calls.some((call) => methodName(call) === "reply")
    ? "static"
    : "wait";
};

const interceptEvent = (
  call: ts.CallExpression,
  sf: ts.SourceFile,
): Event => {
  const [a0, a1, a2] = call.arguments;
  const a0String = stringValue(a0);
  const byMethod = a0String !== null && HTTP_METHOD.test(a0String);
  const matcher = !byMethod && a0 && ts.isObjectLiteralExpression(a0);
  const method = byMethod
    ? a0String
    : matcher
      ? stringValue(objectProp(a0, "method") ?? undefined)
      : null;
  const urlNode = byMethod
    ? a1
    : matcher
      ? (objectProp(a0, "url") ?? objectProp(a0, "pathname") ?? a0)
      : a0;
  const handler = byMethod ? a2 : a1;
  const parent = call.parent;
  const alias =
    ts.isPropertyAccessExpression(parent) &&
    parent.name.text === "as" &&
    ts.isCallExpression(parent.parent)
      ? stringValue(parent.parent.arguments[0])
      : null;
  return {
    kind: "intercept",
    alias,
    method: method ? method.toUpperCase() : null,
    url: urlNode ? (stringValue(urlNode) ?? text(urlNode, sf)) : "",
    response: classifyInterceptHandler(handler),
  };
};

const RAW_VISIT_HELPERS: [RegExp, string][] = [
  [/^\/question\/(\d|\$\{)/, "H.visitQuestion"],
  [/^\/dashboard\/(\d|\$\{)/, "H.visitDashboard"],
  [/^\/model\/(\d|\$\{)/, "H.visitModel"],
];

const assertionEvent = (call: ts.CallExpression): Event | null => {
  if (!ts.isExpressionStatement(call.parent)) {
    return null;
  }
  const chain = [call, ...receiverCalls(call)];
  const names = chain.map(methodName);
  if (
    names.some((name) => name === "wait" || name === "log" || name === "request")
  ) {
    return null;
  }
  const method = methodName(call);
  if (method === "should" || method === "and") {
    return {
      kind: "assert",
      absence: stringValue(call.arguments[0]) === "not.exist",
    };
  }
  return names.some((name) => name && /^(find|contains|get$|button$)/.test(name))
    ? { kind: "assert", absence: false }
    : null;
};

const isFunction = (
  node: ts.Node | undefined,
): node is ts.ArrowFunction | ts.FunctionExpression =>
  !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

const callEvents = (call: ts.CallExpression, ctx: Ctx): Event[] => {
  const { sf } = ctx;
  const callee = call.expression;
  const bound = ctx.binding?.get(text(callee, sf));
  const fn = isFunction(bound)
    ? bound.body
    : ts.isIdentifier(callee)
      ? ctx.locals.get(callee.text)
      : undefined;
  if (fn) {
    return ctx.visited.has(fn)
      ? []
      : bodyEvents(fn, { ...ctx, visited: new Set([...ctx.visited, fn]) });
  }
  const isDirectCall =
    ts.isIdentifier(callee) ||
    (ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression));
  const method = methodName(call);
  const root = chainRoot(callee);
  if (isDirectCall && root && ctx.opaque.has(root)) {
    return [{ kind: "opaque", name: text(callee, sf) }];
  }
  const helper = helperName(call);
  const events: Event[] = [];

  if (root === "cy" && method === "intercept") {
    return [interceptEvent(call, sf)];
  }
  if (root === "cy" && method === "wait") {
    const arg = call.arguments[0];
    const values = arg
      ? ts.isArrayLiteralExpression(arg)
        ? arg.elements.map(stringValue)
        : [stringValue(arg)]
      : [];
    const aliases = values
      .filter((v): v is string => !!v && v.startsWith("@"))
      .map((v) => v.slice(1));
    return aliases.length > 0 ? [{ kind: "wait", aliases }] : [];
  }
  if (root === "cy" && method === "reload") {
    return [{ kind: "reload" }];
  }
  if (
    (root === "cy" || root === "H" || ts.isIdentifier(callee)) &&
    method?.startsWith("visit")
  ) {
    events.push({ kind: "visit" });
    const url = call.arguments[0];
    const urlText = url
      ? (stringValue(url) ??
        (ts.isTemplateExpression(url) ? text(url, sf).slice(1) : ""))
      : "";
    const suggestion =
      root === "cy" && method === "visit"
        ? RAW_VISIT_HELPERS.find(([re]) => re.test(urlText))?.[1]
        : undefined;
    if (suggestion) {
      events.push({ kind: "anti", what: `raw cy.visit, use ${suggestion}` });
    }
  }
  // Inline edits often save when the input loses focus.
  if (method === "blur") {
    events.push({ kind: "commit", how: "blur" });
  }
  if (
    method === "realPress" &&
    call.arguments.some((arg) => /\bTab\b/.test(text(arg, sf)))
  ) {
    events.push({ kind: "commit", how: "Tab" });
  }
  if (helper === "activateToken") {
    const value = stringValue(call.arguments[0]);
    if (value) {
      events.push({ kind: "token", value });
    }
  }
  if (method && UI_ACTIONS.has(method)) {
    const receivers = receiverCalls(call);
    const label = receivers
      .map((r) => {
        const name = methodName(r);
        const arg = r.arguments.at(-1);
        if (name === "findByRole" || name === "findAllByRole") {
          const roleName = objectProp(r.arguments[1], "name");
          return roleName ? (stringValue(roleName) ?? text(roleName, sf)) : null;
        }
        return name && LABEL_QUERIES.has(name) && arg
          ? (stringValue(arg) ?? text(arg, sf))
          : null;
      })
      .find((label) => label !== null);
    const keys = call.arguments
      .flatMap((arg) =>
        ts.isArrayLiteralExpression(arg) ? [...arg.elements] : [arg],
      )
      .map((arg) => stringValue(arg) ?? "");
    const submitLabel = keys.some((key) => /^Enter$|\{enter\}/i.test(key))
      ? "Enter key"
      : label && SUBMIT_LABEL.test(label.replace(/^\/|\/\w*$/g, ""))
        ? label
        : null;
    events.push({ kind: "action", name: method, submitLabel });

    const onChart = receivers.some((r) => {
      const name = helperName(r);
      return name !== null && CHART_HELPERS.has(name);
    });
    if (onChart) {
      events.push({ kind: "realBrowser", what: `chart ${method}` });
    }
    if (
      method === "trigger" &&
      DRAG_EVENTS.has(stringValue(call.arguments[0]) ?? "")
    ) {
      events.push({ kind: "realBrowser", what: "drag" });
    }
  }
  if (
    (method === "should" || method === "and") &&
    receiverCalls(call).some((r) => {
      const name = methodName(r);
      return name === "url" || name === "location";
    })
  ) {
    const page = call.arguments
      .map((arg) => stringValue(arg) ?? text(arg, sf))
      .find((value) => QUERY_PAGE.test(value));
    if (page) {
      events.push({ kind: "query", name: `lands on ${page}` });
    }
  }
  if (helper && UI_ACTION_HELPERS.has(helper)) {
    events.push({ kind: "action", name: `H.${helper}`, submitLabel: null });
  }
  if (helper && BACKEND_HELPERS.has(helper)) {
    events.push({ kind: "backend", name: `H.${helper}` });
  }
  if (helper && QUERY_HELPERS.has(helper)) {
    events.push({ kind: "query", name: `H.${helper}` });
  }
  if (helper && QUERY_SEED_HELPERS.has(helper)) {
    const options = call.arguments[1];
    const visits = ["visitQuestion", "visitDashboard", "wrapId"].some(
      (key) => objectProp(options, key)?.kind === ts.SyntaxKind.TrueKeyword,
    );
    events.push({ kind: "seed", name: `H.${helper}`, visits });
  }
  if (
    (helper && REAL_BROWSER_HELPERS.has(helper)) ||
    (root === "H" && helper && /iframe/i.test(helper)) ||
    method === "scrollTo" ||
    (method && /download/i.test(method))
  ) {
    events.push({ kind: "realBrowser", what: helper ?? method ?? "" });
  }
  if (
    method === "get" &&
    root !== null &&
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isCallExpression(call.expression.expression)
  ) {
    events.push({ kind: "anti", what: ".get() chained on a subject" });
  }
  const assertion = assertionEvent(call);
  if (assertion) {
    events.push(assertion);
  }
  return events;
};

// Events in the order that Cypress runs them. A chain runs inner calls first,
// so sort by the end position of each call.
const bodyEvents = (body: ts.Node, ctx: Ctx): Event[] => {
  const nodes = descendants(body);
  const calls = nodes
    .filter(ts.isCallExpression)
    .sort((a, b) => a.getEnd() - b.getEnd())
    .flatMap((call) => callEvents(call, ctx));
  const touchesBrowserApi = nodes.some(
    (node) =>
      ts.isPropertyAccessExpression(node) &&
      ["clipboard", "contentDocument", "contentWindow"].includes(
        node.name.text,
      ),
  );
  return touchesBrowserApi
    ? [...calls, { kind: "realBrowser", what: "browser API" }]
    : calls;
};

const ISSUE_PATTERNS = [/metabase#(\d+)/g, /\(#(\d+)\)/g];

const issuesOf = (titles: string[]): string[] => [
  ...new Set(
    titles.flatMap((title) =>
      ISSUE_PATTERNS.flatMap((re) =>
        [...title.matchAll(re)].map((m) => m[1]),
      ),
    ),
  ),
];

const absenceFirst = (events: Event[]): boolean => {
  const visits = events
    .map((event, index) => (event.kind === "visit" ? index : -1))
    .filter((index) => index >= 0);
  return visits.some((index) => {
    const next = events
      .slice(index + 1)
      .find((event) => event.kind === "assert" || event.kind === "visit");
    return next?.kind === "assert" && next.absence;
  });
};

const backendEffects = (events: Event[]): string[] => {
  const methods = new Map(
    events.flatMap((event) =>
      event.kind === "intercept" && event.alias
        ? [[event.alias, event.method ?? "ANY"] as const]
        : [],
    ),
  );
  const firstAction = events.findIndex((event) => event.kind === "action");
  const afterAction = firstAction < 0 ? [] : events.slice(firstAction + 1);
  const firstTyping = events.findIndex(
    (event) =>
      event.kind === "action" && /^(type|realType|clear)$/.test(event.name),
  );
  const commits =
    firstTyping < 0
      ? []
      : events
          .slice(firstTyping + 1)
          .flatMap((event) =>
            event.kind === "commit"
              ? [`typed text committed by ${event.how}`]
              : [],
          );
  return [
    ...commits,
    ...afterAction.flatMap((event) => {
      if (event.kind === "wait") {
        return event.aliases.map(
          (alias) => `waits on ${methods.get(alias) ?? "ANY"} @${alias} after an action`,
        );
      }
      if (event.kind === "reload") {
        return ["cy.reload() after an action"];
      }
      if (event.kind === "visit") {
        return ["visit after an action"];
      }
      return [];
    }),
    ...events.flatMap((event) =>
      event.kind === "backend"
        ? [`${event.name}`]
        : event.kind === "action" && event.submitLabel
          ? [`submit-like ${event.name}: "${event.submitLabel}"`]
          : [],
    ),
  ];
};

// Endpoints that run a query.
const QUERY_URL = /\/api\/dataset|\/query\b|\/api\/(public|embed)\/.*\/card\//;

const triageTest = (raw: RawTest, base: Omit<Ctx, "binding">): TestTriage => {
  const ctx: Ctx = { ...base, binding: raw.binding };
  const hookEvents = raw.hooks.flatMap((hook) => bodyEvents(hook, ctx));
  const testEvents = bodyEvents(raw.body, ctx);
  const events = [...hookEvents, ...testEvents];

  const visits = events.some((event) => event.kind === "visit");
  const queryAliases = new Set(
    events.flatMap((event) =>
      event.kind === "intercept" && event.alias && QUERY_URL.test(event.url)
        ? [event.alias]
        : [],
    ),
  );
  const queryData = [
    ...events.flatMap((event) => (event.kind === "query" ? [event.name] : [])),
    ...events.flatMap((event) =>
      event.kind === "seed" && (event.visits || visits) ? [event.name] : [],
    ),
    ...events.flatMap((event) =>
      event.kind === "wait"
        ? event.aliases
            .filter((alias) => queryAliases.has(alias))
            .map((alias) => `waits on @${alias}`)
        : [],
    ),
  ];
  const opaque = events.flatMap((event) =>
    event.kind === "opaque" ? [event.name] : [],
  );
  const realBrowser = events.flatMap((event) =>
    event.kind === "realBrowser" ? [event.what] : [],
  );
  const intercepts = events.filter(
    (event): event is Extract<Event, { kind: "intercept" }> =>
      event.kind === "intercept",
  );
  const stubs = intercepts.filter((event) => event.response === "static");
  const partial = intercepts.filter((event) => event.response === "partial");

  const reasonsC = [
    ...new Set([
      ...(raw.tags.includes("@external") ? ["@external"] : []),
      ...backendEffects(events),
      ...queryData.map((name) => `query data: ${name}`),
      ...realBrowser.map((what) => `real browser: ${what}`),
      ...opaque.map((name) => `spec helper: ${name}`),
    ]),
  ];

  const actionCount = events.filter((event) => event.kind === "action").length;
  const partialNote =
    partial.length > 0
      ? `; partial intercept: ${partial.map((p) => p.url).join(", ")}`
      : "";
  const [bucket, reason]: [Bucket, string] =
    reasonsC.length > 0
      ? ["C?", reasonsC.slice(0, 3).join("; ")]
      : stubs.length > 0
        ? [
            "A",
            `static stub: ${stubs.map((s) => `${s.method ?? "ANY"} ${s.url}`).join(", ")}; no backend effect${partialNote}`,
          ]
        : [
            "B",
            `${actionCount > 0 ? `${actionCount} UI action${actionCount > 1 ? "s" : ""}, none with a backend effect` : "render-only"}${partialNote}`,
          ];

  const tokens = events.flatMap((event) =>
    event.kind === "token" ? [event.value] : [],
  );
  const antiPatterns = [
    ...(absenceFirst(events) ? ["absence check first after cy.visit"] : []),
    ...new Set(
      testEvents.flatMap((event) => (event.kind === "anti" ? [event.what] : [])),
    ),
  ];

  return {
    title: raw.title,
    line: raw.line,
    bucket,
    reason,
    issues: issuesOf([...raw.describes, raw.title]),
    tags: raw.tags,
    token: tokens.at(-1) ?? null,
    antiPatterns,
    generated: raw.generated,
  };
};

const BLOCK_NAMES = new Set(["describe", "context", "it", "specify"]);
const HOOK_NAMES = new Set(["before", "beforeEach"]);

type BlockCall = {
  kind: "describe" | "it";
  modifier: string | null;
  each: boolean;
  args: ts.NodeArray<ts.Expression>;
};

const blockCall = (call: ts.CallExpression): BlockCall | null => {
  const callee = call.expression;
  // `it.each(table)(title, fn)`
  if (ts.isCallExpression(callee)) {
    const inner = blockCall(callee);
    return inner && inner.modifier === "each"
      ? { ...inner, modifier: null, each: true, args: call.arguments }
      : null;
  }
  const [name, modifier] = ts.isIdentifier(callee)
    ? [callee.text, null]
    : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
      ? [callee.expression.text, callee.name.text]
      : [null, null];
  if (!name || !BLOCK_NAMES.has(name)) {
    return null;
  }
  return {
    kind: name === "describe" || name === "context" ? "describe" : "it",
    modifier,
    each: false,
    args: call.arguments,
  };
};

const callbackOf = (args: ts.NodeArray<ts.Expression>) =>
  args.find(
    (arg): arg is ts.ArrowFunction | ts.FunctionExpression =>
      ts.isArrowFunction(arg) || ts.isFunctionExpression(arg),
  );

const hooksIn = (body: ts.Node): ts.Block[] =>
  (ts.isBlock(body) || ts.isSourceFile(body) ? [...body.statements] : [])
    .flatMap((statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression) &&
      HOOK_NAMES.has(statement.expression.expression.text)
        ? [callbackOf(statement.expression.arguments)?.body]
        : [],
    )
    .filter((body): body is ts.Block => !!body && ts.isBlock(body));

const titleOf = (
  node: ts.Expression | undefined,
  scope: Scope,
  sf: ts.SourceFile,
): string => {
  if (!node) {
    return "";
  }
  const literal = stringValue(node);
  if (literal !== null) {
    return literal;
  }
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text +
      node.templateSpans
        .map((span) => {
          const value = scope.binding?.get(text(span.expression, sf));
          const resolved = value ? stringValue(value) : null;
          return (resolved ?? `\${${text(span.expression, sf)}}`) + span.literal.text;
        })
        .join("")
    );
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return titleOf(node.left, scope, sf) + titleOf(node.right, scope, sf);
  }
  return text(node, sf);
};

// `param.prop` → value, for each element of an array literal of objects or strings.
const loopBindings = (
  array: ts.ArrayLiteralExpression,
  param: string,
): Map<string, ts.Expression>[] =>
  array.elements.map((element) =>
    ts.isObjectLiteralExpression(element)
      ? new Map(
          element.properties
            .filter(ts.isPropertyAssignment)
            .filter((p) => ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
            .map((p) => [
              `${param}.${(p.name as ts.Identifier).text}`,
              p.initializer,
            ]),
        )
      : new Map([[param, element]]),
  );

const arrayDeclarations = (sf: ts.SourceFile) =>
  new Map(
    descendants(sf)
      .filter(ts.isVariableDeclaration)
      .flatMap((decl) =>
        ts.isIdentifier(decl.name) &&
        decl.initializer &&
        ts.isArrayLiteralExpression(decl.initializer)
          ? [[decl.name.text, decl.initializer] as const]
          : [],
      ),
  );

export const collectTests = (sf: ts.SourceFile): RawTest[] => {
  const arrays = arrayDeclarations(sf);

  const scan = (node: ts.Node, scope: Scope): RawTest[] => {
    if (!ts.isCallExpression(node)) {
      return descendantsOnce(node, scope);
    }
    const block = blockCall(node);
    if (block) {
      if (block.modifier === "skip") {
        return [];
      }
      const [titleNode, maybeOptions] = block.args;
      const options =
        maybeOptions && ts.isObjectLiteralExpression(maybeOptions)
          ? maybeOptions
          : undefined;
      const title = titleOf(titleNode, scope, sf);
      const tags = [...scope.tags, ...tagsOf(options)];
      const callback = callbackOf(block.args);
      if (!callback) {
        return [];
      }
      if (block.kind === "describe") {
        return scan(callback.body, {
          describes: [...scope.describes, title],
          tags,
          hooks: [...scope.hooks, ...hooksIn(callback.body)],
          binding: scope.binding,
        });
      }
      return [
        {
          title,
          line: lineOf(node, sf),
          tags: [...new Set(tags)],
          describes: scope.describes,
          hooks: scope.hooks,
          body: callback.body,
          binding: scope.binding,
          generated: block.each || scope.binding !== null || title.includes("${"),
        },
      ];
    }
    // `ARRAY.forEach((item) => { it(...) })`
    if (methodName(node) === "forEach" && ts.isPropertyAccessExpression(node.expression)) {
      const callback = callbackOf(node.arguments);
      const target = node.expression.expression;
      const array = ts.isArrayLiteralExpression(target)
        ? target
        : ts.isIdentifier(target)
          ? arrays.get(target.text)
          : undefined;
      const param = callback?.parameters[0]?.name;
      if (callback && array && param && ts.isIdentifier(param)) {
        return loopBindings(array, param.text).flatMap((binding) =>
          scan(callback.body, { ...scope, binding }),
        );
      }
    }
    if (ts.isIdentifier(node.expression) && HOOK_NAMES.has(node.expression.text)) {
      return [];
    }
    return descendantsOnce(node, scope);
  };

  const descendantsOnce = (node: ts.Node, scope: Scope): RawTest[] => {
    const found: RawTest[] = [];
    ts.forEachChild(node, (child) => {
      found.push(...scan(child, scope));
    });
    return found;
  };

  return scan(sf, { describes: [], tags: [], hooks: hooksIn(sf), binding: null });
};

export const triageSource = ({
  source,
  specPath,
}: {
  source: string;
  specPath: string;
}): TestTriage[] => {
  const sf = ts.createSourceFile(
    specPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    specPath.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const ctx = {
    sf,
    locals: localFunctions(sf),
    opaque: opaqueImports(sf),
    visited: new Set<ts.Node>(),
  };
  return collectTests(sf).map((raw) => triageTest(raw, ctx));
};

const localFunctions = (sf: ts.SourceFile): Map<string, ts.Node> =>
  new Map(
    descendants(sf)
      .flatMap((node): [string, ts.Node][] => {
        if (ts.isFunctionDeclaration(node) && node.name && node.body) {
          return [[node.name.text, node.body]];
        }
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          isFunction(node.initializer)
        ) {
          return [[node.name.text, node.initializer.body]];
        }
        return [];
      })
      .reverse(),
  );

// Relative imports and imports from other e2e test folders are spec helpers.
const opaqueImports = (sf: ts.SourceFile): Set<string> =>
  new Set(
    sf.statements.filter(ts.isImportDeclaration).flatMap((decl) => {
      const from = stringValue(decl.moduleSpecifier) ?? "";
      const clause = decl.importClause;
      if (!clause || clause.isTypeOnly || !/^(\.|e2e\/test\/)/.test(from)) {
        return [];
      }
      const bindings = clause.namedBindings;
      return [
        ...(clause.name ? [clause.name.text] : []),
        ...(bindings && ts.isNamespaceImport(bindings)
          ? [bindings.name.text]
          : []),
        ...(bindings && ts.isNamedImports(bindings)
          ? bindings.elements
              .filter((e) => !e.isTypeOnly)
              .map((e) => e.name.text)
          : []),
      ];
    }),
  );

type FlakeCounts = { flakes: number | null; failures: number | null };

const scenarioKey = (specPath: string) =>
  specPath.slice(specPath.indexOf("test/scenarios/") + "test/scenarios/".length);

const readFlakes = (file: string): Map<string, FlakeCounts> => {
  const data: Record<string, number | { flakes?: number; failures?: number }> =
    JSON.parse(fs.readFileSync(file, "utf8"));
  return new Map(
    Object.entries(data).map(([key, value]) => [
      scenarioKey(key),
      typeof value === "number"
        ? { flakes: value, failures: null }
        : { flakes: value.flakes ?? null, failures: value.failures ?? null },
    ]),
  );
};

const readDurations = (): Map<string, number> => {
  const file = path.join(REPO_ROOT, "e2e/support/timings.json");
  const data: { durations: { spec: string; duration: number }[] } = JSON.parse(
    fs.readFileSync(file, "utf8"),
  );
  return new Map(
    data.durations.map(({ spec, duration }) => [scenarioKey(spec), duration]),
  );
};

export const triageSpecs = ({
  specPaths,
  flakes,
}: {
  specPaths: string[];
  flakes: Map<string, FlakeCounts>;
}): SpecTriage[] => {
  const durations = readDurations();
  const specs = specPaths.map((specPath): SpecTriage => {
    const source = fs.readFileSync(path.join(REPO_ROOT, specPath), "utf8");
    const tests = triageSource({ source, specPath });
    const counts: Record<Bucket, number> = {
      A: tests.filter((t) => t.bucket === "A").length,
      B: tests.filter((t) => t.bucket === "B").length,
      "C?": tests.filter((t) => t.bucket === "C?").length,
    };
    const key = scenarioKey(specPath);
    const durationMs = durations.get(key) ?? null;
    const flake = flakes.get(key);
    return {
      path: specPath,
      durationMs,
      flakes: flake?.flakes ?? null,
      failures: flake?.failures ?? null,
      yield: (counts.A + counts.B) * (durationMs ?? 0),
      counts,
      tests,
    };
  });
  return specs.sort(
    (a, b) =>
      b.yield - a.yield ||
      (b.flakes ?? 0) - (a.flakes ?? 0) ||
      (b.failures ?? 0) - (a.failures ?? 0) ||
      a.path.localeCompare(b.path),
  );
};

const quote = (title: string) => `"${title.replace(/(["\\])/g, "\\$1")}"`;

const cell = (value: string) => value.replace(/\|/g, "\\|");

// A/B candidates. Tests that a loop over `describe` blocks repeats show once.
const candidates = (spec: SpecTriage): TestTriage[] =>
  spec.tests
    .filter((t) => t.bucket !== "C?")
    .filter(
      (t, i, all) =>
        all.findIndex((u) => u.line === t.line && u.title === t.title) === i,
    );

export const skillCommand = (spec: SpecTriage): string =>
  [
    "/e2e-to-unit triage",
    spec.path,
    ...new Set(candidates(spec).map((t) => quote(t.title))),
  ].join(" ");

const seconds = (ms: number | null) =>
  ms === null ? "–" : `${Math.round(ms / 1000)}s`;

export const toMarkdown = (specs: SpecTriage[]): string => {
  const all = specs.flatMap((s) => s.tests);
  const count = (bucket: Bucket) => all.filter((t) => t.bucket === bucket).length;
  const ranked = specs.filter((s) => s.counts.A + s.counts.B > 0);
  const header = [
    "# E2E triage",
    "",
    `${specs.length} specs, ${all.length} tests: A ${count("A")}, B ${count("B")}, C? ${count("C?")}. ${ranked.length} specs have A or B candidates.`,
    "",
    "Yield = (A + B tests) × spec duration (`e2e/support/timings.json`). Flakes break ties.",
    "",
    "## Ranked specs",
    "",
    "| # | Spec | Duration | Tests | A | B | C? | Flakes | Yield (test·s) |",
    "|---|---|---|---|---|---|---|---|---|",
    ...ranked.map(
      (s, i) =>
        `| ${i + 1} | \`${scenarioKey(s.path)}\` | ${seconds(s.durationMs)} | ${s.tests.length} | ${s.counts.A} | ${s.counts.B} | ${s.counts["C?"]} | ${s.flakes ?? "–"} | ${Math.round(s.yield / 1000)} |`,
    ),
  ];
  const details = ranked.flatMap((s) => [
    "",
    `## \`${scenarioKey(s.path)}\``,
    "",
    "```",
    skillCommand(s),
    "```",
    "",
    "| Line | Test | Bucket | Reason | Issue | Tags | Anti-patterns |",
    "|---|---|---|---|---|---|---|",
    ...candidates(s).map(
        (t) =>
          `| ${t.line} | ${cell(t.title)} | ${t.bucket} | ${cell(t.reason)} | ${t.issues.map((n) => `#${n}`).join(", ")} | ${[...t.tags, ...(t.token ? [`token:${t.token}`] : [])].join(", ")} | ${cell(t.antiPatterns.join("; "))} |`,
      ),
  ]);
  return [...header, ...details, ""].join("\n");
};

const parseArgs = (argv: string[]) => {
  const flakesIndex = argv.indexOf("--flakes");
  const flakesFile = flakesIndex >= 0 ? argv[flakesIndex + 1] : null;
  const specs = argv.filter(
    (arg, i) => !arg.startsWith("--") && (flakesIndex < 0 || i !== flakesIndex + 1),
  );
  return { specs, flakesFile, json: argv.includes("--json") };
};

const allSpecs = (): string[] =>
  [
    ...new Bun.Glob(`${SCENARIOS_PREFIX}**/*.cy.spec.{js,ts}`).scanSync({
      cwd: REPO_ROOT,
    }),
  ].sort();

if (import.meta.main) {
  const { specs, flakesFile, json } = parseArgs(process.argv.slice(2));
  const specPaths =
    specs.length > 0
      ? specs.map((spec) => path.relative(REPO_ROOT, path.resolve(spec)))
      : allSpecs();
  const result = triageSpecs({
    specPaths,
    flakes: flakesFile ? readFlakes(flakesFile) : new Map(),
  });
  process.stdout.write(
    json ? `${JSON.stringify(result, null, 2)}\n` : toMarkdown(result),
  );
}
