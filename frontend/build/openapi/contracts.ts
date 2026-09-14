import ts from "typescript";

export type ContractStatus =
  | "compatible"
  | "mismatch"
  | "unverified"
  | "ignored";

export type ContractKind = "endpoint" | "request" | "response";

export interface ContractResult {
  id: string;
  endpointId: string;
  kind: ContractKind;
  part?: string;
  file: string;
  line: number;
  status: ContractStatus;
  message: string;
}

interface ContractProblem {
  status: "mismatch" | "unverified";
  message: string;
}

type Verdict = Pick<ContractResult, "status" | "message">;

type Check = Pick<ContractResult, "kind" | "part" | "status" | "message">;

interface Operation {
  path: string;
  data: ts.Type;
  responses: ts.Type | undefined;
}

interface CheckContext {
  checker: ts.TypeChecker;
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

interface ParsedUrl {
  path: string;
  parameters: ts.Expression[];
}

interface HttpRequest {
  method: string;
  path: string;
  url: ParsedUrl;
  object: ts.ObjectLiteralExpression | undefined;
}

interface ResolvedEndpoint {
  node: ts.CallExpression;
  config: ts.ObjectLiteralExpression;
  responseType: ts.TypeNode;
  request: HttpRequest;
  operation: Operation;
}

const MAX_MISMATCH_MESSAGES = 5;
const MAX_MISMATCH_DEPTH = 8;
const MAX_FIELD_COVERAGE_DEPTH = 64;

export function isFailing(result: ContractResult): boolean {
  return result.status === "mismatch" || result.status === "unverified";
}

export function formatResult(result: ContractResult): string {
  return `${result.file}:${result.line} ${result.id}\n  ${result.status}: ${result.message}`;
}

function propertyName(node: ts.Node): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node)
    ? node.text
    : undefined;
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

function member(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((p) => p.name && propertyName(p.name) === name);
}

function expressionMember(object: ts.ObjectLiteralExpression, name: string) {
  const value = member(object, name);
  if (value && ts.isPropertyAssignment(value)) {
    return unwrap(value.initializer);
  }
  if (value && ts.isShorthandPropertyAssignment(value)) {
    return value.name;
  }
  return undefined;
}

function hasComputedName(property: ts.ObjectLiteralElementLike): boolean {
  return (
    property.name !== undefined && ts.isComputedPropertyName(property.name)
  );
}

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function propertyType(
  checker: ts.TypeChecker,
  type: ts.Type,
  name: string,
  at: ts.Node,
) {
  const symbol = type.getProperty(name);
  return symbol && checker.getTypeOfSymbolAtLocation(symbol, at);
}

