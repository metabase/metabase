import ts from "typescript";

import {
  type ClientRequest,
  type SentPart,
  UNENCODED_PATH_DELIMITER,
  modelClientRequest,
  pathTextChangesSegment,
} from "./client-request";
import {
  type RtkRequest,
  mayReturnRawResponse,
  resolveRtkRequest,
} from "./rtk-request";
import { typeShape } from "./shape";
import {
  type CompareContext,
  LINE_BREAK,
  TypeWalkError,
  type UnconstrainedPosition,
  type Verdict,
  type WalkOptions,
  combineVerdicts,
  compareShape,
  isStackOverflow,
  looseShapeVerdict,
  renderDiagnostics,
} from "./type-comparison";
import {
  hasComputedName,
  member,
  propertyName,
  propertyType,
  unionMembers,
  unwrap,
} from "./typescript-utils";

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

type Check = Pick<ContractResult, "kind" | "part" | "status"> &
  Omit<Verdict, "status">;

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
  request: RtkRequest;
  operation: Operation;
  /** The HTTP method and backend path, e.g. `GET /api/card/{id}`. */
  route: string;
}

export function checkContracts({
  program,
  endpointFiles,
  generatedFile,
  root,
  walkOptions,
}: {
  program: ts.Program;
  endpointFiles: readonly string[];
  generatedFile: string;
  root: string;
  walkOptions?: WalkOptions;
}): ContractResult[] {
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
    ...walkOptions,
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
        ...renderDiagnostics(check.diagnostics, check.notes),
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
  files: readonly string[],
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
      .map((alias) => [alias.name.text, alias]),
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
  endpointFiles: readonly string[],
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
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const callee = unwrap(node.expression);
  // A builder method can be destructured, renamed, or imported from another file.
  // The callable type retains its original method symbol across these bindings.
  const method = checker.getTypeAtLocation(callee).getSymbol();
  return (
    !!method &&
    ["query", "mutation", "infiniteQuery"].includes(method.name) &&
    !!method.declarations?.some((declaration) => {
      const owner = declaration.parent;
      return (
        ts.isTypeLiteralNode(owner) &&
        ts.isTypeAliasDeclaration(owner.parent) &&
        owner.parent.name.text === "EndpointBuilder"
      );
    })
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

function stoppedCheck(
  endpointId: string,
  check: Pick<Check, "kind" | "part">,
  error: unknown,
): Check {
  if (!(error instanceof TypeWalkError) && !isStackOverflow(error)) {
    throw error;
  }
  const reason =
    error instanceof TypeWalkError
      ? error.message
      : "the call stack overflowed outside a type walk";
  return {
    ...check,
    status: "unverified",
    diagnostics: [
      `API contract check ${checkId(endpointId, check)} stopped: ${reason}`,
    ],
  };
}

function guardedCheck(
  endpointId: string,
  check: Pick<Check, "kind" | "part">,
  compare: () => Verdict,
): Check {
  try {
    return { ...check, ...compare() };
  } catch (error) {
    return stoppedCheck(endpointId, check, error);
  }
}

function checkEndpoint(context: CheckContext, endpoint: Endpoint): Check[] {
  let resolved: ReturnType<typeof resolveEndpoint>;
  try {
    resolved = resolveEndpoint(context, endpoint);
  } catch (error) {
    return [stoppedCheck(endpoint.id, { kind: "endpoint" }, error)];
  }
  if ("unverified" in resolved) {
    return [
      {
        kind: "endpoint",
        status: "unverified",
        diagnostics: [resolved.unverified],
      },
    ];
  }
  const checks: Check[] = [];
  for (const kind of ["response", "request"] as const) {
    try {
      checks.push(
        ...(kind === "response" ? checkResponse : checkRequest)(
          context,
          resolved,
        ),
      );
    } catch (error) {
      checks.push(stoppedCheck(endpoint.id, { kind }, error));
    }
  }
  return checks;
}

function resolveEndpoint(
  { operations }: CheckContext,
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
  const clientRoute = `${rtk.method} ${rtk.url.path}`;
  const key = routeKey(rtk.method, rtk.url.path);
  const segments = key.split("/");
  // Prefer an exact route (e.g. /api/setting/available) over /api/setting/{key}.
  const candidates =
    operations.get(key) ??
    [...operations.entries()].flatMap(([pattern, matches]) => {
      const parts = pattern.split("/");
      return parts.length === segments.length &&
        parts.every(
          (part, i) =>
            part === segments[i] ||
            (part === "{}" && segments[i] && !segments[i].includes("{")),
        )
        ? matches
        : [];
    });
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
    request: rtk,
    operation,
    route: `${rtk.method} ${operation.path}`,
  };
}

function checkResponse(
  context: CheckContext,
  {
    endpointId,
    node,
    config,
    request,
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
        diagnostics: [
          "transformResponse needs an explicit raw-response contract; the RTK result type is transformed.",
        ],
      },
    ];
  }
  if (frontendResponse.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) {
    return [
      {
        kind: "response",
        status: "ignored",
        diagnostics: ["Frontend intentionally discards the response."],
      },
    ];
  }
  if (mayReturnRawResponse(checker, request)) {
    return [
      {
        kind: "response",
        status: "unverified",
        diagnostics: [
          "rawResponse can return a Response object before its body is decoded.",
        ],
      },
    ];
  }
  const successes =
    operation.responses
      ?.getProperties()
      .filter((property) => /^2(?:\d\d|XX)$/.test(property.name)) ?? [];
  if (!successes.length) {
    return [
      {
        kind: "response",
        status: "unverified",
        diagnostics: ["Backend does not declare a successful response schema."],
      },
    ];
  }
  return successes.map((success) =>
    guardedCheck(endpointId, { kind: "response", part: success.name }, () =>
      compareShape(
        context,
        "response",
        `${route} response ${success.name}`,
        typeShape(
          success.name === "204"
            ? checker.getNullType()
            : checker.getTypeOfSymbolAtLocation(success, generated),
        ),
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
  const { endpointId, node, request, operation, route } = resolved;
  const client = modelClientRequest(checker, request, node, context);
  if (client.kind !== "modelled") {
    return [
      {
        kind: "request",
        status: client.kind === "failed" ? "mismatch" : "unverified",
        diagnostics: [client.message],
      },
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
    ...checkPathParameters(context, resolved, client),
  ];
}

function comparePart(
  context: CheckContext,
  location: string,
  part: SentPart,
  expected: ts.Type,
  at: ts.Node,
): Verdict {
  if (!part.unverified && !part.variants.length) {
    return {
      status: "unverified",
      diagnostics: ["the request model produced no variants"],
    };
  }
  if (part.unverified) {
    // Whatever the unverified value holds, a part the client always sends cannot fit a backend that declares none.
    if (
      part.alwaysSent &&
      expected.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Never)
    ) {
      return {
        status: "mismatch",
        diagnostics: [
          `$: the client always sends this part, and the backend declares none (${part.unverified})`,
        ],
        notes: part.notes,
      };
    }
    const gap = looseShapeVerdict(
      context,
      "backend",
      typeShape(expected),
      at,
      location,
    );
    return combineVerdicts(
      [
        { status: "unverified", diagnostics: [part.unverified] },
        ...(gap ? [gap] : []),
      ],
      part.notes,
    );
  }
  return combineVerdicts(
    part.variants.map((shape) =>
      compareShape(context, "request", location, shape, expected, at),
    ),
    part.notes,
  );
}

function checkPathParameters(
  context: CheckContext,
  { endpointId, node, operation, route }: ResolvedEndpoint,
  client: ClientRequest,
): Check[] {
  const { checker, generated } = context;
  const pathType = propertyType(checker, operation.data, "path", generated);
  const pathNames = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
    (match) => match[1],
  );
  const dynamic = [...client.pathParameters];
  const segments = client.path.split("/");
  const parameters = operation.path.split("/").flatMap((segment, index) => {
    const names = [...segment.matchAll(/\{[^}]+\}/g)];
    const actual = segments[index];
    if (
      names.length === 1 &&
      actual &&
      !actual.includes("{param}") &&
      /^\{[^}]+\}$/.test(segment)
    ) {
      try {
        const text = decodeURIComponent(actual);
        if (text === "." || text === ".." || /[?#\\]/.test(actual)) {
          return [];
        }
        return [
          {
            source: "literal path segment",
            encoded: false,
            values: [{ kind: "text" as const, text }],
            notes: [],
            unverified: undefined,
          },
        ];
      } catch {
        return [];
      }
    }
    return dynamic.splice(0, names.length);
  });
  if (pathNames.length !== parameters.length || dynamic.length) {
    return [
      {
        kind: "request",
        part: "path",
        status: "unverified",
        diagnostics: [
          "Path parameters are not represented by URL template expressions.",
        ],
      },
    ];
  }
  return pathNames.map((name, index): Check => {
    const part = `path.${index}`;
    const parameter = parameters[index];
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
        diagnostics: ["Backend path parameter schema is missing."],
      };
    }
    const location = `${route} request path parameter ${name}`;
    return guardedCheck(endpointId, { kind: "request", part }, () =>
      pathParameterVerdict(context, location, parameter, expected, node),
    );
  });
}

