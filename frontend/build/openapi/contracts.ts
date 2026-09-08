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
): string {
  const messages: string[] = [];
  const visit = (from: ts.Type, to: ts.Type, path: string, depth: number) => {
    if (messages.length >= 5 || checker.isTypeAssignableTo(from, to)) {
      return;
    }
    const before = messages.length;
    if (depth < 8) {
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
            if (messages.length >= 5) {
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
      "No operations found in generated declarations. Run bun run openapi:types.",
    );
  }
  return result;
}

function responseFieldProblem(
  checker: ts.TypeChecker,
  backend: ts.Type,
  frontend: ts.Type,
  at: ts.Node,
): { status: "mismatch" | "unverified"; message: string } | undefined {
  const seen = new Map<ts.Type, ts.Type[][]>();
  const variants = (type: ts.Type): ts.Type[] =>
    type.isUnion() ? type.types.flatMap(variants) : [type];
  const visit = (
    backendTypes: ts.Type[],
    frontend: ts.Type,
    path: string,
    depth: number,
  ): ReturnType<typeof responseFieldProblem> => {
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
      if (depth >= 64 || !candidates.length) {
        return {
          status: "unverified",
          message: `${path}: cannot establish frontend field coverage ${depth >= 64 ? "beyond 64 levels" : "for this union variant"}.`,
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
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    // TypeScript's array and tuple checks don't narrow the type to TypeReference.
    const reference = type as ts.TypeReference;
    for (const element of checker.getTypeArguments(reference)) {
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

export function checkContracts(
  program: ts.Program,
  endpointFiles: string[],
  generatedFile: string,
  root: string,
): ContractResult[] {
  const options = program.getCompilerOptions();
  if (!(options.strictNullChecks ?? options.strict)) {
    throw new Error("API contract checking requires strictNullChecks.");
  }
  const syntaxErrors = [generatedFile, ...endpointFiles].flatMap((file) => {
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
        ["query", "mutation"].includes(node.expression.name.text) &&
        (checker.getTypeAtLocation(node.expression.expression).aliasSymbol
          ?.name === "EndpointBuilder" ||
          (ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "builder"))
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
        const response = part.startsWith("response");
        const gap =
          looseType(checker, from, node, response ? "backend$" : "frontend$") ??
          looseType(checker, to, node, response ? "frontend$" : "backend$");
        if (gap) {
          add(part, "unverified", gap);
        } else if (checker.isTypeAssignableTo(from, to)) {
          const problem =
            response && responseFieldProblem(checker, from, to, node);
          if (problem) {
            add(part, problem.status, problem.message);
          } else {
            add(part, "pass", "Compatible");
          }
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
      if (
        config.properties.some(
          (property) =>
            ts.isSpreadAssignment(property) ||
            (property.name && ts.isComputedPropertyName(property.name)),
        )
      ) {
        add(
          "endpoint",
          "unverified",
          "Endpoint configuration contains a spread or computed property.",
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
        (request &&
          request.properties.some(
            (property) =>
              (!ts.isPropertyAssignment(property) &&
                !ts.isShorthandPropertyAssignment(property)) ||
              (property.name && ts.isComputedPropertyName(property.name)),
          )) ||
        (methodNode && !ts.isStringLiteral(methodNode))
      ) {
        add(
          "endpoint",
          "unverified",
          "Cannot statically identify one HTTP request (queryFn, dynamic URL/method, conditional returns, computed properties, accessors, or spread).",
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
