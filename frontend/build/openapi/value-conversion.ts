import ts from "typescript";

import { type Shape, type ShapeField, unionShape } from "./shape";
import {
  TypeWalkError,
  WALK_DEPTH_BUDGET,
  WALK_STEP_BUDGET,
  type WalkOptions,
} from "./type-comparison";
import {
  elementTypes,
  properties,
  typeText,
  unionMembers,
  unwrap,
} from "./typescript-utils";

export function propertyInitializer(
  property: ts.Symbol,
  object: ts.Expression | undefined,
): ts.Expression | undefined {
  const declaration = property.valueDeclaration;
  if (!object || !declaration || declaration.parent !== object) {
    return undefined;
  }
  if (ts.isPropertyAssignment(declaration)) {
    return declaration.initializer;
  }
  return ts.isShorthandPropertyAssignment(declaration)
    ? declaration.name
    : undefined;
}

export function isPrototypeMember(property: ts.Symbol): boolean {
  if (property.name.startsWith("__@")) {
    return true;
  }
  return (
    property.declarations?.some(
      (declaration) =>
        (ts.isClassDeclaration(declaration.parent) ||
          ts.isClassExpression(declaration.parent)) &&
        (ts.isGetAccessorDeclaration(declaration) ||
          ts.isSetAccessorDeclaration(declaration) ||
          ts.isMethodDeclaration(declaration)),
    ) ?? false
  );
}

export function isLibType(type: ts.Type): boolean {
  const declarations = (type.aliasSymbol ?? type.getSymbol())?.declarations;
  return (
    declarations !== undefined &&
    declarations.length > 0 &&
    declarations.every(isLibDeclaration) &&
    declarations.some(
      (declaration) =>
        ts.isInterfaceDeclaration(declaration) ||
        ts.isClassDeclaration(declaration),
    )
  );
}

export function isAugmentedLibType(type: ts.Type): boolean {
  const declarations =
    (type.aliasSymbol ?? type.getSymbol())?.declarations ?? [];
  return (
    declarations.some(isLibDeclaration) &&
    declarations.some((declaration) => !isLibDeclaration(declaration))
  );
}

const LIB_DIRECTORY = ts.getDefaultLibFilePath({}).replace(/[^/\\]+$/, "");

export function isLibDeclaration(
  declaration: ts.Declaration | undefined,
): boolean {
  return (
    declaration?.getSourceFile().fileName.startsWith(LIB_DIRECTORY) ?? false
  );
}

function singleText(
  checker: ts.TypeChecker,
  type: ts.Type,
): string | undefined {
  if (type.isLiteral()) {
    const { value } = type;
    return typeof value === "object"
      ? `${value.negative ? "-" : ""}${value.base10Value}`
      : String(value);
  }
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return typeText(checker, type);
  }
  if (type.flags & ts.TypeFlags.Null) {
    return "null";
  }
  if (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
    return "undefined";
  }
  return undefined;
}

// A primitive's text reads back as the same value, so its type stands in for its text.
const TEXT_TYPE_FLAGS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Void |
  ts.TypeFlags.Never |
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.TypeParameter;

// A branded string such as `string & { __brand: "NanoID" }` is still a string at runtime.
function isTextLike(type: ts.Type): boolean {
  return type.isIntersection()
    ? type.types.some(isTextLike)
    : (type.flags & TEXT_TYPE_FLAGS) !== 0;
}

/** The text sent on the wire and the primitive types the backend can read it as. */
export function stringShapes(checker: ts.TypeChecker, type: ts.Type): Shape[] {
  return unionMembers(checker, type).map((part): Shape => {
    const text = singleText(checker, part);
    if (text !== undefined) {
      return { kind: "text", text };
    }
    const primitives = part.isIntersection() ? part.types : [part];
    if (
      primitives.some(
        (member) => member.flags & (ts.TypeFlags.Number | ts.TypeFlags.BigInt),
      )
    ) {
      return { kind: "numeric-text", from: part };
    }
    return isTextLike(part)
      ? { kind: "type", type: part }
      : {
          kind: "unverified",
          from: part,
          reason: "its text is known only at runtime",
        };
  });
}

