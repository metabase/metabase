import ts from "typescript";

import type { RtkRequest } from "./rtk-request";
import {
  isObjectLike,
  isTypeReference,
  properties,
  symbolDeclaration,
  typeText,
  unionMembers,
  unwrap,
} from "./typescript-utils";

// `frontend/src/metabase/api/api.ts:22`
const RTK_CACHE_KEY = "__rtkCacheKey";
// `frontend/src/metabase/api/client/utils.ts:148`
const URL_TAG = /:\w+/g;
// `frontend/src/metabase/api/client/method.ts:1-8`
const CLIENT_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);
const PATH_PARAMETER = "{param}";
const REQUEST_FIELDS = ["url", "method", "params", "body"];

const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const UNDEFINED = ts.TypeFlags.Undefined | ts.TypeFlags.Void;

/** `itemOf` is the array type when the value is sent once for each of its items. */
export type SentValue =
  | { kind: "type"; type: ts.Type; itemOf?: ts.Type }
  | { kind: "text"; text: string; itemOf?: ts.Type }
  | { kind: "empty" };

interface SentField {
  name: string;
  values: SentValue[];
  optional: boolean;
  declaration: ts.Declaration | undefined;
}

interface SentIndex {
  keyType: ts.Type;
  values: SentValue[];
  declaration: ts.Declaration | undefined;
}

export type SentPayload =
  | { kind: "nothing" }
  | { kind: "type"; type: ts.Type }
  | {
      kind: "fields";
      description: string;
      fields: SentField[];
      indexes: SentIndex[];
    };

export interface SentPart {
  variants: SentPayload[];
  notes: string[];
  unverified: string | undefined;
}

interface SentPathParameter {
  source: string;
  values: SentValue[];
  notes: string[];
  unverified: string | undefined;
}

export interface ClientRequest {
  method: string;
  path: string;
  pathParameters: SentPathParameter[];
  query: SentPart;
  body: SentPart;
  failure: string | undefined;
  unverified: string | undefined;
}

/** Params or body while the client's rules are applied to it. */
type Payload =
  | { kind: "nothing" }
  // Its keys are known only at runtime.
  | { kind: "type"; type: ts.Type }
  | FieldsPayload;

interface FieldsPayload {
  kind: "fields";
  fields: SentField[];
  indexes: SentIndex[];
  /** The frontend type the fields were read from, if they weren't assembled by the model. */
  declared: ts.Type | undefined;
  changed: boolean;
}

interface PayloadPair {
  params: Payload;
  body: Payload;
}

interface ModelContext {
  checker: ts.TypeChecker;
  at: ts.Node;
}

type UrlSlot =
  | { kind: "text"; text: string }
  | { kind: "span"; expression: ts.Expression }
  | { kind: "tag"; name: string };

type TagSlot = Extract<UrlSlot, { kind: "tag" }>;

interface FieldRuleResult {
  field: SentField | undefined;
  changed: boolean;
}

const NOTHING: Payload = { kind: "nothing" };

export function modelClientRequest(
  checker: ts.TypeChecker,
  rtk: RtkRequest,
  at: ts.Node,
): ClientRequest {
  const context: ModelContext = { checker, at };
  // `baseQuery` sends GET unless the request names a method (api.ts:86-87).
  const method = rtk.method ?? "GET";
  const foldsBody = method === "GET" && rtk.body !== undefined;
  const failure = CLIENT_METHODS.has(method)
    ? undefined
    : `the client throws "Invalid HTTP method" for ${method} (client.ts:99-101)`;

  const params = paramsPayloads(context, rtk.params);
  const body = bodyPayloads(context, rtk.body, method);
  const queryNotes = [...params.notes];
  const bodyNotes = [...body.notes];
  const pairs: PayloadPair[] = params.payloads.flatMap((paramsPayload) =>
    body.payloads.map((bodyPayload) => ({
      params: withoutCacheKey(paramsPayload, "params", queryNotes),
      body: withoutCacheKey(bodyPayload, "body", bodyNotes),
    })),
  );
  queryNotes.push(...emptyRestNote(checker, "params", rtk.params, pairs));
  if (foldsBody) {
    queryNotes.push(...emptyRestNote(checker, "body", rtk.body, pairs));
  }

  const slots = urlSlots(rtk);
  const { path, query } = splitAtQuery(slots);
  const tags = slots.filter((slot): slot is TagSlot => slot.kind === "tag");
  const tagParameters = substituteTags(context, tags, pairs);
  const tagValues = new Map(
    tags.map((slot, index) => [slot.name, tagParameters[index]?.values ?? []]),
  );
  const route = pathParameters(checker, path, tagParameters);

  const inline = inlineQuery(checker, query, tagValues);
  if (inline.fields.length) {
    queryNotes.push(
      "the URL template's inline query string is kept by new URL (client.ts:38)",
    );
  }
  let queryUnverified = inline.unverified;
  const onUnverified = (reason: string) => {
    queryUnverified ??= reason;
  };
  const inlinePayload: Payload = {
    kind: "fields",
    fields: inline.fields,
    indexes: [],
    declared: undefined,
    changed: true,
  };

  const queryVariants: SentPayload[] = [];
  const bodyVariants: SentPayload[] = [];
  for (const pair of pairs) {
    let sentQuery = sendAsQuery(checker, pair.params, queryNotes);
    if (foldsBody) {
      sentQuery = mergeQueryPayloads(
        checker,
        sentQuery,
        sendAsQuery(checker, pair.body, queryNotes),
        onUnverified,
      );
      bodyVariants.push({ kind: "nothing" });
    } else {
      bodyVariants.push(
        finishPayload(
          checker,
          sendAsJson(checker, pair.body, bodyNotes),
          "body",
        ),
      );
    }
    sentQuery = mergeQueryPayloads(
      checker,
      inlinePayload,
      sentQuery,
      onUnverified,
    );
    queryVariants.push(finishPayload(checker, sentQuery, "query"));
  }
  if (foldsBody) {
    queryNotes.push(
      ...bodyNotes.splice(0),
      "a GET body is sent as query parameters, so it is compared with the backend query (client.ts:236-241)",
    );
    bodyNotes.push(
      "a GET body is sent as query parameters, so no request body is sent (client.ts:236-241)",
    );
  }

  return {
    method,
    path: route.text,
    pathParameters: route.parameters,
    query: {
      variants: unique(queryVariants, (payload) =>
        payloadKey(checker, payload),
      ),
      notes: [...new Set(queryNotes)],
      unverified: queryUnverified,
    },
    body: {
      variants: unique(bodyVariants, (payload) => payloadKey(checker, payload)),
      notes: [...new Set(bodyNotes)],
      unverified: body.unverified,
    },
    failure: failure ?? body.failure,
    unverified: extraOptionsUnverified(rtk),
  };
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const itemKey = key(item);
    if (seen.has(itemKey)) {
      return false;
    }
    seen.add(itemKey);
    return true;
  });
}

