import ts from "typescript";

import {
  isTypeReference,
  properties,
  typeText,
  unionMembers,
} from "./typescript-utils";

/** A property the runtime value does not own, so a spread copy and `JSON.stringify` both leave it out. */
export function isPrototypeMember(
  checker: ts.TypeChecker,
  property: ts.Symbol,
): boolean {
  if (property.name.startsWith("__@")) {
    return true;
  }
  const declaration = property.declarations?.[0];
  if (
    declaration &&
    (ts.isGetAccessorDeclaration(declaration) ||
      ts.isSetAccessorDeclaration(declaration) ||
      ts.isMethodDeclaration(declaration) ||
      ts.isMethodSignature(declaration))
  ) {
    return true;
  }
  return checker.getTypeOfSymbol(property).getCallSignatures().length > 0;
}

/** Whether the type is declared by the TypeScript lib, whose objects keep their data behind prototype accessors. */
export function isLibType(type: ts.Type): boolean {
  const declaration = (type.aliasSymbol ?? type.getSymbol())?.declarations?.[0];
  return (
    isLibDeclaration(declaration) &&
    declaration !== undefined &&
    (ts.isInterfaceDeclaration(declaration) ||
      ts.isClassDeclaration(declaration))
  );
}

/** The JavaScript operation that turns a value into text on its way to the URL. */
export type StringConversion =
  | "String"
  | "the template literal"
  | "encodeURIComponent";

/** What one part of a value's type becomes after a string conversion. */
export type StringPart =
  | { kind: "text"; text: string; from: ts.Type }
  /** The text is not known from the type. `unmodelled` says why the type cannot stand in for it. */
  | { kind: "type"; type: ts.Type; unmodelled?: string };

const LIB_DIRECTORY = ts.getDefaultLibFilePath({}).replace(/[^/\\]+$/, "");

export function isLibDeclaration(
  declaration: ts.Declaration | undefined,
): boolean {
  return (
    declaration?.getSourceFile().fileName.startsWith(LIB_DIRECTORY) ?? false
  );
}

function isSymbolType(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.ESSymbolLike) !== 0;
}

/** The one text a single, non-union type always converts to, if there is one. */
function singleText(
  checker: ts.TypeChecker,
  type: ts.Type,
): string | undefined {
  if (type.isStringLiteral()) {
    return type.value;
  }
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
export function stringParts(
  checker: ts.TypeChecker,
  type: ts.Type,
): StringPart[] {
  return unionMembers(checker, type).map((part): StringPart => {
    if (part.isStringLiteral()) {
      return { kind: "type", type: part };
    }
    const text = singleText(checker, part);
    if (text !== undefined) {
      return { kind: "text", text, from: part };
    }
    return isTextLike(part)
      ? { kind: "type", type: part }
      : {
          kind: "type",
          type: part,
          unmodelled: "its text is known only at runtime",
        };
  });
}

/** Whether every part of `type` keeps its type after a string conversion, so nothing about it changes. */
export function keepsType(parts: StringPart[]): boolean {
  return parts.every((part) => part.kind === "type" && !part.unmodelled);
}

/** What `JSON.stringify` writes for a value (client.ts:250). */
export type JsonView =
  | { kind: "type"; type: ts.Type }
  | { kind: "null"; from: ts.Type; reason: string }
  | { kind: "empty"; from: ts.Type; reason: string }
  | { kind: "object"; from: ts.Type; fields: JsonField[] }
  | { kind: "array"; from: ts.Type; element: JsonView }
  | { kind: "union"; from: ts.Type; members: JsonView[] }
  | { kind: "throws"; from: ts.Type; reason: string };

export interface JsonField {
  name: string;
  view: JsonView;
  optional: boolean;
  declaration: ts.Declaration | undefined;
}

function dropReason(
  checker: ts.TypeChecker,
  type: ts.Type,
): string | undefined {
  if (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
    return "undefined";
  }
  if (isSymbolType(type)) {
    return "a symbol";
  }
  return type.getCallSignatures().length > 0 ? "a function" : undefined;
}

function toJsonReturn(
  checker: ts.TypeChecker,
  type: ts.Type,
): ts.Type | undefined {
  const toJson = checker.getPropertyOfType(type, "toJSON");
  const signatures = toJson
    ? checker.getTypeOfSymbol(toJson).getCallSignatures()
    : [];
  const [only, ...more] = signatures;
  return only && !more.length
    ? checker.getReturnTypeOfSignature(only)
    : undefined;
}

const jsonViews = new WeakMap<ts.Type, JsonView>();
const building = new Set<ts.Type>();
let recursions = 0;

/**
 * How one value's type is serialised, following `JSON.stringify`'s rules.
 * Where a type recurs inside itself, the declared type stands in from that point.
 */
export function jsonView(checker: ts.TypeChecker, type: ts.Type): JsonView {
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
  let view: JsonView;
  try {
    view = buildJsonView(checker, type);
  } finally {
    building.delete(type);
  }
  // A view that met a type still being built depends on where the walk started, so only a complete one is kept.
  if (recursions === before) {
    jsonViews.set(type, view);
  }
  return view;
}

function buildJsonView(checker: ts.TypeChecker, type: ts.Type): JsonView {
  const members = unionMembers(checker, type);
  if (members.length > 1) {
    const views = members.map((member) => jsonView(checker, member));
    return views.every((view) => view.kind === "type")
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
  const returned = toJsonReturn(checker, type);
  if (returned) {
    return jsonView(checker, returned);
  }
  if (type.getCallSignatures().length > 0 || isSymbolType(type)) {
    return { kind: "type", type };
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const elements = checker.isTupleType(type)
      ? isTypeReference(type)
        ? checker.getTypeArguments(type)
        : []
      : [checker.getIndexTypeOfType(type, ts.IndexKind.Number)].filter(
          (element) => element !== undefined,
        );
    const parts = elements.flatMap((element) => unionMembers(checker, element));
    const views = parts.map((part): JsonView => {
      const dropped = dropReason(checker, part);
      return dropped
        ? { kind: "null", from: part, reason: `${dropped} in an array` }
        : jsonView(checker, part);
    });
    const [only, ...more] = views;
    const element: JsonView = only
      ? more.length
        ? { kind: "union", from: type, members: views }
        : only
      : { kind: "type", type: checker.getNeverType() };
    return element.kind === "type" && !more.length
      ? { kind: "type", type }
      : { kind: "array", from: type, element };
  }
  if (!type.isIntersection() && isLibType(type)) {
    return {
      kind: "empty",
      from: type,
      reason: `a ${typeText(checker, type)} has no own properties to serialise`,
    };
  }
  const declared = properties(type);
  const fields = declared.flatMap(
    (property): { field: JsonField; unchanged: boolean }[] => {
      if (isPrototypeMember(checker, property)) {
        return [];
      }
      const parts = unionMembers(checker, checker.getTypeOfSymbol(property));
      const kept = parts.filter((part) => !dropReason(checker, part));
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
            view:
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
            only !== undefined &&
            !more.length &&
            only.kind === "type" &&
            only.type === kept[0] &&
            (kept.length === parts.length || declaredOptional),
        },
      ];
    },
  );
  const unchanged =
    fields.length === declared.length &&
    fields.every((entry) => entry.unchanged);
  return unchanged
    ? { kind: "type", type }
    : {
        kind: "object",
        from: type,
        fields: fields.map((entry) => entry.field),
      };
}

