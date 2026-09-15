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
import {
  type JsonConversion,
  type JsonView,
  type StringConversion,
  type StringPart,
  describeJsonView,
  isLibDeclaration,
  isLibType,
  isPrototypeMember,
  jsonConversionNotes,
  jsonConversions,
  jsonView,
  keepsType,
  stringParts,
} from "./value-conversion";

// `frontend/src/metabase/api/api.ts:22`
const RTK_CACHE_KEY = "__rtkCacheKey";
// `frontend/src/metabase/api/client/utils.ts:148`
const URL_TAG = /:\w+/g;
const PATH_PARAMETER = "{param}";
const REQUEST_FIELDS = ["url", "method", "params", "body"];

const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const UNDEFINED = ts.TypeFlags.Undefined | ts.TypeFlags.Void;

/** `itemOf` is the array type when the value is sent once for each of its items. */
export type SentValue =
  | { kind: "type"; type: ts.Type; itemOf?: ts.Type }
  | { kind: "text"; text: string; itemOf?: ts.Type }
  | { kind: "json"; view: JsonView; from: ts.Type }
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
  /** The client sends this part whatever the value, even when what it holds is unverified. */
  alwaysSent: boolean;
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
  const slots = urlSlots(rtk);
  const { path, query } = splitAtQuery(slots);
  const tags = slots.filter((slot): slot is TagSlot => slot.kind === "tag");
  const tagParameters = substituteTags(context, tags, pairs);
  const tagsByName = new Map(
    tags.flatMap((slot, index) => {
      const parameter = tagParameters[index];
      return parameter ? [[slot.name, parameter] as const] : [];
    }),
  );
  const route = pathParameters(context, path, tagParameters);

  const inline = inlineQuery(context, query, tagsByName);
  queryNotes.push(...inline.notes);
  if (inline.fields.length) {
    queryNotes.push(
      "the URL template's inline query string is kept by new URL (client.ts:38)",
    );
  }
  // A GET body is sent as query parameters, so what stops the body being compared stops the query instead.
  let queryUnverified =
    inline.unverified ??
    params.unverified ??
    (foldsBody ? body.unverified : undefined);
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
    let sentQuery = sendAsQuery(context, pair.params, queryNotes, onUnverified);
    if (foldsBody) {
      sentQuery = mergeQueryPayloads(
        checker,
        sentQuery,
        sendAsQuery(context, pair.body, queryNotes, onUnverified),
        onUnverified,
      );
      bodyVariants.push({ kind: "nothing" });
    } else {
      bodyVariants.push(
        finishPayload(
          checker,
          sendAsJson(context, pair.body, bodyNotes),
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
      // A query with no keys is always possible, so nothing about it is certain.
      alwaysSent: false,
    },
    body: {
      variants: unique(bodyVariants, (payload) => payloadKey(checker, payload)),
      notes: [...new Set(bodyNotes)],
      unverified: foldsBody ? undefined : body.unverified,
      alwaysSent: !foldsBody && body.alwaysSent,
    },
    failure: body.failure,
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
  return values.flatMap((value) =>
    value.kind === "type"
      ? [value.type]
      : value.kind === "json"
        ? [value.from]
        : [],
  );
}

function isItem(value: SentValue): boolean {
  return (
    value.kind !== "empty" &&
    value.kind !== "json" &&
    value.itemOf !== undefined
  );
}

function valueKey(checker: ts.TypeChecker, value: SentValue): string {
  if (value.kind === "json") {
    return `json:${describeJsonView(checker, value.view)}`;
  }
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
  if (value.kind === "json") {
    return describeJsonView(checker, value.view);
  }
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

interface CopiedPayload {
  payload: Payload;
  notes: string[];
  unverified: string | undefined;
}

/**
 * The fields the client's spread copy of `type` has (client.ts:74-75).
 * An object literal has no keys beyond its fields, so a literal with no fields still yields a payload.
 * An object rest carries whatever keys the caller passed beyond the destructured ones,
 * so a rest with no declared properties cannot be compared.
 */
function typePayload(
  { checker, at }: ModelContext,
  type: ts.Type,
  expression: ts.Expression,
  channel: "params" | "body",
): CopiedPayload {
  const exact = ts.isObjectLiteralExpression(expression);
  const unverified = (reason: string): CopiedPayload => ({
    payload: { kind: "type", type },
    notes: [],
    unverified: `the ${channel} is copied with { ...value } before it is sent, and ${reason} (client.ts:74-75)`,
  });
  if (
    type.flags &
    (ts.TypeFlags.Any |
      ts.TypeFlags.Unknown |
      ts.TypeFlags.NonPrimitive |
      ts.TypeFlags.TypeParameter)
  ) {
    return unverified(
      `its own keys are known only at runtime, because it is ${typeText(checker, type)}`,
    );
  }
  // RTK types params as an object, null or void (api.ts:63), so only a body reaches these.
  if (
    !isObjectLike(type) ||
    checker.isArrayType(type) ||
    checker.isTupleType(type)
  ) {
    return unverified(
      `the checker does not model the copy of a ${typeText(checker, type)}`,
    );
  }
  if (!type.isIntersection() && isLibType(type)) {
    return unverified(
      `a ${typeText(checker, type)} keeps its data behind prototype accessors`,
    );
  }
  const own = properties(type).filter(
    (property) => !isPrototypeMember(checker, property),
  );
  const dropped = properties(type).filter(
    (property) => !own.includes(property),
  );
  const indexes = checker.getIndexInfosOfType(type);
  if (!exact && !own.length && !indexes.length && !dropped.length) {
    return {
      payload: { kind: "type", type },
      notes: [],
      unverified: isObjectRest(checker, expression)
        ? `${channel === "params" ? "the query parameters come" : "the body comes"} from the object rest ${expression.getText()}, which has no declared properties and carries whatever keys the caller passed beyond the destructured ones (${channel === "params" ? "utils.ts:43-57" : "client.ts:250"})`
        : undefined,
    };
  }
  return {
    payload: {
      kind: "fields",
      fields: own.map((property) => ({
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
      changed: dropped.length > 0,
    },
    notes: dropped.map(
      (property) =>
        `${property.name} is a method or accessor, which { ...value } and JSON.stringify both leave out (client.ts:74-75)`,
    ),
    unverified: undefined,
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
): { payloads: Payload[]; notes: string[]; unverified: string | undefined } {
  const { checker } = context;
  if (!expression) {
    return { payloads: [NOTHING], notes: [], unverified: undefined };
  }
  const type = checker.getTypeAtLocation(expression);
  const members = unionMembers(checker, type);
  const dropped = members.filter(
    (member) => member.flags & (ts.TypeFlags.Void | ts.TypeFlags.Null),
  );
  const copied = members
    .filter((member) => !(member.flags & NULLISH))
    .map((member) => typePayload(context, member, expression, "params"));
  const notes = [
    ...dropped.map(
      (member) =>
        `${typeText(checker, member)} in the frontend params sends no query parameters (api.ts:89)`,
    ),
    ...copied.flatMap((entry) => entry.notes),
  ];
  return {
    payloads: [
      ...copied.map((entry) => entry.payload),
      ...(dropped.length ? [NOTHING] : []),
    ],
    notes,
    unverified: copied.find((entry) => entry.unverified)?.unverified,
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
  alwaysSent: boolean;
} {
  const { checker } = context;
  const payloads: Payload[] = [];
  const notes: string[] = [];
  let unverified: string | undefined;
  let failure: string | undefined;
  // A non-GET body that is not undefined is always sent, as JSON or as-is (client.ts:242-250).
  let alwaysSent = method !== "GET";
  if (!expression) {
    return {
      payloads: [NOTHING],
      notes,
      unverified,
      failure,
      alwaysSent: false,
    };
  }
  const type = checker.getTypeAtLocation(expression);
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
      alwaysSent = false;
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
      const copied = typePayload(context, member, expression, "body");
      payloads.push(copied.payload);
      notes.push(...copied.notes);
      unverified ??= copied.unverified;
    }
  }
  return { payloads, notes, unverified, failure, alwaysSent };
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
    // `getNonNullableType` keeps a declared name such as `boolean` or `TaskRunType`,
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

interface Stringified {
  values: SentValue[];
  notes: string[];
  /** Why the text sent cannot be compared: a value whose text is known only at runtime. */
  unverified: string | undefined;
}

function elementTypes(
  checker: ts.TypeChecker,
  array: ts.Type,
): readonly ts.Type[] {
  if (checker.isTupleType(array)) {
    return isTypeReference(array) ? checker.getTypeArguments(array) : [];
  }
  const element = checker.getIndexTypeOfType(array, ts.IndexKind.Number);
  return element ? [element] : [];
}

/**
 * The string conversion named by `reason` applied to each value named by `source`,
 * with a note keeping the value from before it.
 * With `items`, an array is sent one item at a time, each item through `String`.
 */
function stringifiedValues(
  checker: ts.TypeChecker,
  source: string,
  found: SentValue[],
  reason: string,
  items: boolean,
): Stringified {
  let unverified: string | undefined;
  const partValue = (
    part: StringPart,
    itemOf: ts.Type | undefined,
  ): SentValue => {
    if (part.kind === "text") {
      return { kind: "text", text: part.text, ...(itemOf ? { itemOf } : {}) };
    }
    if (part.unmodelled) {
      unverified ??= `${source} (${typeText(checker, part.type)}) is sent as text, and ${part.unmodelled} (${reason})`;
    }
    return { kind: "type", type: part.type, ...(itemOf ? { itemOf } : {}) };
  };
  const converted = found.flatMap((value): SentValue[] => {
    if (value.kind !== "type" || value.itemOf) {
      return [value];
    }
    const parts = unionMembers(checker, value.type);
    const results = parts.map((part): SentValue[] => {
      if (items && (checker.isArrayType(part) || checker.isTupleType(part))) {
        const itemParts = elementTypes(checker, part).flatMap((element) =>
          stringParts(checker, element),
        );
        return keepsType(itemParts)
          ? [typeValue(part)]
          : itemParts.map((itemPart) => partValue(itemPart, part));
      }
      const [only, ...more] = stringParts(checker, part);
      return only && !more.length ? [partValue(only, undefined)] : [];
    });
    const unchanged = results.every(
      (result, index) =>
        result.length === 1 &&
        result[0]?.kind === "type" &&
        !result[0].itemOf &&
        result[0].type === parts[index],
    );
    return unchanged ? [value] : results.flat();
  });
  const values = unique(converted, (value) => valueKey(checker, value));
  const defined = (candidates: SentValue[]) =>
    candidates.filter((value) => value.kind !== "empty");
  return {
    values,
    notes:
      valueKeys(checker, values) !== valueKeys(checker, found)
        ? [
            `${source} (${describeValues(checker, defined(found))}) is sent as ${describeValues(checker, defined(values))} (${reason})`,
          ]
        : [],
    unverified,
  };
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
  { checker }: ModelContext,
  payload: Payload,
  notes: string[],
  onUnverified: (reason: string) => void,
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
      const sent = stringifiedValues(
        checker,
        field.name,
        present,
        "utils.ts:50-56",
        true,
      );
      notes.push(...sent.notes);
      if (sent.unverified) {
        onUnverified(sent.unverified);
      }
      const stringified =
        valueKeys(checker, sent.values) !== valueKeys(checker, present);
      return {
        field: { ...field, values: sent.values, optional },
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
      const sent = stringifiedValues(
        checker,
        "[key]",
        present,
        "utils.ts:50-56",
        true,
      );
      notes.push(...sent.notes);
      if (sent.unverified) {
        onUnverified(sent.unverified);
      }
      return sent.values;
    },
  );
}

function valueKeys(checker: ts.TypeChecker, values: SentValue[]): string {
  return values.map((value) => valueKey(checker, value)).join("|");
}

/** How `JSON.stringify` serialises one field's values, recording every position it changes. */
function jsonValues(
  { checker }: ModelContext,
  path: string,
  values: SentValue[],
  conversions: JsonConversion[],
): SentValue[] {
  return values.map((value) => {
    if (value.kind !== "type") {
      return value;
    }
    const view = jsonView(checker, value.type);
    if (view.kind === "type" && view.type === value.type) {
      return value;
    }
    conversions.push(...jsonConversions(checker, view, path, value.type));
    return { kind: "json", view, from: value.type };
  });
}

// `JSON.stringify` leaves out a property whose value is undefined (client.ts:250).
function sendAsJson(
  context: ModelContext,
  payload: Payload,
  notes: string[],
): Payload {
  const conversions: JsonConversion[] = [];
  const result = sendAsJsonFields(context, payload, notes, conversions);
  notes.push(...jsonConversionNotes(conversions));
  return result;
}

function sendAsJsonFields(
  context: ModelContext,
  payload: Payload,
  notes: string[],
  conversions: JsonConversion[],
): Payload {
  const { checker } = context;
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
        const values = jsonValues(
          context,
          `$.${field.name}`,
          field.values,
          conversions,
        );
        // `jsonValues` returns the same value object when nothing changes.
        return {
          field: { ...field, values },
          changed: values.some((value, index) => value !== field.values[index]),
        };
      }
      notes.push(
        `${described} is left out of the body when it is undefined (client.ts:250)`,
      );
      return {
        field: {
          ...field,
          values: jsonValues(
            context,
            `$.${field.name}`,
            withoutTypeFlags(checker, field.values, UNDEFINED),
            conversions,
          ),
          optional: true,
        },
        changed: true,
      };
    },
    (values) => jsonValues(context, "$[key]", values, conversions),
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

/** The argument of a call to the global `encodeURIComponent`, found through the checker so a local function of that name doesn't count. */
function encodedArgument(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): ts.Expression | undefined {
  const inner = unwrap(expression);
  if (
    !ts.isCallExpression(inner) ||
    !ts.isIdentifier(inner.expression) ||
    inner.arguments.length !== 1
  ) {
    return undefined;
  }
  const declaration = checker.getSymbolAtLocation(inner.expression)
    ?.declarations?.[0];
  return declaration &&
    ts.isFunctionDeclaration(declaration) &&
    declaration.name?.text === "encodeURIComponent" &&
    isLibDeclaration(declaration)
    ? inner.arguments[0]
    : undefined;
}

/** Each value's text when every value is a known text or a string literal type. */
function knownTexts(
  checker: ts.TypeChecker,
  values: SentValue[],
): string[] | undefined {
  const texts = values.flatMap((value) =>
    value.kind === "text"
      ? [value.text]
      : value.kind === "type"
        ? unionMembers(checker, value.type).map((part) =>
            part.isStringLiteral() ? part.value : undefined,
          )
        : [undefined],
  );
  return texts.every((text) => text !== undefined) ? texts : undefined;
}

// `new URL` resolves "." and ".." segments, and an unencoded "/", "\\", "?", "#" or "%" changes the URL itself (client.ts:38).
function pathTextUnverified(
  checker: ts.TypeChecker,
  source: string,
  values: SentValue[],
  encoded: boolean,
): string | undefined {
  const text = (knownTexts(checker, values) ?? []).find(
    (candidate) =>
      candidate === "." ||
      candidate === ".." ||
      (!encoded && /[/\\?#%]/.test(candidate)),
  );
  return text === undefined
    ? undefined
    : `${source} may be ${JSON.stringify(text)}, which new URL does not keep as one path segment (client.ts:38)`;
}

/** A template span's value after the template literal, or after `encodeURIComponent` when the span calls it. */
function spanValues(
  { checker }: ModelContext,
  expression: ts.Expression,
): Stringified & { encoded: boolean } {
  const argument = encodedArgument(checker, expression);
  const conversion: StringConversion = argument
    ? "encodeURIComponent"
    : "the template literal";
  return {
    ...stringifiedValues(
      checker,
      `\${${unwrap(expression).getText()}}`,
      [typeValue(checker.getTypeAtLocation(argument ?? unwrap(expression)))],
      `${conversion} applies String`,
      false,
    ),
    encoded: argument !== undefined,
  };
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
    values: defined.length
      ? withoutTypeFlags(checker, field.values, UNDEFINED)
      : field.values.filter((value) => value.kind !== "type"),
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
    const sent = stringifiedValues(
      checker,
      `:${slot.name}`,
      unique(values, (value) => valueKey(checker, value)),
      "utils.ts:180",
      false,
    );
    return {
      source: `:${slot.name}`,
      values: sent.values,
      notes: [...new Set([...notes, ...sent.notes])],
      unverified:
        unverified ??
        sent.unverified ??
        pathTextUnverified(checker, `:${slot.name}`, sent.values, true),
    };
  });
}

// A template literal converts a span with `String`, and `encodeURIComponent` does the same to its argument.
function spanParameter(
  context: ModelContext,
  expression: ts.Expression,
): SentPathParameter {
  const { values, notes, unverified, encoded } = spanValues(
    context,
    expression,
  );
  return {
    source: "template expression",
    values,
    notes,
    unverified:
      unverified ??
      pathTextUnverified(
        context.checker,
        `\${${unwrap(expression).getText()}}`,
        values,
        encoded,
      ),
  };
}

function pathParameters(
  context: ModelContext,
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
        ? spanParameter(context, slot.expression)
        : remaining.shift();
    if (parameter) {
      parameters.push(parameter);
    }
  }
  return { text, parameters };
}

interface QueryPiece {
  text: string;
  encoded: boolean;
}

/** The one text a URL slot in the query string is known to have, or why it isn't known. */
function queryPiece(
  context: ModelContext,
  slot: UrlSlot,
  tags: Map<string, SentPathParameter>,
  notes: string[],
): { piece: QueryPiece } | { unverified: string } {
  if (slot.kind === "text") {
    return { piece: { text: slot.text, encoded: false } };
  }
  const found =
    slot.kind === "tag"
      ? {
          values: tags.get(slot.name)?.values ?? [],
          notes: [],
          unverified: tags.get(slot.name)?.unverified,
          encoded: true,
          source: `:${slot.name}`,
        }
      : {
          ...spanValues(context, slot.expression),
          source: `\${${unwrap(slot.expression).getText()}}`,
        };
  notes.push(...found.notes);
  if (found.unverified) {
    return { unverified: found.unverified };
  }
  const [only, ...more] = knownTexts(context.checker, found.values) ?? [];
  return only !== undefined && !more.length
    ? { piece: { text: only, encoded: found.encoded } }
    : {
        unverified: `${found.source} is put into the URL template's query string, and the checker only reads a query string whose every value is one known text (client.ts:38)`,
      };
}

// `new URL` keeps the template's query string and parses it the way `URLSearchParams` does (client.ts:38).
function inlineQuery(
  context: ModelContext,
  query: UrlSlot[],
  tags: Map<string, SentPathParameter>,
): { fields: SentField[]; notes: string[]; unverified: string | undefined } {
  const notes: string[] = [];
  const pieces: QueryPiece[] = [];
  for (const slot of query) {
    const result = queryPiece(context, slot, tags, notes);
    if ("unverified" in result) {
      return { fields: [], notes, unverified: result.unverified };
    }
    pieces.push(result.piece);
  }
  const text = pieces
    .map((piece) =>
      piece.encoded ? encodeURIComponent(piece.text) : piece.text,
    )
    .join("");
  const [search, fragment] = [text.split("#")[0] ?? "", text.includes("#")];
  if (fragment) {
    notes.push(
      "the URL template's query string ends at #, and fetch does not send the fragment after it (client.ts:38)",
    );
  }
  return {
    fields: [...new URLSearchParams(search)].map(([name, value]) => ({
      name,
      values: [{ kind: "text", text: value }],
      optional: false,
      declaration: undefined,
    })),
    notes,
    unverified: undefined,
  };
}