function typeValue(type: ts.Type): SentValue {
  return { kind: "type", type };
}

function valueTypes(values: SentValue[]): ts.Type[] {
  return values.flatMap((value) => (value.kind === "type" ? [value.type] : []));
}

function isItem(value: SentValue): boolean {
  return value.kind !== "empty" && value.itemOf !== undefined;
}

function valueKey(checker: ts.TypeChecker, value: SentValue): string {
  const item =
    value.kind !== "empty" && value.itemOf
      ? `item of ${typeText(checker, value.itemOf)}:`
      : "";
  if (value.kind === "type") {
    return `${item}type:${typeText(checker, value.type)}`;
  }
  return value.kind === "text" ? `${item}text:${value.text}` : "empty";
}

function describeValue(checker: ts.TypeChecker, value: SentValue): string {
  return value.kind === "type"
    ? typeText(checker, value.type)
    : value.kind === "text"
      ? JSON.stringify(value.text)
      : '""';
}

function describeValues(checker: ts.TypeChecker, values: SentValue[]): string {
  const items = values.filter(isItem);
  return [
    ...values
      .filter((value) => !isItem(value))
      .map((value) => describeValue(checker, value)),
    ...(items.length
      ? [
          `(${items.map((value) => describeValue(checker, value)).join(" | ")})[]`,
        ]
      : []),
  ].join(" | ");
}

function describeFields(checker: ts.TypeChecker, fields: SentField[]): string {
  if (!fields.length) {
    return "{}";
  }
  const members = fields.map(
    (field) =>
      `${field.name}${field.optional ? "?" : ""}: ${describeValues(checker, field.values)};`,
  );
  return `{ ${members.join(" ")} }`;
}

function isObjectRest(checker: ts.TypeChecker, expression: ts.Expression) {
  if (!ts.isIdentifier(expression)) {
    return false;
  }
  const symbol = ts.isShorthandPropertyAssignment(expression.parent)
    ? checker.getShorthandAssignmentValueSymbol(expression.parent)
    : checker.getSymbolAtLocation(expression);
  const declaration = symbol?.valueDeclaration;
  return (
    declaration !== undefined &&
    ts.isBindingElement(declaration) &&
    declaration.dotDotDotToken !== undefined &&
    ts.isObjectBindingPattern(declaration.parent)
  );
}

function isExactObject(checker: ts.TypeChecker, expression: ts.Expression) {
  return (
    ts.isObjectLiteralExpression(expression) ||
    isObjectRest(checker, expression)
  );
}

/**
 * The fields of `type`, when they can be enumerated.
 * `exact` means the value has no other keys, so a type with no fields still yields a payload.
 */
function typePayload(
  { checker, at }: ModelContext,
  type: ts.Type,
  exact: boolean,
): Payload {
  const enumerable =
    isObjectLike(type) &&
    !checker.isArrayType(type) &&
    !checker.isTupleType(type);
  const fields = enumerable ? properties(type) : [];
  const indexes = enumerable ? checker.getIndexInfosOfType(type) : [];
  if (!enumerable || (!exact && !fields.length && !indexes.length)) {
    return { kind: "type", type };
  }
  return {
    kind: "fields",
    fields: fields.map((property) => ({
      name: property.name,
      values: [typeValue(checker.getTypeOfSymbolAtLocation(property, at))],
      optional: (property.flags & ts.SymbolFlags.Optional) !== 0,
      declaration: symbolDeclaration(property),
    })),
    indexes: indexes.map((index) => ({
      keyType: index.keyType,
      values: [typeValue(index.type)],
      declaration: index.declaration,
    })),
    declared: type,
    changed: false,
  };
}