function isTypeReference(type: ts.Type): type is ts.TypeReference {
  return (
    "objectFlags" in type &&
    typeof type.objectFlags === "number" &&
    (type.objectFlags & ts.ObjectFlags.Reference) !== 0
  );
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replace(/\{[^}]+\}|:[\w-]+/g, "{}")}`;
}

function mismatchDetail(
  checker: ts.TypeChecker,
  from: ts.Type,
  to: ts.Type,
  at: ts.Node,
): string {
  const messages: string[] = [];
  const visit = (from: ts.Type, to: ts.Type, path: string, depth: number) => {
    if (
      messages.length >= MAX_MISMATCH_MESSAGES ||
      checker.isTypeAssignableTo(from, to)
    ) {
      return;
    }
    const before = messages.length;
    if (depth < MAX_MISMATCH_DEPTH) {
      if (from.isUnion()) {
        from.types.forEach((type) => visit(type, to, path, depth + 1));
      } else {
        const target = checker.getNonNullableType(to);
        const fromElement =
          checker.isArrayType(from) &&
          checker.getIndexTypeOfType(from, ts.IndexKind.Number);
        const toElement =
          checker.isArrayType(target) &&
          checker.getIndexTypeOfType(target, ts.IndexKind.Number);
        if (fromElement && toElement) {
          visit(fromElement, toElement, `${path}[]`, depth + 1);
        } else if (
          from.flags & ts.TypeFlags.Object &&
          target.flags & ts.TypeFlags.Object
        ) {
          for (const property of target.getProperties()) {
            if (messages.length >= MAX_MISMATCH_MESSAGES) {
              break;
            }
            const actualProperty = from.getProperty(property.name);
            const field = `${path}.${property.name}`;
            if (
              !(property.flags & ts.SymbolFlags.Optional) &&
              !actualProperty
            ) {
              messages.push(`${field}: required property is missing`);
            } else if (
              !(property.flags & ts.SymbolFlags.Optional) &&
              actualProperty &&
              actualProperty.flags & ts.SymbolFlags.Optional
            ) {
              messages.push(
                `${field}: property is optional but required by the target contract`,
              );
            } else {
              const actual =
                propertyType(checker, from, property.name, at) ??
                checker.getUndefinedType();
              visit(
                actual,
                checker.getTypeOfSymbolAtLocation(property, at),
                field,
                depth + 1,
              );
            }
          }
        }
      }
    }
    if (messages.length === before) {
      messages.push(
        `${path}: ${checker.typeToString(from)} is not assignable to ${checker.typeToString(to)}`,
      );
    }
  };
  visit(from, to, "$", 0);
  return [...new Set(messages)].join("\n  ");
}

function operations(
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

function responseFieldProblem(
  checker: ts.TypeChecker,
  backend: ts.Type,
  frontend: ts.Type,
  at: ts.Node,
): ContractProblem | undefined {
  const seen = new Map<ts.Type, ts.Type[][]>();
  const variants = (type: ts.Type): ts.Type[] =>
    type.isUnion() ? type.types.flatMap(variants) : [type];
  const visit = (
    backendTypes: ts.Type[],
    frontend: ts.Type,
    path: string,
    depth: number,
  ): ContractProblem | undefined => {
    for (const type of backendTypes) {
      if (!checker.isTypeAssignableTo(type, frontend)) {
        return {
          status: "mismatch",
          message: `${path}: ${checker.typeToString(type)} is not assignable to ${checker.typeToString(frontend)}`,
        };
      }
    }
    for (const variant of variants(frontend)) {
      if (!(variant.flags & ts.TypeFlags.Object) && !variant.isIntersection()) {
        continue;
      }
      const candidates = [...new Set(backendTypes.flatMap(variants))].filter(
        (type) => checker.isTypeAssignableTo(type, variant),
      );
      const previous = seen.get(variant) ?? [];
      if (
        previous.some(
          (group) =>
            group.length === candidates.length &&
            group.every((type) => candidates.includes(type)),
        )
      ) {
        continue;
      }
      seen.set(variant, [...previous, candidates]);
      if (depth >= MAX_FIELD_COVERAGE_DEPTH || !candidates.length) {
        return {
          status: "unverified",
          message: `${path}: cannot establish frontend field coverage ${depth >= MAX_FIELD_COVERAGE_DEPTH ? `beyond ${MAX_FIELD_COVERAGE_DEPTH} levels` : "for this union variant"}.`,
        };
      }
      if (checker.isArrayType(variant)) {
        const element = checker.getIndexTypeOfType(
          variant,
          ts.IndexKind.Number,
        );
        const elements = candidates.flatMap((type) => {
          const value = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
          return value ? [value] : [];
        });
        if (element) {
          const problem = visit(elements, element, `${path}[]`, depth + 1);
          if (problem) {
            return problem;
          }
        }
        continue;
      }
      const tuple = checker.isTupleType(variant);
      for (const property of variant.getProperties()) {
        if (tuple && !/^\d+$/.test(property.name)) {
          continue;
        }
        const field = tuple
          ? `${path}[${property.name}]`
          : `${path}.${property.name}`;
        const values = candidates.flatMap((type) => {
          const declared = propertyType(checker, type, property.name, at);
          if (declared) {
            return [declared];
          }
          const key = checker.getStringLiteralType(property.name);
          const numeric = String(Number(property.name)) === property.name;
          return checker
            .getIndexInfosOfType(type)
            .filter(
              (index) =>
                checker.isTypeAssignableTo(key, index.keyType) ||
                (numeric &&
                  checker.isTypeAssignableTo(
                    checker.getNumberLiteralType(Number(property.name)),
                    index.keyType,
                  )),
            )
            .map((index) => index.type);
        });
        if (!values.length) {
          return {
            status: "mismatch",
            message: `${field}: frontend field is not declared in the backend schema.`,
          };
        }
        const problem = visit(
          values,
          checker.getTypeOfSymbolAtLocation(property, at),
          field,
          depth + 1,
        );
        if (problem) {
          return problem;
        }
      }
      for (const index of checker.getIndexInfosOfType(variant)) {
        const values = candidates.flatMap((type) =>
          checker
            .getIndexInfosOfType(type)
            .filter((backendIndex) =>
              checker.isTypeAssignableTo(index.keyType, backendIndex.keyType),
            )
            .map((backendIndex) => backendIndex.type),
        );
        if (!values.length) {
          return {
            status: "mismatch",
            message: `${path}[key]: frontend index signature is not declared in the backend schema.`,
          };
        }
        const problem = visit(values, index.type, `${path}[key]`, depth + 1);
        if (problem) {
          return problem;
        }
      }
    }
    return undefined;
  };
  return visit([backend], frontend, "$", 0);
}

function looseType(
  checker: ts.TypeChecker,
  type: ts.Type,
  at: ts.Node,
  path: string,
  seen = new Set<ts.Type>(),
): string | undefined {
  if (seen.has(type)) {
    return undefined;
  }
  seen.add(type);
  if (
    type.flags &
    (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)
  ) {
    return `${path}: ${checker.typeToString(type)} is unconstrained or unresolved`;
  }
  if (type.isUnionOrIntersection()) {
    for (const part of type.types) {
      const gap = looseType(checker, part, at, path, seen);
      if (gap) {
        return gap;
      }
    }
    return undefined;
  }
  if (!(type.flags & ts.TypeFlags.Object)) {
    return undefined;
  }
  if (
    isTypeReference(type) &&
    (checker.isArrayType(type) || checker.isTupleType(type))
  ) {
    for (const element of checker.getTypeArguments(type)) {
      const gap = looseType(checker, element, at, `${path}[]`, seen);
      if (gap) {
        return gap;
      }
    }
    return undefined;
  }
  for (const index of checker.getIndexInfosOfType(type)) {
    const gap = looseType(checker, index.type, at, `${path}[key]`, seen);
    if (gap) {
      return gap;
    }
  }
  for (const property of type.getProperties()) {
    const gap = looseType(
      checker,
      checker.getTypeOfSymbolAtLocation(property, at),
      at,
      `${path}.${property.name}`,
      seen,
    );
    if (gap) {
      return gap;
    }
  }
  return undefined;
}

function returnExpression(fn: ts.Node): ts.Expression | undefined {
  if (
    !ts.isArrowFunction(fn) &&
    !ts.isFunctionExpression(fn) &&
    !ts.isMethodDeclaration(fn)
  ) {
    return undefined;
  }
  if (!fn.body) {
    return undefined;
  }
  if (!ts.isBlock(fn.body)) {
    return unwrap(fn.body);
  }
  const returns: ts.ReturnStatement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node)) {
      returns.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  // A single return inside an if/loop can still fall through without a request.
  const last = fn.body.statements.at(-1);
  const value =
    returns.length === 1 && last && ts.isReturnStatement(last)
      ? last.expression
      : undefined;
  return value && unwrap(value);
}

function parseUrl(url: ts.Expression): ParsedUrl | undefined {
  if (ts.isStringLiteral(url) || ts.isNoSubstitutionTemplateLiteral(url)) {
    return { path: url.text, parameters: [] };
  }
  if (!ts.isTemplateExpression(url)) {
    return undefined;
  }
  return {
    path:
      url.head.text +
      url.templateSpans.map((span) => `{param}${span.literal.text}`).join(""),
    parameters: url.templateSpans.map((span) => {
      const expression = unwrap(span.expression);
      // Compare the value before URL encoding converts it to a string.
      if (
        ts.isCallExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === "encodeURIComponent" &&
        expression.arguments.length === 1
      ) {
        return expression.arguments[0] ?? expression;
      }
      return expression;
    }),
  };
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

function* discoverEndpoints(
  program: ts.Program,
  checker: ts.TypeChecker,
  endpointFiles: string[],
  root: string,
): Generator<Endpoint> {
  const locations = new Map<string, string>();
  for (const fileName of endpointFiles) {
    const source = program.getSourceFile(fileName);
    if (!source) {
      throw new Error(`Missing endpoint source: ${fileName}`);
    }
    const file = source.fileName.replace(`${root}/`, "");
    const visit = function* (node: ts.Node): Generator<Endpoint> {
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
        yield { node, name, id, file, line };
      }
      const children: ts.Node[] = [];
      ts.forEachChild(node, (child) => {
        children.push(child);
      });
      for (const child of children) {
        yield* visit(child);
      }
    };
    yield* visit(source);
  }
}

function resolveRequest(
  config: ts.ObjectLiteralExpression,
): HttpRequest | undefined {
  const query = member(config, "query");
  const returned =
    query &&
    returnExpression(
      ts.isPropertyAssignment(query) ? unwrap(query.initializer) : query,
    );
  const object =
    returned && ts.isObjectLiteralExpression(returned) ? returned : undefined;
  const urlExpression = object ? expressionMember(object, "url") : returned;
  const url = urlExpression && parseUrl(urlExpression);
  const method = object && expressionMember(object, "method");
  if (
    !url ||
    object?.properties.some(
      (property) =>
        (!ts.isPropertyAssignment(property) &&
          !ts.isShorthandPropertyAssignment(property)) ||
        hasComputedName(property),
    ) ||
    (method && !ts.isStringLiteral(method))
  ) {
    return undefined;
  }
  return {
    method: method ? method.text : "GET",
    path: url.path.split("?")[0] ?? url.path,
    url,
    object,
  };
}

function resolveEndpoint(
  { operations }: CheckContext,
  { node, name }: Endpoint,
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
  const request = resolveRequest(config);
  if (!request) {
    return {
      unverified:
        "Cannot statically identify one HTTP request (queryFn, dynamic URL/method, conditional returns, computed properties, accessors, or spread).",
    };
  }
  const candidates =
    operations.get(routeKey(request.method, request.path)) ?? [];
  if (candidates.length > 1) {
    return {
      unverified: `Ambiguous backend operations for ${request.method} ${request.path}`,
    };
  }
  const operation = candidates[0];
  if (!operation) {
    return {
      unverified: `No generated operation for ${request.method} ${request.path}`,
    };
  }
  return { node, config, responseType, request, operation };
}

function compareTypes(
  checker: ts.TypeChecker,
  kind: "request" | "response",
  from: ts.Type,
  to: ts.Type,
  at: ts.Node,
): Verdict {
  const [fromSide, toSide] =
    kind === "response" ? ["backend$", "frontend$"] : ["frontend$", "backend$"];
  const gap =
    looseType(checker, from, at, fromSide) ??
    looseType(checker, to, at, toSide);
  if (gap) {
    return { status: "unverified", message: gap };
  }
  if (!checker.isTypeAssignableTo(from, to)) {
    return {
      status: "mismatch",
      message: mismatchDetail(checker, from, to, at),
    };
  }
  const problem =
    kind === "response"
      ? responseFieldProblem(checker, from, to, at)
      : undefined;
  return problem ?? { status: "compatible", message: "Compatible" };
}

function checkResponse(
  { checker, generated }: CheckContext,
  { node, config, responseType, operation }: ResolvedEndpoint,
): Check[] {
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
  return successes.map((success) => ({
    kind: "response",
    part: success.name,
    ...compareTypes(
      checker,
      "response",
      checker.getTypeOfSymbolAtLocation(success, generated),
      frontendResponse,
      node,
    ),
  }));
}

function checkRequest(
  { checker, generated }: CheckContext,
  { node, request, operation }: ResolvedEndpoint,
): Check[] {
  if (request.url.path.includes("?") || /:[\w-]+/.test(request.path)) {
    return [
      {
        kind: "request",
        status: "unverified",
        message:
          "Inline query strings and Express-style path substitutions need explicit mapping.",
      },
    ];
  }
  const fieldChecks = (
    [
      ["query", "params"],
      ["body", "body"],
    ] as const
  ).map(([part, field]): Check => {
    const expected =
      propertyType(checker, operation.data, part, generated) ??
      checker.getUndefinedType();
    const expression =
      request.object && expressionMember(request.object, field);
    const actual = expression
      ? checker.getTypeAtLocation(expression)
      : checker.getUndefinedType();
    return {
      kind: "request",
      part,
      ...compareTypes(checker, "request", actual, expected, node),
    };
  });
  return [
    ...fieldChecks,
    ...checkPathParameters(checker, generated, node, request, operation),
  ];
}

function checkPathParameters(
  checker: ts.TypeChecker,
  generated: ts.SourceFile,
  node: ts.CallExpression,
  request: HttpRequest,
  operation: Operation,
): Check[] {
  const pathType = propertyType(checker, operation.data, "path", generated);
  const pathNames = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
    (match) => match[1],
  );
  if (pathNames.length !== request.url.parameters.length) {
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
    const expression = request.url.parameters[index];
    const expected =
      pathType && name
        ? propertyType(
            checker,
            checker.getNonNullableType(pathType),
            name,
            generated,
          )
        : undefined;
    if (!expression || !expected) {
      return {
        kind: "request",
        part,
        status: "unverified",
        message: "Backend path parameter schema is missing.",
      };
    }
    return {
      kind: "request",
      part,
      ...compareTypes(
        checker,
        "request",
        checker.getTypeAtLocation(expression),
        expected,
        node,
      ),
    };
  });
}

function checkEndpoint(context: CheckContext, endpoint: Endpoint): Check[] {
  const resolved = resolveEndpoint(context, endpoint);
  if ("unverified" in resolved) {
    return [
      { kind: "endpoint", status: "unverified", message: resolved.unverified },
    ];
  }
  return [
    ...checkResponse(context, resolved),
    ...checkRequest(context, resolved),
  ];
}

function checkId(endpointId: string, { kind, part }: Check): string {
  return `${endpointId}:${part ? `${kind}.${part}` : kind}`;
}

export function checkContracts(
  program: ts.Program,
  endpointFiles: string[],
  generatedFile: string,
  root: string,
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
    operations: operations(checker, generated),
  };
  // Check each endpoint as it is discovered, so types are created in source order.
  // TypeScript prints union members in type-creation order, which shows up in mismatch messages.
  const results = Array.from(
    discoverEndpoints(program, checker, endpointFiles, root),
    (endpoint) =>
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
        }),
      ),
  ).flat();
  if (!results.length) {
    throw new Error(
      "No RTK endpoints were discovered; refusing an empty contract check.",
    );
  }
  return results.sort((a, b) => a.id.localeCompare(b.id));
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