/** One position where `JSON.stringify` changes the value. */
export interface JsonConversion {
  kind: "left out" | "null" | "empty object" | "toJSON";
  path: string;
  detail: string;
}

/** Every position where `JSON.stringify` changes the value. */
export function jsonConversions(
  checker: ts.TypeChecker,
  view: JsonView,
  path: string,
  from?: ts.Type,
): JsonConversion[] {
  switch (view.kind) {
    case "type":
      return from && from !== view.type
        ? [
            {
              kind: "toJSON",
              path,
              detail: `${typeText(checker, from)} is written as ${typeText(checker, view.type)} by its toJSON`,
            },
          ]
        : [];
    case "throws":
      return [];
    case "null":
      return [
        {
          kind: "null",
          path,
          detail: `${typeText(checker, view.from)} is written as null, because JSON.stringify writes ${view.reason} as null`,
        },
      ];
    case "empty":
      return [
        {
          kind: "empty object",
          path,
          detail: `${typeText(checker, view.from)} is written as {}, because ${view.reason}`,
        },
      ];
    case "array":
      return jsonConversions(checker, view.element, `${path}[]`);
    case "union":
      return view.members.flatMap((member) =>
        jsonConversions(checker, member, path),
      );
    case "object":
      return [
        ...properties(view.from)
          .filter(
            (property) =>
              !view.fields.some((field) => field.name === property.name),
          )
          .map(
            (property): JsonConversion => ({
              kind: "left out",
              path: `${path}.${property.name}`,
              detail: `${typeText(checker, checker.getTypeOfSymbol(property))} is left out`,
            }),
          ),
        ...view.fields.flatMap((field) =>
          jsonConversions(checker, field.view, `${path}.${field.name}`),
        ),
      ];
  }
}

/** One note per kind of conversion, naming a few of the positions. */
export function jsonConversionNotes(
  conversions: JsonConversion[],
  examples = 3,
): string[] {
  const kinds = [...new Set(conversions.map(({ kind }) => kind))];
  return kinds.map((kind) => {
    const found = conversions.filter((conversion) => conversion.kind === kind);
    const [first] = found;
    const shown = found.slice(0, examples).map(({ path }) => path);
    const rest = found.length - shown.length;
    return `JSON.stringify writes ${found.length} ${found.length === 1 ? "value" : "values"} differently at ${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}: ${first?.detail ?? ""} (client.ts:250)`;
  });
}

const jsonViewTexts = new WeakMap<JsonView, string>();

export function describeJsonView(
  checker: ts.TypeChecker,
  view: JsonView,
): string {
  const cached = jsonViewTexts.get(view);
  if (cached !== undefined) {
    return cached;
  }
  const text = jsonViewText(checker, view);
  jsonViewTexts.set(view, text);
  return text;
}

function jsonViewText(checker: ts.TypeChecker, view: JsonView): string {
  switch (view.kind) {
    case "type":
      return typeText(checker, view.type);
    case "null":
      return "null";
    case "empty":
      return "{}";
    case "array": {
      const element = describeJsonView(checker, view.element);
      return view.element.kind === "union" ? `(${element})[]` : `${element}[]`;
    }
    case "union":
      return view.members
        .map((member) => describeJsonView(checker, member))
        .join(" | ");
    case "object":
      return `{ ${view.fields.map((field) => `${field.name}${field.optional ? "?" : ""}: ${describeJsonView(checker, field.view)};`).join(" ")} }`;
    case "throws":
      return typeText(checker, view.from);
  }
}