function isEmpty(payload: Payload): boolean {
  return (
    payload.kind === "nothing" ||
    (payload.kind === "fields" &&
      !payload.fields.length &&
      !payload.indexes.length)
  );
}

function paramsPayloads(
  context: ModelContext,
  expression: ts.Expression | undefined,
): { payloads: Payload[]; notes: string[] } {
  const { checker } = context;
  if (!expression) {
    return { payloads: [NOTHING], notes: [] };
  }
  const type = checker.getTypeAtLocation(expression);
  const exact = isExactObject(checker, expression);
  const members = unionMembers(checker, type);
  const dropped = members.filter(
    (member) => member.flags & (ts.TypeFlags.Void | ts.TypeFlags.Null),
  );
  if (!dropped.length) {
    return {
      payloads: members.map((member) => typePayload(context, member, exact)),
      notes: [],
    };
  }
  const notes = dropped.map(
    (member) =>
      `${typeText(checker, member)} in the frontend params sends no query parameters (api.ts:89)`,
  );
  return {
    payloads: [
      ...members
        .filter((member) => !(member.flags & NULLISH))
        .map((member) => typePayload(context, member, exact)),
      NOTHING,
    ],
    notes,
  };
}

function globalInterface(
  { checker, at }: ModelContext,
  name: string,
): ts.Type | undefined {
  const symbol = checker
    .getSymbolsInScope(at, ts.SymbolFlags.Interface)
    .find((candidate) => candidate.name === name);
  return symbol && checker.getDeclaredTypeOfSymbol(symbol);
}

function bodyPayloads(
  context: ModelContext,
  expression: ts.Expression | undefined,
  method: string,
): {
  payloads: Payload[];
  notes: string[];
  unverified: string | undefined;
  failure: string | undefined;
} {
  const { checker } = context;
  const payloads: Payload[] = [];
  const notes: string[] = [];
  let unverified: string | undefined;
  let failure: string | undefined;
  if (!expression) {
    return { payloads: [NOTHING], notes, unverified, failure };
  }
  const type = checker.getTypeAtLocation(expression);
  const exact = isExactObject(checker, expression);
  const rawBodyTypes = ["FormData", "URLSearchParams"].flatMap((name) => {
    const rawType = globalInterface(context, name);
    return rawType ? [{ name, type: rawType }] : [];
  });
  for (const member of unionMembers(checker, type)) {
    const raw = rawBodyTypes.find((candidate) =>
      checker.isTypeAssignableTo(member, candidate.type),
    );
    if (member.flags & UNDEFINED) {
      payloads.push(NOTHING);
    } else if (member.flags & ts.TypeFlags.Null) {
      if (method === "GET") {
        payloads.push(NOTHING);
      } else {
        payloads.push({
          kind: "fields",
          fields: [],
          indexes: [],
          declared: undefined,
          changed: true,
        });
        notes.push(
          "a null body is sent as the JSON object {} (client.ts:75, client.ts:249-250)",
        );
      }
    } else if (raw) {
      if (method === "GET") {
        payloads.push(NOTHING);
        notes.push(
          `a ${raw.name} body is not sent with a GET request (client.ts:204-206, client.ts:225, client.ts:239)`,
        );
      } else {
        unverified = `a ${raw.name} body is sent as-is (client.ts:242-248), and its fields are appended at runtime`;
      }
    } else if (checker.isArrayType(member) || checker.isTupleType(member)) {
      failure =
        "the client throws before sending an array body (client.ts:200-202)";
    } else {
      payloads.push(typePayload(context, member, exact));
    }
  }
  return { payloads, notes, unverified, failure };
}

function withoutCacheKey(
  payload: Payload,
  channel: "params" | "body",
  notes: string[],
): Payload {
  if (
    payload.kind !== "fields" ||
    !payload.fields.some((field) => field.name === RTK_CACHE_KEY)
  ) {
    return payload;
  }
  notes.push(
    `${RTK_CACHE_KEY} is removed from the ${channel} before sending (api.ts:43-56)`,
  );
  return {
    ...payload,
    fields: payload.fields.filter((field) => field.name !== RTK_CACHE_KEY),
    changed: true,
  };
}

function emptyRestNote(
  checker: ts.TypeChecker,
  channel: "params" | "body",
  expression: ts.Expression | undefined,
  pairs: PayloadPair[],
): string[] {
  const empty = pairs.some((pair) => {
    const payload = pair[channel];
    return payload.kind === "fields" && isEmpty(payload);
  });
  return expression && empty && isObjectRest(checker, expression)
    ? [
        `frontend ${channel} ${typeText(checker, checker.getTypeAtLocation(expression))} is an object rest with no declared properties and sends no query parameters (utils.ts:43)`,
      ]
    : [];
}

