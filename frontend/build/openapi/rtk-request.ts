import ts from "typescript";

import { hasComputedName, member, unwrap } from "./typescript-utils";

export type UrlSlot =
  | { kind: "text"; text: string }
  | { kind: "span"; expression: ts.Expression }
  | { kind: "tag"; name: string };

export type TagSlot = Extract<UrlSlot, { kind: "tag" }>;

interface RequestUrl {
  path: string;
  pathSlots: UrlSlot[];
  tags: TagSlot[];
}

export interface RtkRequest {
  method: string;
  url: RequestUrl;
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

function textSlots(text: string): UrlSlot[] {
  const slots: UrlSlot[] = [];
  let last = 0;
  for (const match of text.matchAll(/:\w+/g)) {
    slots.push({ kind: "text", text: text.slice(last, match.index) });
    slots.push({ kind: "tag", name: match[0].slice(1) });
    last = match.index + match[0].length;
  }
  slots.push({ kind: "text", text: text.slice(last) });
  return slots;
}

function urlTemplate(url: ts.Expression): RequestUrl | undefined {
  if (
    !ts.isStringLiteral(url) &&
    !ts.isNoSubstitutionTemplateLiteral(url) &&
    !ts.isTemplateExpression(url)
  ) {
    return undefined;
  }
  const slots = ts.isTemplateExpression(url)
    ? [
        ...textSlots(url.head.text),
        ...url.templateSpans.flatMap((span): UrlSlot[] => [
          { kind: "span", expression: unwrap(span.expression) },
          ...textSlots(span.literal.text),
        ]),
      ]
    : textSlots(url.text);
  if (slots.some((slot) => slot.kind === "text" && /[?#]/.test(slot.text))) {
    return undefined;
  }
  return {
    path: slots
      .map((slot) => (slot.kind === "text" ? slot.text : "{param}"))
      .join(""),
    pathSlots: slots,
    tags: slots.filter((slot): slot is TagSlot => slot.kind === "tag"),
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
    method: method?.text ?? "GET",
    url,
    params: object && expressionMember(object, "params"),
    body: object && expressionMember(object, "body"),
    extraOptions: expressionMember(config, "extraOptions"),
  };
}
