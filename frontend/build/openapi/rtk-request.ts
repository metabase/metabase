import ts from "typescript";

import { hasComputedName, member, unwrap } from "./typescript-utils";

interface UrlTemplate {
  head: string;
  spans: { expression: ts.Expression; literal: string }[];
}

export interface RtkRequest {
  method: string | undefined;
  url: UrlTemplate;
  params: ts.Expression | undefined;
  body: ts.Expression | undefined;
  extraOptions: ts.Expression | undefined;
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

function urlTemplate(url: ts.Expression): UrlTemplate | undefined {
  if (ts.isStringLiteral(url) || ts.isNoSubstitutionTemplateLiteral(url)) {
    return { head: url.text, spans: [] };
  }
  if (!ts.isTemplateExpression(url)) {
    return undefined;
  }
  return {
    head: url.head.text,
    spans: url.templateSpans.map((span) => ({
      expression: unwrap(span.expression),
      literal: span.literal.text,
    })),
  };
}

/**
 * The request an RTK `query` function returns, when it is one statically known object or URL.
 */
export function resolveRtkRequest(
  config: ts.ObjectLiteralExpression,
): RtkRequest | undefined {
  const query = member(config, "query");
  const returned =
    query &&
    returnExpression(
      ts.isPropertyAssignment(query) ? unwrap(query.initializer) : query,
    );
  const object =
    returned && ts.isObjectLiteralExpression(returned) ? returned : undefined;
  const urlExpression = object ? expressionMember(object, "url") : returned;
  const url = urlExpression && urlTemplate(urlExpression);
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
    method: method?.text,
    url,
    params: object && expressionMember(object, "params"),
    body: object && expressionMember(object, "body"),
    extraOptions: expressionMember(config, "extraOptions"),
  };
}