function withoutTypeFlags(
  checker: ts.TypeChecker,
  values: SentValue[],
  removed: ts.TypeFlags,
): SentValue[] {
  return values.flatMap((value): SentValue[] => {
    if (value.kind !== "type") {
      return [value];
    }
    const all = unionMembers(checker, value.type);
    const kept = all.filter((type) => !(type.flags & removed));
    if (kept.length === all.length) {
      return [value];
    }
    // `getNonNullableType` keeps a declared name such as `boolean`,
    // but it also removes null, so it only fits when null is being removed or absent.
    const removesSameMembers = all.every(
      (type) =>
        !(type.flags & ts.TypeFlags.Void) &&
        (!(type.flags & ts.TypeFlags.Null) || removed & ts.TypeFlags.Null),
    );
    return removesSameMembers && kept.length
      ? [typeValue(checker.getNonNullableType(value.type))]
      : kept.map(typeValue);
  });
}

function mayBeEmptyArray(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (checker.isArrayType(type)) {
    return true;
  }
  if (
    !checker.isTupleType(type) ||
    !("target" in type) ||
    typeof type.target !== "object" ||
    type.target === null
  ) {
    return false;
  }
  return "minLength" in type.target && type.target.minLength === 0;
}

const LIB_DIRECTORY = ts.getDefaultLibFilePath({}).replace(/[^/\\]+$/, "");

function isFromLibObject(declaration: ts.Declaration | undefined): boolean {
  const owner = declaration?.parent;
  return (
    owner !== undefined &&
    ts.isInterfaceDeclaration(owner) &&
    owner.name.text === "Object" &&
    owner.getSourceFile().fileName.startsWith(LIB_DIRECTORY)
  );
}

// `String` of an object uses its `Symbol.toPrimitive`, `Symbol.toStringTag` or `toString`,
// so only an object that inherits all three from `Object` is known to become "[object Object]".
function sendsObjectText(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (
    !(type.flags & ts.TypeFlags.Object) ||
    checker.isArrayType(type) ||
    checker.isTupleType(type) ||
    type.getCallSignatures().length > 0 ||
    type.getConstructSignatures().length > 0
  ) {
    return false;
  }
  const toString = checker.getPropertyOfType(type, "toString");
  return (
    isFromLibObject(toString?.declarations?.[0]) &&
    !checker
      .getPropertiesOfType(type)
      .some(
        (property) =>
          property.name.startsWith("__@toPrimitive") ||
          property.name.startsWith("__@toStringTag"),
      )
  );
}

