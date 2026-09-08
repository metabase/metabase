import ts from "typescript";

export interface ContractResult {
  id: string;
  file: string;
  line: number;
  status: "pass" | "mismatch" | "unverified" | "ignored";
  message: string;
}

interface Operation {
  path: string;
  data: ts.Type;
  responses: ts.Type | undefined;
}

function propertyName(node: ts.Node): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node)
    ? node.text
    : undefined;
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

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replace(/\{[^}]+\}|:[\w-]+/g, "{}")}`;
}

function mismatchDetail(
  checker: ts.TypeChecker,
  from: ts.Type,
  to: ts.Type,
  at: ts.Node,
  path = "$",
  depth = 0,
): string {
  const summary = `${path}: ${checker.typeToString(from)} is not assignable to ${checker.typeToString(to)}`;
  if (depth >= 6) {
    return summary;
  }
  if (from.isUnion()) {
    const incompatible = from.types.find(
      (type) => !checker.isTypeAssignableTo(type, to),
    );
    return incompatible
      ? mismatchDetail(checker, incompatible, to, at, path, depth + 1)
      : summary;
  }
  const fromElement =
    checker.isArrayType(from) &&
    checker.getIndexTypeOfType(from, ts.IndexKind.Number);
  const toElement =
    checker.isArrayType(to) &&
    checker.getIndexTypeOfType(to, ts.IndexKind.Number);
  if (fromElement && toElement) {
    return mismatchDetail(
      checker,
      fromElement,
      toElement,
      at,
      `${path}[]`,
      depth + 1,
    );
  }
  if (from.flags & ts.TypeFlags.Object && to.flags & ts.TypeFlags.Object) {
    for (const property of to.getProperties()) {
      const actual =
        propertyType(checker, from, property.name, at) ??
        checker.getUndefinedType();
      const expected = checker.getTypeOfSymbolAtLocation(property, at);
      if (!checker.isTypeAssignableTo(actual, expected)) {
        return mismatchDetail(
          checker,
          actual,
          expected,
          at,
          `${path}.${property.name}`,
          depth + 1,
        );
      }
    }
  }
  return summary;
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
      "No operations found in generated declarations. Run bun run openapi:types.",
    );
  }
  return result;
}

/** An unresolved or unconstrained contract is a coverage gap, not a successful check. */
function looseType(
  checker: ts.TypeChecker,
  type: ts.Type,
  at: ts.Node,
  seen = new Set<ts.Type>(),
): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);
  if (
    type.flags &
    (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)
  ) {
    return true;
  }
  if (type.isUnionOrIntersection()) {
    return type.types.some((t) => looseType(checker, t, at, seen));
  }
  if (!(type.flags & ts.TypeFlags.Object)) {
    return false;
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    // isArrayType/isTupleType identify TypeReferences; TS doesn't expose them as type predicates.
    const reference = type as ts.TypeReference;
    return checker
      .getTypeArguments(reference)
      .some((t) => looseType(checker, t, at, seen));
  }
  return (
    checker
      .getIndexInfosOfType(type)
      .some((i) => looseType(checker, i.type, at, seen)) ||
    type
      .getProperties()
      .some((p) =>
        looseType(checker, checker.getTypeOfSymbolAtLocation(p, at), at, seen),
      )
  );
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
  const value = returns.length === 1 ? returns[0]?.expression : undefined;
  return value && unwrap(value);
}

function parseUrl(
  url: ts.Expression,
): { path: string; parameters: ts.Expression[] } | undefined {
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
      // URL encoding preserves the parameter's contract; compare its input, not the encoded string.
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

export function checkContracts(
  program: ts.Program,
  endpointFiles: string[],
  generatedFile: string,
  root: string,
): ContractResult[] {
  const checker = program.getTypeChecker();
  const generated = program.getSourceFile(generatedFile);
  if (!generated) {
    throw new Error(`Missing generated declarations: ${generatedFile}`);
  }
  const backend = operations(checker, generated);
  const results: ContractResult[] = [];
  for (const file of endpointFiles) {
    const source = program.getSourceFile(file);
    if (!source) {
      throw new Error(`Missing endpoint source: ${file}`);
    }
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "builder" &&
        ["query", "mutation"].includes(node.expression.name.text)
      ) {
        checkEndpoint(node, source);
      }
      ts.forEachChild(node, visit);
    };
    const checkEndpoint = (node: ts.CallExpression, source: ts.SourceFile) => {
      const file = source.fileName.replace(`${root}/`, "");
      const line =
        source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const name = ts.isPropertyAssignment(node.parent)
        ? propertyName(node.parent.name)
        : undefined;
      const endpoint = `${file}:${name ?? `anonymous-line-${line}`}`;
      const add = (
        part: string,
        status: ContractResult["status"],
        message: string,
      ) => {
        results.push({
          id: `${endpoint}:${part}`,
          file,
          line,
          status,
          message,
        });
      };
      const compare = (part: string, from: ts.Type, to: ts.Type) => {
        if (looseType(checker, from, node) || looseType(checker, to, node)) {
          add(
            part,
            "unverified",
            "Contract contains any, unknown, an unresolved type, or an unbound generic.",
          );
        } else if (checker.isTypeAssignableTo(from, to)) {
          add(part, "pass", "Compatible");
        } else {
          add(part, "mismatch", mismatchDetail(checker, from, to, node));
        }
      };
      const config = node.arguments[0] && unwrap(node.arguments[0]);
      const res = node.typeArguments?.[0];
      if (!name || !config || !ts.isObjectLiteralExpression(config) || !res) {
        add(
          "endpoint",
          "unverified",
          "Expected a named endpoint with explicit type arguments and an object definition.",
        );
        return;
      }
      if (config.properties.some(ts.isSpreadAssignment)) {
        add(
          "endpoint",
          "unverified",
          "Endpoint configuration contains a spread.",
        );
        return;
      }
      const query = member(config, "query");
      const returned =
        query &&
        returnExpression(
          ts.isPropertyAssignment(query) ? unwrap(query.initializer) : query,
        );
      const request =
        returned && ts.isObjectLiteralExpression(returned)
          ? returned
          : undefined;
      const url = request ? expressionMember(request, "url") : returned;
      const parsed = url && parseUrl(url);
      const methodNode = request && expressionMember(request, "method");
      if (
        !parsed ||
        (request && request.properties.some(ts.isSpreadAssignment)) ||
        (methodNode && !ts.isStringLiteral(methodNode))
      ) {
        add(
          "endpoint",
          "unverified",
          "Cannot statically identify one HTTP request (queryFn, dynamic URL/method, multiple returns, or spread).",
        );
        return;
      }
      const method =
        methodNode && ts.isStringLiteral(methodNode) ? methodNode.text : "GET";
      const path = parsed.path.split("?")[0] ?? parsed.path;
      const candidates = backend.get(routeKey(method, path)) ?? [];
      if (candidates.length > 1) {
        add(
          "endpoint",
          "unverified",
          `Ambiguous backend operations for ${method} ${path}`,
        );
        return;
      }
      const operation = candidates[0];
      if (!operation) {
        add(
          "endpoint",
          "unverified",
          `No generated operation for ${method} ${path}`,
        );
        return;
      }
      const frontendResponse = checker.getTypeFromTypeNode(res);
      if (member(config, "transformResponse")) {
        add(
          "response",
          "unverified",
          "transformResponse needs an explicit raw-response contract; the RTK result type is transformed.",
        );
      } else if (
        frontendResponse.flags &
        (ts.TypeFlags.Void | ts.TypeFlags.Undefined)
      ) {
        add(
          "response",
          "ignored",
          "Frontend intentionally discards the response.",
        );
      } else {
        const successes =
          operation.responses
            ?.getProperties()
            .filter((p) => /^2(?:\d\d|XX)$/.test(p.name)) ?? [];
        if (!successes.length) {
          add(
            "response",
            "unverified",
            "Backend does not declare a successful response schema.",
          );
        }
        for (const success of successes) {
          compare(
            `response.${success.name}`,
            checker.getTypeOfSymbolAtLocation(success, generated),
            frontendResponse,
          );
        }
      }
      if (parsed.path.includes("?") || /:[\w-]+/.test(path)) {
        add(
          "request",
          "unverified",
          "Inline query strings and Express-style path substitutions need explicit mapping.",
        );
        return;
      }
      for (const [part, field] of [
        ["query", "params"],
        ["body", "body"],
      ] as const) {
        const expected =
          propertyType(checker, operation.data, part, generated) ??
          checker.getUndefinedType();
        const expression = request && expressionMember(request, field);
        const actual = expression
          ? checker.getTypeAtLocation(expression)
          : checker.getUndefinedType();
        compare(`request.${part}`, actual, expected);
      }
      const pathType = propertyType(checker, operation.data, "path", generated);
      const pathNames = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
        (match) => match[1],
      );
      if (pathNames.length !== parsed.parameters.length) {
        add(
          "request.path",
          "unverified",
          "Path parameters are not represented by URL template expressions.",
        );
        return;
      }
      pathNames.forEach((name, index) => {
        const expression = parsed.parameters[index];
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
          add(
            `request.path.${index}`,
            "unverified",
            "Backend path parameter schema is missing.",
          );
        } else {
          compare(
            `request.path.${index}`,
            checker.getTypeAtLocation(expression),
            expected,
          );
        }
      });
    };
    visit(source);
  }
  if (!results.length) {
    throw new Error(
      "No RTK endpoints were discovered; refusing an empty contract check.",
    );
  }
  const ids = results.map((r) => r.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      "Duplicate endpoint/check identities; give endpoint definitions distinct names.",
    );
  }
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

export function baselineProblems(
  results: ContractResult[],
  baseline: Record<string, string>,
): string[] {
  const violations = new Map(
    results
      .filter((r) => r.status === "mismatch" || r.status === "unverified")
      .map((r) => [r.id, r]),
  );
  const problems = [...violations.values()]
    .filter((r) => baseline[r.id] !== r.status)
    .map((r) => `${r.file}:${r.line} ${r.id}\n  ${r.status}: ${r.message}`);
  for (const id of Object.keys(baseline)) {
    if (!violations.has(id)) {
      problems.push(
        `${id}: remove the obsolete baseline exemption (fixed, removed, or renamed check).`,
      );
    }
  }
  return problems;
}