function hasUnverifiedPathText(
  type: ts.Type,
  encoded: boolean,
  fragment = false,
): boolean {
  if (type.isUnionOrIntersection()) {
    return type.types.some((part) =>
      hasUnverifiedPathText(part, encoded, fragment),
    );
  }
  if (type.flags & ts.TypeFlags.TemplateLiteral) {
    // TypeScript tags TemplateLiteralType with the TemplateLiteral flag.
    const { texts, types } = type as ts.TemplateLiteralType;
    if (encoded && texts.some((text) => /[^.]/.test(text))) {
      // A fixed non-dot character excludes empty and dot segments after encoding.
      return false;
    }
    return (
      (!encoded && texts.some((text) => UNENCODED_PATH_DELIMITER.test(text))) ||
      types.some((part) => hasUnverifiedPathText(part, encoded, true))
    );
  }
  if (type.flags & ts.TypeFlags.StringMapping) {
    // TypeScript tags StringMappingType with the StringMapping flag.
    const mapping = type as ts.StringMappingType;
    return hasUnverifiedPathText(mapping.type, encoded, fragment);
  }
  if (type.isStringLiteral()) {
    return fragment
      ? !encoded && UNENCODED_PATH_DELIMITER.test(type.value)
      : pathTextChangesSegment(type.value, encoded);
  }
  return (
    (type.flags &
      (ts.TypeFlags.String |
        ts.TypeFlags.Any |
        ts.TypeFlags.Unknown |
        ts.TypeFlags.TypeParameter)) !==
    0
  );
}