/** The text `String` gives for every value of `type`, when that text is known and differs from a string literal. */
function knownText(checker: ts.TypeChecker, type: ts.Type): string | undefined {
  if (type.isNumberLiteral()) {
    return String(type.value);
  }
  if (type.isLiteral() && !type.isStringLiteral()) {
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
  return sendsObjectText(checker, type) ? "[object Object]" : undefined;
}

function queryItemValues(
  checker: ts.TypeChecker,
  type: ts.Type,
): SentValue[] | undefined {
  if (!checker.isArrayType(type) && !checker.isTupleType(type)) {
    return undefined;
  }
  const elements = checker.isTupleType(type)
    ? isTypeReference(type)
      ? checker.getTypeArguments(type)
      : []
    : [checker.getIndexTypeOfType(type, ts.IndexKind.Number)].filter(
        (element) => element !== undefined,
      );
  const parts = elements.flatMap((element) => unionMembers(checker, element));
  if (!parts.some((part) => knownText(checker, part) !== undefined)) {
    return undefined;
  }
  return parts.map((part): SentValue => {
    const text = knownText(checker, part);
    return text === undefined
      ? { kind: "type", type: part, itemOf: type }
      : { kind: "text", text, itemOf: type };
  });
}

// `appendQueryParameters` sends `String(value)`, or `String(item)` for each array item (utils.ts:50-56).
function queryTextValues(
  checker: ts.TypeChecker,
  values: SentValue[],
): SentValue[] {
  const result = values.flatMap((value): SentValue[] => {
    if (value.kind !== "type" || value.itemOf) {
      return [value];
    }
    const parts = unionMembers(checker, value.type);
    const converted = parts.map(
      (part) =>
        queryItemValues(checker, part) ??
        (knownText(checker, part) === undefined ? undefined : part),
    );
    if (converted.every((part) => part === undefined)) {
      return [value];
    }
    return parts.flatMap((part): SentValue[] => {
      const items = queryItemValues(checker, part);
      if (items) {
        return items;
      }
      const text = knownText(checker, part);
      return text === undefined ? [typeValue(part)] : [{ kind: "text", text }];
    });
  });
  return unique(result, (value) => valueKey(checker, value));
}

function isFixedTuple(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (
    !checker.isTupleType(type) ||
    !("target" in type) ||
    typeof type.target !== "object" ||
    type.target === null ||
    !("elementFlags" in type.target) ||
    !Array.isArray(type.target.elementFlags)
  ) {
    return false;
  }
  return type.target.elementFlags.every(
    (flag) => flag === ts.ElementFlags.Required,
  );
}

// `Array.prototype.toString` joins `String(item)` with commas, writing null and undefined items as "".
// Only a fixed-length tuple whose items each have one known text gives one known text.
function arrayText(checker: ts.TypeChecker, type: ts.Type): string | undefined {
  if (!isTypeReference(type) || !isFixedTuple(checker, type)) {
    return undefined;
  }
  const items = checker.getTypeArguments(type).map((item) => {
    if (item.isUnion()) {
      return undefined;
    }
    if (item.flags & NULLISH) {
      return "";
    }
    if (item.isStringLiteral()) {
      return item.value;
    }
    return knownText(checker, item) ?? arrayText(checker, item);
  });
  return items.every((item) => item !== undefined)
    ? items.join(",")
    : undefined;
}

/**
 * A path value after `String`: known text replaces the parts it is known for,
 * and `unmodelled` lists array parts whose comma-joined text is not known.
 */
function pathTextValues(
  checker: ts.TypeChecker,
  values: SentValue[],
): { values: SentValue[]; unmodelled: ts.Type[] } {
  const unmodelled: ts.Type[] = [];
  const result = values.flatMap((value): SentValue[] => {
    if (value.kind !== "type") {
      return [value];
    }
    const parts = unionMembers(checker, value.type);
    const texts = parts.map(
      (part) => knownText(checker, part) ?? arrayText(checker, part),
    );
    unmodelled.push(
      ...parts.filter(
        (part, index) =>
          texts[index] === undefined &&
          (checker.isArrayType(part) || checker.isTupleType(part)),
      ),
    );
    if (texts.every((text) => text === undefined)) {
      return [value];
    }
    return parts.map((part, index): SentValue => {
      const text = texts[index];
      return text === undefined ? typeValue(part) : { kind: "text", text };
    });
  });
  return {
    values: unique(result, (value) => valueKey(checker, value)),
    unmodelled,
  };
}

/** Values and notes for a path parameter that is sent as `String(value)`, named by `source`. */
function stringifiedPathValues(
  checker: ts.TypeChecker,
  source: string,
  found: SentValue[],
  reason: string,
): { values: SentValue[]; notes: string[] } {
  const { values, unmodelled } = pathTextValues(checker, found);
  const defined = (candidates: SentValue[]) =>
    candidates.filter((value) => value.kind !== "empty");
  const notes = [
    ...(valueKeys(checker, values) !== valueKeys(checker, found)
      ? [
          `${source} (${describeValues(checker, defined(found))}) is sent as ${describeValues(checker, defined(values))} (${reason})`,
        ]
      : []),
    ...unmodelled.map(
      (array) =>
        `${source} (${typeText(checker, array)}) is sent as its comma-joined items, which the checker does not model (${reason})`,
    ),
  ];
  return { values, notes };
}

function mapFields(
  payload: Payload,
  mapField: (field: SentField) => FieldRuleResult,
  mapIndexValues: (values: SentValue[]) => SentValue[],
): Payload {
  if (payload.kind !== "fields") {
    return payload;
  }
  let changed = payload.changed;
  const fields = payload.fields.flatMap((field) => {
    const result = mapField(field);
    changed ||= result.changed;
    return result.field ? [result.field] : [];
  });
  const indexes = payload.indexes.map((index) => ({
    ...index,
    values: mapIndexValues(index.values),
  }));
  return { ...payload, fields, indexes, changed };
}

// `appendQueryParameters` skips a null or undefined value and appends an array item by item,
// so neither kind of value is guaranteed to put its key in the query string (utils.ts:43-57).
function sendAsQuery(
  checker: ts.TypeChecker,
  payload: Payload,
  notes: string[],
): Payload {
  return mapFields(
    payload,
    (field) => {
      const types = valueTypes(field.values).flatMap((type) =>
        unionMembers(checker, type),
      );
      const kept = types.filter((type) => !(type.flags & NULLISH));
      const other = field.values.filter((value) => value.kind !== "type");
      const described = `${field.name} (${describeValues(checker, field.values)})`;
      if (!kept.length && !other.length) {
        notes.push(
          `${described} is null or undefined, so it is not sent (utils.ts:47)`,
        );
        return { field: undefined, changed: true };
      }
      const hasNull = types.some((type) => type.flags & ts.TypeFlags.Null);
      const nullish = kept.length < types.length;
      const emptyArray = kept.some((type) => mayBeEmptyArray(checker, type));
      if (hasNull || (nullish && !field.optional)) {
        notes.push(
          `${described} is not sent when it is null or undefined (utils.ts:47)`,
        );
      }
      if (emptyArray && !field.optional) {
        notes.push(
          `${described} is not sent when its array is empty (utils.ts:50-53)`,
        );
      }
      const optional = field.optional || nullish || emptyArray;
      const present = withoutTypeFlags(checker, field.values, NULLISH);
      const sent = queryTextValues(checker, present);
      const stringified =
        valueKeys(checker, sent) !== valueKeys(checker, present);
      if (stringified) {
        notes.push(
          `${field.name} (${describeValues(checker, present)}) is sent as ${describeValues(checker, sent)} (utils.ts:50-56)`,
        );
      }
      return {
        field: { ...field, values: sent, optional },
        changed: hasNull || optional !== field.optional || stringified,
      };
    },
    (values) => {
      const present = values.flatMap((value) =>
        value.kind === "type"
          ? unionMembers(checker, value.type)
              .filter((type) => !(type.flags & NULLISH))
              .map(typeValue)
          : [value],
      );
      const sent = queryTextValues(checker, present);
      if (valueKeys(checker, sent) !== valueKeys(checker, present)) {
        notes.push(
          `[key] (${describeValues(checker, present)}) is sent as ${describeValues(checker, sent)} (utils.ts:50-56)`,
        );
      }
      return sent;
    },
  );
}

function valueKeys(checker: ts.TypeChecker, values: SentValue[]): string {
  return values.map((value) => valueKey(checker, value)).join("|");
}

// `JSON.stringify` leaves out a property whose value is undefined (client.ts:250).
function sendAsJson(
  checker: ts.TypeChecker,
  payload: Payload,
  notes: string[],
): Payload {
  return mapFields(
    payload,
    (field) => {
      const described = `${field.name} (${describeValues(checker, field.values)})`;
      const types = valueTypes(field.values).flatMap((type) =>
        unionMembers(checker, type),
      );
      const kept = types.filter((type) => !(type.flags & UNDEFINED));
      if (!kept.length) {
        notes.push(
          `${described} is undefined, so JSON.stringify leaves it out of the body (client.ts:250)`,
        );
        return { field: undefined, changed: true };
      }
      if (kept.length === types.length || field.optional) {
        return { field, changed: false };
      }
      notes.push(
        `${described} is left out of the body when it is undefined (client.ts:250)`,
      );
      return {
        field: {
          ...field,
          values: withoutTypeFlags(checker, field.values, UNDEFINED),
          optional: true,
        },
        changed: true,
      };
    },
    (values) => values,
  );
}

function mergeQueryPayloads(
  checker: ts.TypeChecker,
  first: Payload,
  second: Payload,
  onUnverified: (reason: string) => void,
): Payload {
  if (isEmpty(first)) {
    return second;
  }
  if (isEmpty(second)) {
    return first;
  }
  const opaque = [first, second].find((payload) => payload.kind === "type");
  if (opaque?.kind === "type") {
    onUnverified(
      `query parameters come from more than one source, and a ${typeText(checker, opaque.type)} value's keys are known only at runtime`,
    );
    return first;
  }
  if (first.kind !== "fields" || second.kind !== "fields") {
    return first;
  }
  const names = new Set(first.fields.map((field) => field.name));
  const repeated = second.fields.find((field) => names.has(field.name));
  if (repeated) {
    onUnverified(
      `${repeated.name} is appended to the query string twice (client.ts:234, client.ts:240), and the checker does not model a repeated key`,
    );
  }
  return {
    kind: "fields",
    fields: [...first.fields, ...second.fields],
    indexes: [...first.indexes, ...second.indexes],
    declared: undefined,
    changed: true,
  };
}

function finishPayload(
  checker: ts.TypeChecker,
  payload: Payload,
  channel: "query" | "body",
): SentPayload {
  if (payload.kind !== "fields") {
    return payload;
  }
  if (channel === "query" && isEmpty(payload)) {
    return { kind: "nothing" };
  }
  if (!payload.changed && payload.declared) {
    return { kind: "type", type: payload.declared };
  }
  const fields = describeFields(checker, payload.fields);
  return {
    kind: "fields",
    description: payload.declared
      ? `${typeText(checker, payload.declared)} sent as ${fields}`
      : fields,
    fields: payload.fields,
    indexes: payload.indexes,
  };
}

function payloadKey(checker: ts.TypeChecker, payload: SentPayload): string {
  if (payload.kind === "nothing") {
    return "nothing";
  }
  if (payload.kind === "type") {
    return `type:${typeText(checker, payload.type)}`;
  }
  return `fields:${payload.description}`;
}

function extraOptionsUnverified(rtk: RtkRequest): string | undefined {
  const extraOptions = rtk.extraOptions && unwrap(rtk.extraOptions);
  const replacesRequest =
    extraOptions !== undefined &&
    (!ts.isObjectLiteralExpression(extraOptions) ||
      extraOptions.properties.some(
        (property) =>
          !property.name ||
          !ts.isIdentifier(property.name) ||
          REQUEST_FIELDS.includes(property.name.text),
      ));
  return replacesRequest
    ? "extraOptions is spread over the request after url, method, params and body (api.ts:92)"
    : undefined;
}

function urlSlots({ url }: RtkRequest): UrlSlot[] {
  return [
    ...textSlots(url.head),
    ...url.spans.flatMap((span): UrlSlot[] => [
      { kind: "span", expression: span.expression },
      ...textSlots(span.literal),
    ]),
  ];
}

function textSlots(text: string): UrlSlot[] {
  const slots: UrlSlot[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_TAG)) {
    slots.push({ kind: "text", text: text.slice(last, match.index) });
    slots.push({ kind: "tag", name: match[0].slice(1) });
    last = match.index + match[0].length;
  }
  slots.push({ kind: "text", text: text.slice(last) });
  return slots;
}

