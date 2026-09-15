import ts from "typescript";

import type { Shape, ShapeField } from "./shape";
import {
  elementTypes,
  properties,
  typeText,
  unionMembers,
} from "./typescript-utils";

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

/**
 * What each part of `type` becomes after a string conversion.
 * String literals, `string`, `number` and `bigint` keep their type, because the backend reads back the same text.
 */
export function stringShapes(checker: ts.TypeChecker, type: ts.Type): Shape[] {
  return unionMembers(checker, type).map((part): Shape => {
    if (part.isStringLiteral()) {
      return { kind: "type", type: part };
    }
    const text = singleText(checker, part);
    if (text !== undefined) {
      return { kind: "text", text };
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

export function jsonOmissionReason(type: ts.Type): string | undefined {
  if (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
    return "undefined";
  }
  if (type.flags & ts.TypeFlags.ESSymbolLike) {
    return "a symbol";
  }
  return type.getCallSignatures().length > 0 ? "a function" : undefined;
}

const jsonViews = new WeakMap<ts.Type, Shape>();
const building = new Set<ts.Type>();
let recursions = 0;
let buildSteps = 0;

/**
 * How one value's type is serialised, following `JSON.stringify`'s rules.
 * Recursive types stand in for themselves only when their fields survive JSON unchanged.
 */
export function jsonView(checker: ts.TypeChecker, type: ts.Type): Shape {
  if (!building.size) {
    buildSteps = 0;
  }
  buildSteps += 1;
  if (buildSteps > 20_000_000 || building.size > 1_000) {
    return {
      kind: "unverified",
      from: type,
      reason: "JSON modelling exceeded its type walk budget",
    };
  }
  const cached = jsonViews.get(type);
  if (cached) {
    return cached;
  }
  if (building.has(type)) {
    recursions += 1;
    return { kind: "type", type };
  }
  building.add(type);
  const before = recursions;
  let view: Shape;
  try {
    view = buildShape(checker, type);
  } finally {
    building.delete(type);
  }
  // A view that met a type still being built depends on where the walk started, so only a complete one is kept.
  if (recursions === before) {
    jsonViews.set(type, view);
  }
  return recursions !== before && (view.kind !== "type" || view.type !== type)
    ? {
        kind: "unverified",
        from: type,
        reason:
          "the checker does not model JSON conversions inside a recursive type",
      }
    : view;
}

function buildShape(checker: ts.TypeChecker, type: ts.Type): Shape {
  const members = unionMembers(checker, type);
  if (members.length > 1) {
    const views = members.map((member) => jsonView(checker, member));
    return views.every(
      (view, index) => view.kind === "type" && view.type === members[index],
    )
      ? { kind: "type", type }
      : { kind: "union", from: type, members: views };
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
      return jsonView(checker, primitive);
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
    return jsonView(checker, checker.getReturnTypeOfSignature(signature));
  }
  if (jsonOmissionReason(type)) {
    return { kind: "type", type };
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const parts = elementTypes(checker, type).flatMap((element) =>
      unionMembers(checker, element),
    );
    const views = parts.map((part): Shape => {
      const dropped = jsonOmissionReason(part);
      return dropped
        ? { kind: "null", from: part, reason: `${dropped} in an array` }
        : jsonView(checker, part);
    });
    const [only, ...more] = views;
    const element: Shape = only
      ? more.length
        ? { kind: "union", from: type, members: views }
        : only
      : { kind: "type", type: checker.getNeverType() };
    return views.every(
      (view, index) => view.kind === "type" && view.type === parts[index],
    )
      ? { kind: "type", type }
      : { kind: "array", from: type, element };
  }
  if (isAugmentedLibType(type)) {
    return {
      kind: "unverified",
      from: type,
      reason:
        "the checker does not model own properties of an augmented library type",
    };
  }
  if (!type.isIntersection() && isLibType(type)) {
    return {
      kind: "empty",
      from: type,
      reason: `a ${typeText(checker, type)} has no own properties to serialise`,
    };
  }
  const indexes = checker.getIndexInfosOfType(type);
  if (
    indexes.some((index) => {
      const view = jsonView(checker, index.type);
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
  const fields = declared.flatMap(
    (property): { field: ShapeField; unchanged: boolean }[] => {
      if (isPrototypeMember(property)) {
        return [];
      }
      const parts = unionMembers(checker, checker.getTypeOfSymbol(property));
      const kept = parts.filter((part) => !jsonOmissionReason(part));
      if (!kept.length) {
        return [];
      }
      const views = kept.map((part) => jsonView(checker, part));
      const [only, ...more] = views;
      const declaredOptional = (property.flags & ts.SymbolFlags.Optional) !== 0;
      return [
        {
          field: {
            name: property.name,
            shape:
              only && !more.length
                ? only
                : {
                    kind: "union",
                    from: checker.getTypeOfSymbol(property),
                    members: views,
                  },
            optional: declaredOptional || kept.length < parts.length,
            declaration: property.declarations?.[0],
          },
          // A value that dropped undefined stays as declared only when the property was optional already.
          unchanged:
            views.every(
              (view, index) =>
                view.kind === "type" && view.type === kept[index],
            ) &&
            (kept.length === parts.length ||
              (declaredOptional &&
                parts.every(
                  (part) =>
                    kept.includes(part) ||
                    (part.flags &
                      (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !==
                      0,
                ))),
        },
      ];
    },
  );
  const unchanged =
    fields.length === declared.length &&
    fields.every((entry) => entry.unchanged);
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
