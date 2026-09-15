import ts from "typescript";

import {
  type ClientRequest,
  type SentPart,
  type SentPayload,
  type SentValue,
  modelClientRequest,
} from "./client-request";
import { resolveRtkRequest } from "./rtk-request";
import {
  COMPATIBLE,
  type CompareContext,
  LINE_BREAK,
  TypeWalkError,
  type UnconstrainedPosition,
  type Verdict,
  combineVerdicts,
  compareTypes,
  fieldLabel,
  isStackOverflow,
  looseTypeVerdict,
  looseTypeVerdicts,
} from "./type-comparison";
import {
  hasComputedName,
  indexAccepts,
  isObjectLike,
  member,
  properties,
  propertyName,
  propertyType,
  typeText,
  unionMembers,
  unwrap,
} from "./typescript-utils";
import { type JsonView, describeJsonView } from "./value-conversion";

export type ContractStatus =
  | "compatible"
  | "mismatch"
  | "unverified"
  | "ignored";

type ContractKind = "endpoint" | "request" | "response";

export interface ContractResult {
  id: string;
  endpointId: string;
  kind: ContractKind;
  part?: string;
  file: string;
  line: number;
  status: ContractStatus;
  message: string;
  unconstrained?: UnconstrainedPosition[];
}

type Check = Pick<ContractResult, "kind" | "part" | "status" | "message"> &
  Pick<Verdict, "unconstrained">;

interface Operation {
  path: string;
  data: ts.Type;
  responses: ts.Type | undefined;
}

interface CheckContext extends CompareContext {
  generated: ts.SourceFile;
  operations: Map<string, Operation[]>;
}

interface Endpoint {
  node: ts.CallExpression;
  name: string | undefined;
  id: string;
  file: string;
  line: number;
}

interface ResolvedEndpoint {
  endpointId: string;
  node: ts.CallExpression;
  config: ts.ObjectLiteralExpression;
  responseType: ts.TypeNode;
  client: ClientRequest;
  operation: Operation;
  /** The HTTP method and backend path, e.g. `GET /api/card/{id}`. */
  route: string;
}

type SentFields = Extract<SentPayload, { kind: "fields" }>;