function splitAtQuery(slots: UrlSlot[]): {
  path: UrlSlot[];
  query: UrlSlot[];
} {
  const index = slots.findIndex(
    (slot) => slot.kind === "text" && slot.text.includes("?"),
  );
  const at = slots[index];
  if (index === -1 || !at || at.kind !== "text") {
    return { path: slots, query: [] };
  }
  const split = at.text.indexOf("?");
  return {
    path: [
      ...slots.slice(0, index),
      { kind: "text", text: at.text.slice(0, split) },
    ],
    query: [
      { kind: "text", text: at.text.slice(split + 1) },
      ...slots.slice(index + 1),
    ],
  };
}

function encodedValue(expression: ts.Expression): ts.Expression {
  const inner = unwrap(expression);
  if (
    ts.isCallExpression(inner) &&
    ts.isIdentifier(inner.expression) &&
    inner.expression.text === "encodeURIComponent" &&
    inner.arguments.length === 1 &&
    inner.arguments[0]
  ) {
    return inner.arguments[0];
  }
  return inner;
}

function tagLookup(
  checker: ts.TypeChecker,
  payload: Payload,
  name: string,
  channel: "params" | "body",
):
  | { kind: "absent" }
  | { kind: "field"; field: SentField }
  | { kind: "unknown"; reason: string } {
  if (payload.kind === "nothing") {
    return { kind: "absent" };
  }
  if (payload.kind === "type") {
    return {
      kind: "unknown",
      reason: `whether the ${channel} has a ${name} key depends on a ${typeText(checker, payload.type)} value known only at runtime (utils.ts:166)`,
    };
  }
  const field = payload.fields.find((candidate) => candidate.name === name);
  if (field) {
    return { kind: "field", field };
  }
  const key = checker.getStringLiteralType(name);
  if (
    payload.indexes.some((index) =>
      checker.isTypeAssignableTo(key, index.keyType),
    )
  ) {
    return {
      kind: "unknown",
      reason: `whether the ${channel} has a ${name} key depends on an index signature whose keys are known only at runtime (utils.ts:166)`,
    };
  }
  return { kind: "absent" };
}

