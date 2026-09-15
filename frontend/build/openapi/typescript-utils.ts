import ts from "typescript";

export function propertyName(node: ts.Node): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node)
    ? node.text
    : undefined;
}

export function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

export function member(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((p) => p.name && propertyName(p.name) === name);
}

export function hasComputedName(
  property: ts.ObjectLiteralElementLike,
): boolean {
  return (
    property.name !== undefined && ts.isComputedPropertyName(property.name)
  );
}

const TYPE_TEXT_FLAGS =
  ts.NodeBuilderFlags.NoTruncation |
  ts.NodeBuilderFlags.IgnoreErrors |
  ts.NodeBuilderFlags.AllowUniqueESSymbolType |
  ts.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope;

const printer = ts.createPrinter({ removeComments: true });
const printTarget = ts.createSourceFile("type.ts", "", ts.ScriptTarget.Latest);
const typeTexts = new WeakMap<ts.Type, string>();

function printTypeNode(node: ts.TypeNode): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, printTarget);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// `null` and `undefined` go last, as TypeScript writes them.
function compareUnionTexts(left: string, right: string): number {
  const rank = (text: string) =>
    text === "undefined" ? 2 : text === "null" ? 1 : 0;
  return rank(left) - rank(right) || compareStrings(left, right);
}

function memberName(member: ts.TypeElement): string | undefined {
  if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) {
    return undefined;
  }
  const { name } = member;
  return ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}

function sortedMembers(members: readonly ts.TypeElement[]): ts.TypeElement[] {
  const named = members
    .filter((member) => memberName(member) !== undefined)
    .sort((left, right) =>
      compareStrings(memberName(left) ?? "", memberName(right) ?? ""),
    );
  return members.map((member) =>
    memberName(member) === undefined ? member : (named.shift() ?? member),
  );
}

function sortTypeNode(node: ts.TypeNode): ts.TypeNode {
  const result = ts.transform(node, [
    (context) => (root) => {
      const { factory } = context;
      const visit = (child: ts.Node): ts.Node => {
        const visited = ts.visitEachChild(child, visit, context);
        if (ts.isUnionTypeNode(visited)) {
          const types = [...visited.types].sort((left, right) =>
            compareUnionTexts(printTypeNode(left), printTypeNode(right)),
          );
          return factory.updateUnionTypeNode(
            visited,
            factory.createNodeArray(types),
          );
        }
        if (ts.isTypeLiteralNode(visited)) {
          return factory.updateTypeLiteralNode(
            visited,
            factory.createNodeArray(sortedMembers(visited.members)),
          );
        }
        return visited;
      };
      return ts.visitNode(root, visit, ts.isTypeNode) ?? root;
    },
  ]);
  const [sorted] = result.transformed;
  result.dispose();
  return sorted ?? node;
}

/**
 * `checker.typeToString` without truncation, with union members and object properties sorted.
 * TypeScript orders both by when their types were created,
 * which depends on the order the checker visited them.
 */
export function typeText(checker: ts.TypeChecker, type: ts.Type): string {
  const cached = typeTexts.get(type);
  if (cached !== undefined) {
    return cached;
  }
  const node = checker.typeToTypeNode(type, undefined, TYPE_TEXT_FLAGS);
  const text = node
    ? printTypeNode(sortTypeNode(node))
    : checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
  typeTexts.set(type, text);
  return text;
}

function compareDeclarations(
  left: ts.Declaration | undefined,
  right: ts.Declaration | undefined,
): number {
  if (!left || !right) {
    return Number(!left) - Number(!right);
  }
  return (
    compareStrings(
      left.getSourceFile().fileName,
      right.getSourceFile().fileName,
    ) || left.pos - right.pos
  );
}

/** A union's members sorted by `typeText`, or the type itself. */
export function unionMembers(
  checker: ts.TypeChecker,
  type: ts.Type,
): readonly ts.Type[] {
  if (!type.isUnion()) {
    return [type];
  }
  const declaration = (member: ts.Type) =>
    (member.aliasSymbol ?? member.getSymbol())?.declarations?.[0];
  return [...type.types].sort(
    (left, right) =>
      compareUnionTexts(typeText(checker, left), typeText(checker, right)) ||
      compareDeclarations(declaration(left), declaration(right)),
  );
}

/**
 * A type's properties in declaration order, then by name for properties without a declaration.
 * `getProperties` lists a mapped type's properties in the order their key types were created.
 */
export function properties(type: ts.Type): ts.Symbol[] {
  return [...type.getProperties()].sort(
    (left, right) =>
      compareDeclarations(left.declarations?.[0], right.declarations?.[0]) ||
      compareStrings(left.name, right.name),
  );
}

export function isObjectLike(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.Object) !== 0 || type.isIntersection();
}

export function isTypeReference(type: ts.Type): type is ts.TypeReference {
  return (
    "objectFlags" in type &&
    typeof type.objectFlags === "number" &&
    (type.objectFlags & ts.ObjectFlags.Reference) !== 0
  );
}

export function propertyType(
  checker: ts.TypeChecker,
  type: ts.Type,
  name: string,
  at: ts.Node,
): ts.Type | undefined {
  const symbol = type.getProperty(name);
  return symbol && checker.getTypeOfSymbolAtLocation(symbol, at);
}

export function symbolDeclaration(
  symbol: ts.Symbol | undefined,
): ts.Declaration | undefined {
  if (symbol?.valueDeclaration) {
    return symbol.valueDeclaration;
  }
  return symbol?.declarations?.length === 1
    ? symbol.declarations[0]
    : undefined;
}