function pathParameterVerdict(
  context: CheckContext,
  location: string,
  parameter: ClientRequest["pathParameters"][number],
  expected: ts.Type,
  node: ts.Node,
): Verdict {
  const verdicts: Verdict[] = parameter.unverified
    ? [{ status: "unverified", diagnostics: [parameter.unverified] }]
    : parameter.values.map((value) =>
        (value.kind === "text" && value.text === "") ||
        (value.kind === "type" &&
          unionMembers(context.checker, value.type).some(
            (part) => part.isStringLiteral() && part.value === "",
          ))
          ? {
              status: "mismatch",
              diagnostics: [
                `$: ${parameter.source} may be replaced with an empty string, which removes the path segment`,
              ],
            }
          : compareShape(context, "request", location, value, expected, node),
      );
  if (
    verdicts.every((verdict) => verdict.status === "compatible") &&
    parameter.values.some(
      (value) =>
        value.kind === "type" &&
        hasUnverifiedPathText(value.type, parameter.encoded),
    )
  ) {
    verdicts.push({
      status: "unverified",
      diagnostics: [
        `$: ${parameter.source} may contain text that changes the route, so the checker cannot verify that it stays in one path segment`,
      ],
    });
  }
  return combineVerdicts(verdicts, parameter.notes);
}