function withoutField(
  payload: Payload,
  name: string,
  optional: boolean,
): Payload {
  if (payload.kind !== "fields") {
    return payload;
  }
  const fields = optional
    ? payload.fields.map((field) =>
        field.name === name ? { ...field, optional: true } : field,
      )
    : payload.fields.filter((field) => field.name !== name);
  return { ...payload, fields, changed: true };
}

function definedValues(
  checker: ts.TypeChecker,
  field: SentField,
): {
  values: SentValue[];
  mayBeUndefined: boolean;
} {
  const types = valueTypes(field.values).flatMap((type) =>
    unionMembers(checker, type),
  );
  const defined = types.filter((type) => !(type.flags & UNDEFINED));
  return {
    values: [
      ...defined.map(typeValue),
      ...field.values.filter((value) => value.kind !== "type"),
    ],
    mayBeUndefined: field.optional || defined.length < types.length,
  };
}

// `substituteUrlTags` takes each `:tag` from params, or from the body when params has no defined value for it,
// and deletes the key from every bag it read (utils.ts:165-173).
function substituteTag(
  checker: ts.TypeChecker,
  name: string,
  { params, body }: PayloadPair,
): Omit<SentPathParameter, "source"> & PayloadPair {
  const notes: string[] = [];
  const fromParams = tagLookup(checker, params, name, "params");
  if (fromParams.kind === "unknown") {
    return { values: [], notes, unverified: fromParams.reason, params, body };
  }
  const values: SentValue[] = [];
  let nextParams = params;
  let paramsMaySupply = false;
  let reachesBody = true;
  if (fromParams.kind === "field") {
    const { values: defined, mayBeUndefined } = definedValues(
      checker,
      fromParams.field,
    );
    values.push(...defined);
    paramsMaySupply = defined.length > 0;
    reachesBody = mayBeUndefined;
    nextParams = withoutField(params, name, false);
  }
  const fromBody = reachesBody
    ? tagLookup(checker, body, name, "body")
    : undefined;
  if (fromBody?.kind === "unknown") {
    return {
      values,
      notes,
      unverified: fromBody.reason,
      params: nextParams,
      body,
    };
  }
  let nextBody = body;
  if (fromBody?.kind === "field") {
    const { values: defined, mayBeUndefined } = definedValues(
      checker,
      fromBody.field,
    );
    values.push(...defined);
    // The body keeps its key when params supplies the value first.
    nextBody = withoutField(body, name, paramsMaySupply);
    notes.push(
      paramsMaySupply
        ? `:${name} is filled from params.${name} when it is defined, otherwise from body.${name}, which is then removed from the body (utils.ts:165-173)`
        : fromParams.kind === "field"
          ? `:${name} is filled from body.${name}, because params.${name} is undefined (utils.ts:165-173)`
          : `:${name} is filled from body.${name} (utils.ts:165-168)`,
    );
    if (mayBeUndefined) {
      values.push({ kind: "empty" });
    }
  } else {
    if (paramsMaySupply) {
      notes.push(`:${name} is filled from params.${name} (utils.ts:165-168)`);
    }
    if (reachesBody) {
      values.push({ kind: "empty" });
    }
  }
  if (values.some((value) => value.kind === "empty")) {
    notes.push(
      `:${name} becomes an empty string when no defined value is found (utils.ts:176-179)`,
    );
  }
  return {
    values,
    notes,
    unverified: undefined,
    params: nextParams,
    body: nextBody,
  };
}