function jsonUnion(shapes: Shape[]): Shape {
  // A union can reach null through multiple conversions (e.g. undefined and NaN in an array).
  let hasNull = false;
  return unionShape(
    shapes
      .flatMap((shape) => (shape.kind === "union" ? shape.members : [shape]))
      .filter((shape) => {
        if (
          !(
            shape.kind === "null" ||
            (shape.kind === "type" && shape.type.flags & ts.TypeFlags.Null)
          )
        ) {
          return true;
        }
        if (hasNull) {
          return false;
        }
        hasNull = true;
        return true;
      }),
  );
}

function omittedByJson(type: ts.Type): boolean {
  return (
    (type.flags &
      (ts.TypeFlags.Undefined |
        ts.TypeFlags.Void |
        ts.TypeFlags.ESSymbolLike)) !==
      0 || type.getCallSignatures().length > 0
  );
}

// Object-literal properties often widen to number even when their initializer has a literal type.
function numberInitializer(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): Shape | undefined {
  expression = unwrap(expression);
  const type = checker.getTypeAtLocation(expression);
  if (type.isNumberLiteral()) {
    return Number.isFinite(type.value)
      ? { kind: "type", type }
      : { kind: "null", from: type };
  }
  if (
    ts.isPrefixUnaryExpression(expression) &&
    (expression.operator === ts.SyntaxKind.MinusToken ||
      expression.operator === ts.SyntaxKind.PlusToken)
  ) {
    const operand = numberInitializer(checker, expression.operand);
    if (operand?.kind === "null") {
      return operand;
    }
  }
  const symbol = checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(expression) ? expression.name : expression,
  );
  return symbol?.valueDeclaration &&
    isLibDeclaration(symbol.valueDeclaration) &&
    ["NaN", "Infinity", "POSITIVE_INFINITY", "NEGATIVE_INFINITY"].includes(
      symbol.name,
    )
    ? { kind: "null", from: type }
    : undefined;
}