export function checkContracts(
  program: ts.Program,
  endpointFiles: string[],
  generatedFile: string,
  root: string,
  budgets: Pick<CompareContext, "walkStepBudget" | "walkDepthBudget"> = {},
): ContractResult[] {
  assertCheckable(program, [generatedFile, ...endpointFiles], root);
  const checker = program.getTypeChecker();
  const generated = program.getSourceFile(generatedFile);
  if (!generated) {
    throw new Error(`Missing generated declarations: ${generatedFile}`);
  }
  const context: CheckContext = {
    checker,
    generated,
    operations: backendOperations(checker, generated),
    root,
    ...budgets,
  };
  const results = discoverEndpoints(
    program,
    checker,
    endpointFiles,
    root,
  ).flatMap((endpoint) =>
    checkEndpoint(context, endpoint).map(
      (check): ContractResult => ({
        id: checkId(endpoint.id, check),
        endpointId: endpoint.id,
        kind: check.kind,
        part: check.part,
        file: endpoint.file,
        line: endpoint.line,
        status: check.status,
        message: check.message,
        ...(check.unconstrained
          ? {
              unconstrained: check.unconstrained.flatMap(
                ({ positions }) => positions,
              ),
            }
          : {}),
      }),
    ),
  );
  if (!results.length) {
    throw new Error(
      "No RTK endpoints were discovered; refusing an empty contract check.",
    );
  }
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

export function isFailing(result: ContractResult): boolean {
  return result.status === "mismatch" || result.status === "unverified";
}

export function formatResult(result: ContractResult): string {
  return `${result.file}:${result.line} ${result.id}${LINE_BREAK}${result.status}: ${result.message}`;
}

export function baselineProblems(
  results: ContractResult[],
  baseline: readonly string[],
): string[] {
  const exemptEndpoints = new Set(baseline);
  return results
    .filter(
      (result) => isFailing(result) && !exemptEndpoints.has(result.endpointId),
    )
    .map(formatResult);
}

function assertCheckable(
  program: ts.Program,
  files: string[],
  root: string,
): void {
  const options = program.getCompilerOptions();
  if (!(options.strictNullChecks ?? options.strict)) {
    throw new Error("API contract checking requires strictNullChecks.");
  }
  const syntaxErrors = files.flatMap((file) => {
    const source = program.getSourceFile(file);
    return source ? program.getSyntacticDiagnostics(source) : [];
  });
  if (syntaxErrors.length) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(syntaxErrors, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  }
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, "{}")}`;
}

function backendOperations(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
): Map<string, Operation[]> {
  const aliases = new Map(
    source.statements
      .filter(ts.isTypeAliasDeclaration)
      .map((n) => [n.name.text, n]),
  );
  const result = new Map<string, Operation[]>();
  for (const [name, node] of aliases) {
    const method =
      /^(Get|Post|Put|Patch|Delete|Head|Options|Trace).+Data$/.exec(name)?.[1];
    if (!method) {
      continue;
    }
    const data = checker.getTypeAtLocation(node);
    const url = propertyType(checker, data, "url", node);
    if (!url?.isStringLiteral()) {
      continue;
    }
    const response = aliases.get(name.replace(/Data$/, "Responses"));
    const key = routeKey(method, url.value);
    result.set(key, [
      ...(result.get(key) ?? []),
      {
        path: url.value,
        data,
        responses: response && checker.getTypeAtLocation(response),
      },
    ]);
  }
  if (!result.size) {
    throw new Error(
      "No operations found in generated declarations. Run bun run types:generate.",
    );
  }
  return result;
}

function discoverEndpoints(
  program: ts.Program,
  checker: ts.TypeChecker,
  endpointFiles: string[],
  root: string,
): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const locations = new Map<string, string>();
  for (const fileName of endpointFiles) {
    const source = program.getSourceFile(fileName);
    if (!source) {
      throw new Error(`Missing endpoint source: ${fileName}`);
    }
    const file = source.fileName.replace(`${root}/`, "");
    const visit = (node: ts.Node): void => {
      if (isEndpointBuilderCall(checker, node)) {
        const line =
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const name = ts.isPropertyAssignment(node.parent)
          ? propertyName(node.parent.name)
          : undefined;
        const id = endpointIdentity(node, name);
        const location = `${file}:${line}`;
        const previousLocation = locations.get(id);
        if (previousLocation) {
          throw new Error(
            `Duplicate endpoint identity ${id} at ${previousLocation} and ${location}; give API or factory declarations distinct names.`,
          );
        }
        locations.set(id, location);
        endpoints.push({ node, name, id, file, line });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return endpoints;
}

function isEndpointBuilderCall(
  checker: ts.TypeChecker,
  node: ts.Node,
): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ["query", "mutation"].includes(node.expression.name.text) &&
    checker.getTypeAtLocation(node.expression.expression).aliasSymbol?.name ===
      "EndpointBuilder"
  );
}

function endpointIdentity(node: ts.CallExpression, name?: string): string {
  const names = name ? [name] : [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      (ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent)) &&
      parent.name &&
      ts.isIdentifier(parent.name)
    ) {
      names.unshift(parent.name.text);
    }
  }
  if (!names.length) {
    throw new Error(
      "Cannot identify an RTK endpoint; give its API or factory a named declaration.",
    );
  }
  return names.join(":");
}

function checkId(
  endpointId: string,
  { kind, part }: Pick<Check, "kind" | "part">,
): string {
  return `${endpointId}:${part ? `${kind}.${part}` : kind}`;
}

function stoppedCheck(id: string, error: unknown): unknown {
  if (error instanceof TypeWalkError) {
    return new TypeWalkError(
      `API contract check ${id} stopped: ${error.message}`,
    );
  }
  if (isStackOverflow(error)) {
    return new TypeWalkError(
      `API contract check ${id} stopped: the call stack overflowed outside a type walk`,
      { cause: error },
    );
  }
  return error;
}

// A walk that does not finish stops the whole run rather than reporting a partial result.
function guardedCheck(
  endpointId: string,
  check: Pick<Check, "kind" | "part">,
  compare: () => Verdict,
): Check {
  try {
    return { ...check, ...compare() };
  } catch (error) {
    throw stoppedCheck(checkId(endpointId, check), error);
  }
}

function checkEndpoint(context: CheckContext, endpoint: Endpoint): Check[] {
  try {
    const resolved = resolveEndpoint(context, endpoint);
    if ("unverified" in resolved) {
      return [
        {
          kind: "endpoint",
          status: "unverified",
          message: resolved.unverified,
        },
      ];
    }
    return [
      ...checkResponse(context, resolved),
      ...checkRequest(context, resolved),
    ];
  } catch (error) {
    throw error instanceof TypeWalkError &&
      error.message.startsWith("API contract check ")
      ? error
      : stoppedCheck(endpoint.id, error);
  }
}

function resolveEndpoint(
  { checker, operations }: CheckContext,
  { id, node, name }: Endpoint,
): ResolvedEndpoint | { unverified: string } {
  const config = node.arguments[0] && unwrap(node.arguments[0]);
  const responseType = node.typeArguments?.[0];
  if (
    !name ||
    !config ||
    !ts.isObjectLiteralExpression(config) ||
    !responseType
  ) {
    return {
      unverified:
        "Expected a named endpoint with explicit type arguments and an object definition.",
    };
  }
  if (
    config.properties.some(
      (property) =>
        ts.isSpreadAssignment(property) || hasComputedName(property),
    )
  ) {
    return {
      unverified:
        "Endpoint configuration contains a spread or computed property.",
    };
  }
  const rtk = resolveRtkRequest(config);
  if (!rtk) {
    return {
      unverified:
        "Cannot statically identify one HTTP request (queryFn, dynamic URL/method, conditional returns, computed properties, accessors, or spread).",
    };
  }
  const client = modelClientRequest(checker, rtk, node);
  const clientRoute = `${client.method} ${client.path}`;
  const candidates = operations.get(routeKey(client.method, client.path)) ?? [];
  if (candidates.length > 1) {
    return { unverified: `Ambiguous backend operations for ${clientRoute}` };
  }
  const operation = candidates[0];
  if (!operation) {
    return { unverified: `No generated operation for ${clientRoute}` };
  }
  return {
    endpointId: id,
    node,
    config,
    responseType,
    client,
    operation,
    route: `${client.method} ${operation.path}`,
  };
}

function checkResponse(
  context: CheckContext,
  {
    endpointId,
    node,
    config,
    responseType,
    operation,
    route,
  }: ResolvedEndpoint,
): Check[] {
  const { checker, generated } = context;
  const frontendResponse = checker.getTypeFromTypeNode(responseType);
  if (member(config, "transformResponse")) {
    return [
      {
        kind: "response",
        status: "unverified",
        message:
          "transformResponse needs an explicit raw-response contract; the RTK result type is transformed.",
      },
    ];
  }
  if (frontendResponse.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) {
    return [
      {
        kind: "response",
        status: "ignored",
        message: "Frontend intentionally discards the response.",
      },
    ];
  }
  const successes =
    operation.responses
      ?.getProperties()
      .filter((p) => /^2(?:\d\d|XX)$/.test(p.name)) ?? [];
  if (!successes.length) {
    return [
      {
        kind: "response",
        status: "unverified",
        message: "Backend does not declare a successful response schema.",
      },
    ];
  }
  return successes.map((success) =>
    guardedCheck(endpointId, { kind: "response", part: success.name }, () =>
      compareTypes(
        context,
        "response",
        `${route} response ${success.name}`,
        checker.getTypeOfSymbolAtLocation(success, generated),
        frontendResponse,
        node,
      ),
    ),
  );
}

function checkRequest(
  context: CheckContext,
  resolved: ResolvedEndpoint,
): Check[] {
  const { checker, generated } = context;
  const { endpointId, node, client, operation, route } = resolved;
  if (client.failure) {
    return [{ kind: "request", status: "mismatch", message: client.failure }];
  }
  if (client.unverified) {
    return [
      { kind: "request", status: "unverified", message: client.unverified },
    ];
  }
  const expected = (part: "query" | "body") =>
    propertyType(checker, operation.data, part, generated) ??
    checker.getUndefinedType();
  return [
    guardedCheck(endpointId, { kind: "request", part: "query" }, () =>
      comparePart(
        context,
        `${route} request query`,
        client.query,
        expected("query"),
        node,
      ),
    ),
    guardedCheck(endpointId, { kind: "request", part: "body" }, () =>
      comparePart(
        context,
        `${route} request body`,
        client.body,
        expected("body"),
        node,
      ),
    ),
    ...checkPathParameters(context, resolved),
  ];
}

function comparePart(
  context: CheckContext,
  location: string,
  part: SentPart,
  expected: ts.Type,
  at: ts.Node,
): Verdict {
  if (part.unverified) {
    const gap = looseTypeVerdict(context, "backend", expected, at, location);
    return combineVerdicts(
      [
        { status: "unverified", message: part.unverified },
        ...(gap ? [gap] : []),
      ],
      part.notes,
    );
  }
  return combineVerdicts(
    part.variants.map((object) =>
      compareObject(context, location, object, expected, at),
    ),
    part.notes,
  );
}

function compareObject(
  context: CheckContext,
  location: string,
  object: SentPayload,
  expected: ts.Type,
  at: ts.Node,
): Verdict {
  if (object.kind === "fields") {
    return compareFields(context, location, object, expected, at);
  }
  const sent =
    object.kind === "type" ? object.type : context.checker.getUndefinedType();
  return compareTypes(context, "request", location, sent, expected, at);
}

function compareFields(
  context: CheckContext,
  location: string,
  sent: SentFields,
  expected: ts.Type,
  at: ts.Node,
): Verdict {
  const { checker } = context;
  const gap = looseTypeVerdicts([
    ...sent.fields.flatMap((field) =>
      field.values.map((value) =>
        value.kind === "type"
          ? looseTypeVerdict(context, "frontend", value.type, at, location, {
              path: `$.${field.name}`,
              declaration: field.declaration,
            })
          : undefined,
      ),
    ),
    looseTypeVerdict(context, "backend", expected, at, location),
  ]);
  if (gap) {
    return gap;
  }
  const notAssignable: Verdict = {
    status: "mismatch",
    message: `$: frontend type ${sent.description} is not assignable to backend type ${typeText(checker, expected)}`,
  };
  const targets = unionMembers(checker, checker.getNonNullableType(expected));
  if (!targets.every(isObjectLike)) {
    return notAssignable;
  }
  const verdicts = targets.map((target) =>
    compareFieldsWithTarget(context, location, sent, target, at),
  );
  const [only] = verdicts;
  if (targets.length === 1 && only) {
    return only.status === "mismatch"
      ? {
          ...only,
          message: `${notAssignable.message}${LINE_BREAK}${only.message}`,
        }
      : only;
  }
  return verdicts.some((verdict) => verdict.status === "compatible")
    ? COMPATIBLE
    : notAssignable;
}

function compareFieldsWithTarget(
  context: CheckContext,
  location: string,
  sent: SentFields,
  target: ts.Type,
  at: ts.Node,
): Verdict {
  const { checker, root } = context;
  const verdicts: Verdict[] = [];
  const indexFor = (name: string) =>
    sent.indexes.find((index) =>
      indexAccepts(checker, checker.getStringLiteralType(name), index.keyType),
    );
  const names = new Set<string>();
  for (const property of properties(target)) {
    names.add(property.name);
    const label = `$.${property.name}`;
    const required = !(property.flags & ts.SymbolFlags.Optional);
    const field = sent.fields.find(
      (candidate) => candidate.name === property.name,
    );
    const index = field ? undefined : indexFor(property.name);
    const optional = field ? field.optional : true;
    const declaration = field?.declaration ?? index?.declaration;
    const values = field?.values ?? index?.values;
    if (!values) {
      if (required) {
        verdicts.push({
          status: "mismatch",
          message: `${label}: property required by the backend type is missing from the frontend type`,
        });
      }
      continue;
    }
    if (required && optional) {
      verdicts.push({
        status: "mismatch",
        message: `${fieldLabel(label, declaration, root)}: property is optional in the frontend type but required by the backend type`,
      });
    }
    const expected = checker.getTypeOfSymbolAtLocation(property, at);
    verdicts.push(
      ...values.map((value) =>
        compareValue(
          context,
          location,
          label,
          value,
          expected,
          at,
          declaration,
        ),
      ),
    );
  }
  const targetIndexes = checker.getIndexInfosOfType(target);
  for (const field of sent.fields.filter(({ name }) => !names.has(name))) {
    const index = targetIndexes.find((candidate) =>
      indexAccepts(
        checker,
        checker.getStringLiteralType(field.name),
        candidate.keyType,
      ),
    );
    if (index) {
      verdicts.push(
        ...field.values.map((value) =>
          compareValue(
            context,
            location,
            `$.${field.name}`,
            value,
            index.type,
            at,
            field.declaration,
          ),
        ),
      );
    }
  }
  verdicts.push(
    ...sent.fields
      .filter(
        (field) =>
          !names.has(field.name) &&
          !targetIndexes.some((index) =>
            indexAccepts(
              checker,
              checker.getStringLiteralType(field.name),
              index.keyType,
            ),
          ),
      )
      .map(
        (field): Verdict => ({
          status: "mismatch",
          message: `${fieldLabel(`$.${field.name}`, field.declaration, root)}: frontend sends a field the backend type does not declare`,
        }),
      ),
  );
  return combineVerdicts(verdicts, []);
}

function compareValue(
  context: CheckContext,
  location: string,
  label: string,
  value: SentValue,
  expected: ts.Type,
  at: ts.Node,
  declaration: ts.Declaration | undefined,
): Verdict {
  const { checker, root } = context;
  if (value.kind === "json") {
    return compareJson(
      context,
      location,
      label,
      value,
      expected,
      at,
      declaration,
    );
  }
  if (value.kind !== "empty" && value.itemOf) {
    return compareItem(
      context,
      location,
      label,
      value,
      expected,
      at,
      declaration,
    );
  }
  if (value.kind === "type") {
    return compareTypes(
      context,
      "request",
      location,
      value.type,
      expected,
      at,
      {
        path: label,
        declaration,
      },
    );
  }
  if (value.kind === "text") {
    return textReadings(checker, value.text).some((reading) =>
      checker.isTypeAssignableTo(reading, expected),
    )
      ? COMPATIBLE
      : {
          status: "mismatch",
          message: `${fieldLabel(label, declaration, root)}: frontend value ${JSON.stringify(value.text)} is not assignable to backend type ${typeText(checker, expected)}`,
        };
  }
  return {
    status: "mismatch",
    message: `${label}: frontend value "" is not assignable to backend type ${typeText(checker, expected)}`,
  };
}

function objectTargets(
  checker: ts.TypeChecker,
  expected: ts.Type,
  arrays: boolean,
): ts.Type[] {
  return unionMembers(checker, checker.getNonNullableType(expected)).filter(
    (member) =>
      isObjectLike(member) &&
      (arrays ? checker.isArrayType(member) : !checker.isArrayType(member)),
  );
}

/** Whether a backend type accepts an object with no properties. */
function acceptsEmptyObject(
  checker: ts.TypeChecker,
  expected: ts.Type,
): boolean {
  return objectTargets(checker, expected, false).some((target) =>
    properties(target).every(
      (property) => (property.flags & ts.SymbolFlags.Optional) !== 0,
    ),
  );
}

/** Compares what `JSON.stringify` writes for a value with the backend type for that position. */
function compareJson(
  context: CheckContext,
  location: string,
  label: string,
  value: Extract<SentValue, { kind: "json" }>,
  expected: ts.Type,
  at: ts.Node,
  declaration: ts.Declaration | undefined,
): Verdict {
  return compareJsonView(
    context,
    location,
    label,
    value.view,
    expected,
    at,
    declaration,
  );
}

function compareJsonView(
  context: CheckContext,
  location: string,
  label: string,
  view: JsonView,
  expected: ts.Type,
  at: ts.Node,
  declaration: ts.Declaration | undefined,
): Verdict {
  const { checker, root } = context;
  const mismatch = (message: string): Verdict => ({
    status: "mismatch",
    message: `${fieldLabel(label, declaration, root)}: ${message}`,
  });
  switch (view.kind) {
    case "type":
      return compareTypes(
        context,
        "request",
        location,
        view.type,
        expected,
        at,
        {
          path: label,
          declaration,
        },
      );
    case "throws":
      return mismatch(`${view.reason}, so the request is never sent`);
    case "unmodelled":
      return {
        status: "unverified",
        message: `${fieldLabel(label, declaration, root)}: ${view.reason}`,
      };
    case "null":
      return checker.isTypeAssignableTo(checker.getNullType(), expected)
        ? COMPATIBLE
        : mismatch(
            `frontend value null, from ${typeText(checker, view.from)}, is not assignable to backend type ${typeText(checker, expected)}`,
          );
    case "empty":
      return acceptsEmptyObject(checker, expected)
        ? COMPATIBLE
        : mismatch(
            `frontend value {}, from ${typeText(checker, view.from)}, is not assignable to backend type ${typeText(checker, expected)}`,
          );
    case "union":
      return combineVerdicts(
        view.members.map((member) =>
          compareJsonView(
            context,
            location,
            label,
            member,
            expected,
            at,
            declaration,
          ),
        ),
        [],
      );
    case "array": {
      const [only, ...more] = objectTargets(checker, expected, true);
      if (!only) {
        return mismatch(
          `frontend value ${describeJsonView(checker, view)} is not assignable to backend type ${typeText(checker, expected)}`,
        );
      }
      if (more.length) {
        // Several backend array types: compare the type from before JSON.stringify, and say so.
        const verdict = compareTypes(
          context,
          "request",
          location,
          view.from,
          expected,
          at,
          { path: label, declaration },
        );
        return verdict.status === "compatible"
          ? verdict
          : {
              ...verdict,
              message: `${verdict.message}${LINE_BREAK}${fieldLabel(label, declaration, root)}: compared before JSON.stringify, because the backend has several array types here`,
            };
      }
      const element = checker.getIndexTypeOfType(only, ts.IndexKind.Number);
      return element
        ? compareJsonView(
            context,
            location,
            `${label}[]`,
            view.element,
            element,
            at,
            undefined,
          )
        : mismatch(
            `frontend value ${describeJsonView(checker, view)} is not assignable to backend type ${typeText(checker, expected)}`,
          );
    }
    case "object": {
      const [only, ...more] = objectTargets(checker, expected, false);
      if (!only) {
        return mismatch(
          `frontend value ${describeJsonView(checker, view)} is not assignable to backend type ${typeText(checker, expected)}`,
        );
      }
      if (more.length) {
        // Several backend object types: compare the type from before JSON.stringify, and say so.
        const verdict = compareTypes(
          context,
          "request",
          location,
          view.from,
          expected,
          at,
          { path: label, declaration },
        );
        return verdict.status === "compatible"
          ? verdict
          : {
              ...verdict,
              message: `${verdict.message}${LINE_BREAK}${fieldLabel(label, declaration, root)}: compared before JSON.stringify, because the backend has several object types here`,
            };
      }
      const indexes = checker.getIndexInfosOfType(only);
      const verdicts = properties(only).map((property): Verdict => {
        const field = view.fields.find(
          (candidate) => candidate.name === property.name,
        );
        const required = !(property.flags & ts.SymbolFlags.Optional);
        const propertyLabel = `${label}.${property.name}`;
        if (!field) {
          return required
            ? {
                status: "mismatch",
                message: `${propertyLabel}: property required by the backend type is missing from the frontend type`,
              }
            : COMPATIBLE;
        }
        const presence: Verdict[] =
          required && field.optional
            ? [
                {
                  status: "mismatch",
                  message: `${fieldLabel(propertyLabel, field.declaration, root)}: property is optional in the frontend type but required by the backend type`,
                },
              ]
            : [];
        return combineVerdicts(
          [
            ...presence,
            compareJsonView(
              context,
              location,
              propertyLabel,
              field.view,
              checker.getTypeOfSymbolAtLocation(property, at),
              at,
              field.declaration,
            ),
          ],
          [],
        );
      });
      const extras = view.fields
        .filter((field) => !properties(only).some((p) => p.name === field.name))
        .map((field): Verdict => {
          const index = indexes.find((candidate) =>
            indexAccepts(
              checker,
              checker.getStringLiteralType(field.name),
              candidate.keyType,
            ),
          );
          return index
            ? compareJsonView(
                context,
                location,
                `${label}.${field.name}`,
                field.view,
                index.type,
                at,
                field.declaration,
              )
            : {
                status: "mismatch",
                message: `${fieldLabel(`${label}.${field.name}`, field.declaration, root)}: frontend sends a field the backend type does not declare`,
              };
        });
      return combineVerdicts([...verdicts, ...extras], []);
    }
  }
}

// Each item is sent as its own query value, so it is compared with the backend's array element type.
// A backend type without an array still gets the whole array compared, as it would receive repeated keys.
function compareItem(
  context: CheckContext,
  location: string,
  label: string,
  value: Extract<SentValue, { kind: "type" | "text" }>,
  expected: ts.Type,
  at: ts.Node,
  declaration: ts.Declaration | undefined,
): Verdict {
  const { checker, root } = context;
  const elements = unionMembers(
    checker,
    checker.getNonNullableType(expected),
  ).flatMap((member) => {
    const element =
      checker.isArrayType(member) &&
      checker.getIndexTypeOfType(member, ts.IndexKind.Number);
    return element ? [element] : [];
  });
  const targets = elements.length ? elements : [expected];
  const itemLabel = `${label}[]`;
  const verdicts: Verdict[] = [];
  if (!elements.length && value.itemOf) {
    verdicts.push(
      compareTypes(context, "request", location, value.itemOf, expected, at, {
        path: label,
        declaration,
      }),
    );
  }
  if (value.kind === "type") {
    const [only, ...others] = targets;
    verdicts.push(
      compareTypes(
        context,
        "request",
        location,
        value.type,
        only && !others.length ? only : expected,
        at,
        { path: itemLabel, declaration },
      ),
    );
  } else if (
    !textReadings(checker, value.text).some((reading) =>
      targets.some((target) => checker.isTypeAssignableTo(reading, target)),
    )
  ) {
    verdicts.push({
      status: "mismatch",
      message: `${fieldLabel(itemLabel, declaration, root)}: frontend value ${JSON.stringify(value.text)} is not assignable to backend type ${typeText(checker, expected)}`,
    });
  }
  return combineVerdicts(verdicts, []);
}

/** The literal types an inline query value can be decoded as: string, boolean or number. */
function textReadings(checker: ts.TypeChecker, text: string): ts.Type[] {
  const readings: ts.Type[] = [checker.getStringLiteralType(text)];
  if (text === "true") {
    readings.push(checker.getTrueType());
  }
  if (text === "false") {
    readings.push(checker.getFalseType());
  }
  if (text !== "" && String(Number(text)) === text) {
    readings.push(checker.getNumberLiteralType(Number(text)));
  }
  return readings;
}

function checkPathParameters(
  context: CheckContext,
  { endpointId, node, client, operation, route }: ResolvedEndpoint,
): Check[] {
  const { checker, generated } = context;
  const pathType = propertyType(checker, operation.data, "path", generated);
  const pathNames = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
    (match) => match[1],
  );
  if (pathNames.length !== client.pathParameters.length) {
    return [
      {
        kind: "request",
        part: "path",
        status: "unverified",
        message:
          "Path parameters are not represented by URL template expressions.",
      },
    ];
  }
  return pathNames.map((name, index): Check => {
    const part = `path.${index}`;
    const parameter = client.pathParameters[index];
    const expected =
      pathType && name
        ? propertyType(
            checker,
            checker.getNonNullableType(pathType),
            name,
            generated,
          )
        : undefined;
    if (!parameter || !expected) {
      return {
        kind: "request",
        part,
        status: "unverified",
        message: "Backend path parameter schema is missing.",
      };
    }
    const location = `${route} request path parameter ${name}`;
    return guardedCheck(endpointId, { kind: "request", part }, () =>
      pathParameterVerdict(context, location, parameter, expected, node),
    );
  });
}

function pathParameterVerdict(
  context: CheckContext,
  location: string,
  parameter: ClientRequest["pathParameters"][number],
  expected: ts.Type,
  node: ts.Node,
): Verdict {
  const verdicts: Verdict[] = parameter.unverified
    ? [{ status: "unverified", message: parameter.unverified }]
    : parameter.values.map((value) =>
        value.kind === "empty"
          ? {
              status: "mismatch",
              message: `$: ${parameter.source} may be replaced with an empty string, which removes the path segment`,
            }
          : compareValue(
              context,
              location,
              "$",
              value,
              expected,
              node,
              undefined,
            ),
      );
  return combineVerdicts(verdicts, parameter.notes);
}