// Tags are substituted in URL order, and each one can consume a key a later tag would read.
function substituteTags(
  { checker }: ModelContext,
  tags: TagSlot[],
  pairs: PayloadPair[],
): SentPathParameter[] {
  return tags.map((slot) => {
    const values: SentValue[] = [];
    const notes: string[] = [];
    let unverified: string | undefined;
    for (const pair of pairs) {
      const substituted = substituteTag(checker, slot.name, pair);
      values.push(...substituted.values);
      notes.push(...substituted.notes);
      unverified ??= substituted.unverified;
      pair.params = substituted.params;
      pair.body = substituted.body;
    }
    const sent = stringifiedPathValues(
      checker,
      `:${slot.name}`,
      unique(values, (value) => valueKey(checker, value)),
      "utils.ts:180",
    );
    return {
      source: `:${slot.name}`,
      values: sent.values,
      notes: [...new Set([...notes, ...sent.notes])],
      unverified,
    };
  });
}

// A template literal converts a span with `String`, and `encodeURIComponent` does the same to its argument.
function spanParameter(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): SentPathParameter {
  const value = encodedValue(expression);
  const converter =
    value === unwrap(expression)
      ? "the template literal"
      : "encodeURIComponent";
  const sent = stringifiedPathValues(
    checker,
    `\${${unwrap(expression).getText()}}`,
    [typeValue(checker.getTypeAtLocation(value))],
    `${converter} applies String`,
  );
  return {
    source: "template expression",
    values: sent.values,
    notes: sent.notes,
    unverified: undefined,
  };
}

function pathParameters(
  checker: ts.TypeChecker,
  path: UrlSlot[],
  tags: SentPathParameter[],
): { text: string; parameters: SentPathParameter[] } {
  const remaining = [...tags];
  const parameters: SentPathParameter[] = [];
  let text = "";
  for (const slot of path) {
    if (slot.kind === "text") {
      text += slot.text;
      continue;
    }
    text += PATH_PARAMETER;
    const parameter: SentPathParameter | undefined =
      slot.kind === "span"
        ? spanParameter(checker, slot.expression)
        : remaining.shift();
    if (parameter) {
      parameters.push(parameter);
    }
  }
  return { text, parameters };
}

function inlineQuery(
  checker: ts.TypeChecker,
  query: UrlSlot[],
  tagValues: Map<string, SentValue[]>,
): { fields: SentField[]; unverified: string | undefined } {
  const pairs: UrlSlot[][] = [[]];
  for (const slot of query) {
    if (slot.kind !== "text") {
      pairs.at(-1)?.push(slot);
      continue;
    }
    slot.text.split("&").forEach((piece, index) => {
      if (index > 0) {
        pairs.push([]);
      }
      if (piece) {
        pairs.at(-1)?.push({ kind: "text", text: piece });
      }
    });
  }
  const fields: SentField[] = [];
  for (const pair of pairs.filter((candidate) => candidate.length)) {
    const equals = pair.findIndex(
      (slot) => slot.kind === "text" && slot.text.includes("="),
    );
    const at = equals === -1 ? undefined : pair[equals];
    const keyText =
      at?.kind === "text" ? at.text.slice(0, at.text.indexOf("=")) : "";
    const keySlots: UrlSlot[] = [
      ...(equals === -1 ? pair : pair.slice(0, equals)),
      ...(keyText ? [{ kind: "text", text: keyText } as const] : []),
    ];
    if (keySlots.some((slot) => slot.kind !== "text")) {
      return {
        fields,
        unverified:
          "a query string key in the URL template is built at runtime",
      };
    }
    const name = decode(
      keySlots.map((slot) => (slot.kind === "text" ? slot.text : "")).join(""),
    );
    const valueText =
      at?.kind === "text" ? at.text.slice(at.text.indexOf("=") + 1) : "";
    const valueSlots: UrlSlot[] = [
      ...(valueText ? [{ kind: "text", text: valueText } as const] : []),
      ...(equals === -1 ? [] : pair.slice(equals + 1)),
    ];
    fields.push({
      name,
      values: inlineValues(checker, valueSlots, tagValues),
      optional: false,
      declaration: undefined,
    });
  }
  return { fields, unverified: undefined };
}

function inlineValues(
  checker: ts.TypeChecker,
  slots: UrlSlot[],
  tagValues: Map<string, SentValue[]>,
): SentValue[] {
  const [only, ...rest] = slots;
  if (!only) {
    return [{ kind: "text", text: "" }];
  }
  if (rest.length) {
    return [typeValue(checker.getStringType())];
  }
  if (only.kind === "text") {
    return [{ kind: "text", text: decode(only.text) }];
  }
  if (only.kind === "span") {
    return [
      typeValue(checker.getTypeAtLocation(encodedValue(only.expression))),
    ];
  }
  return tagValues.get(only.name) ?? [];
}

function decode(text: string): string {
  return decodeURIComponent(text.replace(/\+/g, " "));
}