export function jsonField(
  checker: ts.TypeChecker,
  field: ShapeField,
  walk: JsonWalk,
):
  | {
      field: ShapeField;
      /**
       * The declared field type still describes its JSON shape.
       * An optional field can omit undefined and still preserve its type.
       */
      preservesType: boolean;
      /** Some declared values cause JSON.stringify to omit the field. */
      omitsValues: boolean;
      /** Values that remain need a different type or shape after JSON conversion. */
      convertsValues: boolean;
    }
  | undefined {
  if (field.shape.kind !== "type") {
    return {
      field,
      preservesType: true,
      omitsValues: false,
      convertsValues: false,
    };
  }
  const { type } = field.shape;
  const expression = field.initializer && unwrap(field.initializer);
  const parts = unionMembers(checker, type);
  const kept = parts.filter((part) => !omittedByJson(part));
  if (!kept.length) {
    return undefined;
  }
  const omitsValues = kept.length < parts.length;
  const values = omitsValues ? kept : [type];
  const views = values.map((value) =>
    jsonView(checker, value, walk, expression),
  );
  const convertsValues = views.some(
    (view, index) => view.kind !== "type" || view.type !== values[index],
  );
  const preservesType =
    !convertsValues &&
    (!omitsValues ||
      (field.optional &&
        parts.every(
          (part) =>
            !omittedByJson(part) ||
            (part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0,
        )));
  return {
    field: {
      ...field,
      shape: jsonUnion(views),
      optional: field.optional || omitsValues,
    },
    preservesType,
    omitsValues,
    convertsValues,
  };
}

export function createJsonWalk(options: WalkOptions) {
  return {
    stepLimit: options.walkStepBudget ?? WALK_STEP_BUDGET,
    depthLimit: options.walkDepthBudget ?? WALK_DEPTH_BUDGET,
    steps: 0,
    // Position of each active frame, and the frames on a path back to themselves.
    active: new Map<ts.Type, number>(),
    recursive: new Set<ts.Type>(),
    backEdges: 0,
    complete: new WeakMap<ts.Type, Shape>(),
  };
}

export type JsonWalk = ReturnType<typeof createJsonWalk>;

/** Model JSON.stringify. A recursive reference can stand in for itself only when its cycle preserves the type. */
export function jsonView(
  checker: ts.TypeChecker,
  type: ts.Type,
  walk: JsonWalk,
  expression?: ts.Expression,
): Shape {
  if (++walk.steps > walk.stepLimit || walk.active.size > walk.depthLimit) {
    throw new TypeWalkError(
      `JSON modelling exceeded its type walk budget at ${typeText(checker, type)}`,
    );
  }
  const cached = !expression && walk.complete.get(type);
  if (cached) {
    return cached;
  }
  const cycleStart = walk.active.get(type);
  if (cycleStart !== undefined) {
    for (const [member, depth] of walk.active) {
      if (depth >= cycleStart) {
        walk.recursive.add(member);
      }
    }
    walk.backEdges++;
    return { kind: "type", type };
  }
  walk.active.set(type, walk.active.size);
  const before = walk.backEdges;
  try {
    const view = buildShape(checker, type, walk, expression);
    if (
      walk.recursive.has(type) &&
      (view.kind !== "type" || view.type !== type)
    ) {
      return {
        kind: "unverified",
        from: type,
        reason:
          "the checker does not model JSON conversions inside a recursive type",
      };
    }
    // A provisional reference depends on the active frames at its first visit.
    if (!expression && before === walk.backEdges) {
      walk.complete.set(type, view);
    }
    return view;
  } finally {
    walk.active.delete(type);
    walk.recursive.delete(type);
  }
}

function jsonElement(
  checker: ts.TypeChecker,
  type: ts.Type,
  walk: JsonWalk,
  expression?: ts.Expression,
): Shape {
  const members = unionMembers(checker, type);
  const views = members.map(
    (part): Shape =>
      omittedByJson(part)
        ? { kind: "null", from: part }
        : jsonView(checker, part, walk, expression),
  );
  return views.every(
    (view, i) => view.kind === "type" && view.type === members[i],
  )
    ? { kind: "type", type }
    : jsonUnion(views);
}

function buildShape(
  checker: ts.TypeChecker,
  type: ts.Type,
  walk: JsonWalk,
  expression?: ts.Expression,
): Shape {
  if (
    expression &&
    ts.isArrayLiteralExpression(expression) &&
    expression.elements.every(
      (element) =>
        !ts.isSpreadElement(element) && !ts.isOmittedExpression(element),
    )
  ) {
    const elements = expression.elements.map((element) =>
      jsonElement(
        checker,
        checker.getTypeAtLocation(element),
        walk,
        unwrap(element),
      ),
    );
    return {
      kind: "tuple",
      from: type,
      elements,
      exactLength: elements.length,
    };
  }
  const members = unionMembers(checker, type);
  if (members.length > 1) {
    const nullable = members.some((member) => member.flags & ts.TypeFlags.Null);
    const views = members.map(
      (member): Shape =>
        nullable && member.flags & ts.TypeFlags.Number
          ? { kind: "type", type: member }
          : jsonView(checker, member, walk),
    );
    return views.every(
      (view, index) => view.kind === "type" && view.type === members[index],
    )
      ? { kind: "type", type }
      : jsonUnion(views);
  }
  if (type.isNumberLiteral() && !Number.isFinite(type.value)) {
    return { kind: "null", from: type };
  }
  if (type.flags & ts.TypeFlags.Number) {
    const known = expression && numberInitializer(checker, expression);
    if (known) {
      return known;
    }
    // JSON.stringify converts NaN and either infinity to null.
    return jsonUnion([
      { kind: "type", type },
      { kind: "null", from: type },
    ]);
  }
  if (type.flags & ts.TypeFlags.BigIntLike) {
    return {
      kind: "throws",
      from: type,
      reason: "JSON.stringify throws a TypeError for a bigint",
    };
  }
  if (!(type.flags & ts.TypeFlags.Object) && !type.isIntersection()) {
    return { kind: "type", type };
  }
  if (type.isIntersection()) {
    const primitive = type.types.find(
      (member) =>
        member.flags &
        (ts.TypeFlags.StringLike |
          ts.TypeFlags.NumberLike |
          ts.TypeFlags.BooleanLike |
          ts.TypeFlags.BigIntLike),
    );
    if (primitive) {
      return jsonView(checker, primitive, walk);
    }
  }
  const toJson = checker.getPropertyOfType(type, "toJSON");
  if (toJson) {
    const signatures = checker.getTypeOfSymbol(toJson).getCallSignatures();
    const [signature] = signatures;
    if (
      !signature ||
      signatures.length !== 1 ||
      !toJson.declarations?.every(isLibDeclaration)
    ) {
      return {
        kind: "unverified",
        from: type,
        reason: "the checker does not model a custom toJSON method",
      };
    }
    const result = jsonView(
      checker,
      checker.getReturnTypeOfSignature(signature),
      walk,
    );
    // Date.prototype.toJSON returns null for an invalid date, despite its lib.d.ts signature.
    return toJson.declarations.some(
      (declaration) =>
        ts.isInterfaceDeclaration(declaration.parent) &&
        declaration.parent.name.text === "Date",
    )
      ? jsonUnion([result, { kind: "null", from: type }])
      : result;
  }
  if (omittedByJson(type)) {
    return { kind: "type", type };
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const types = elementTypes(checker, type);
    const elements = types.map((element) =>
      jsonElement(checker, element, walk),
    );
    if (
      elements.every(
        (view, i) => view.kind === "type" && view.type === types[i],
      )
    ) {
      return { kind: "type", type };
    }
    return checker.isTupleType(type)
      ? { kind: "tuple", from: type, elements }
      : { kind: "array", from: type, element: jsonUnion(elements) };
  }
  return jsonObjectShape(checker, type, walk, expression);
}

function jsonObjectShape(
  checker: ts.TypeChecker,
  type: ts.Type,
  walk: JsonWalk,
  expression?: ts.Expression,
): Shape {
  if (isAugmentedLibType(type)) {
    return {
      kind: "unverified",
      from: type,
      reason:
        "the checker does not model own properties of an augmented library type",
    };
  }
  if (!type.isIntersection() && isLibType(type)) {
    // Native collections keep entries in internal slots. Other library objects can have enumerable own keys.
    const name = type.getSymbol()?.name;
    if (name && ["Map", "Set", "WeakMap", "WeakSet", "RegExp"].includes(name)) {
      return { kind: "empty", from: type };
    }
    return {
      kind: "unverified",
      from: type,
      reason:
        "the checker does not model the enumerable JSON properties of this library type",
    };
  }
  const indexes = checker.getIndexInfosOfType(type);
  if (
    indexes.some((index) => {
      const view = jsonView(checker, index.type, walk);
      return view.kind !== "type" || view.type !== index.type;
    })
  ) {
    return {
      kind: "unverified",
      from: type,
      reason:
        "the checker does not model JSON conversions in an object with index signatures",
    };
  }
  const declared = properties(type);
  const fields = declared.flatMap((property) => {
    if (isPrototypeMember(property)) {
      return [];
    }
    return (
      jsonField(
        checker,
        {
          name: property.name,
          shape: { kind: "type", type: checker.getTypeOfSymbol(property) },
          optional: (property.flags & ts.SymbolFlags.Optional) !== 0,
          declaration: property.declarations?.[0],
          initializer: propertyInitializer(property, expression),
        },
        walk,
      ) ?? []
    );
  });
  const unchanged =
    fields.length === declared.length &&
    fields.every((entry) => entry.preservesType);
  if (!unchanged && indexes.length) {
    return {
      kind: "unverified",
      from: type,
      reason:
        "the checker does not model JSON conversions in an object with index signatures",
    };
  }
  return unchanged
    ? { kind: "type", type }
    : {
        kind: "object",
        from: type,
        fields: fields.map((entry) => entry.field),
        indexes: [],
      };
}
