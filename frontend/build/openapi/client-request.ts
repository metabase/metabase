import ts from "typescript";

import type { RtkRequest, TagSlot, UrlSlot } from "./rtk-request";
import { type Shape, describeShape } from "./shape";
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
  type StringConversion,
  type StringPart,
  isAugmentedLibType,
  isLibDeclaration,
  isLibType,
  isPrototypeMember,
  jsonView,
  keepsType,
  stringParts,
} from "./value-conversion";

// `frontend/src/metabase/api/api.ts:22`
const RTK_CACHE_KEY = "__rtkCacheKey";
const REQUEST_FIELDS = ["url", "method", "params", "body"];

const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const UNDEFINED = ts.TypeFlags.Undefined | ts.TypeFlags.Void;

/**
 * One value a field may hold: what `JSON.stringify` writes for a type, or a known text.
 * `itemOf` is the array type when the value is sent once for each of its items.
 */
export type SentValue =
  | { kind: "json"; view: Shape; itemOf?: ts.Type }
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
      /** The frontend type the fields were read from, if they weren't assembled by the model. */
      declared: ts.Type | undefined;
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
}

interface PayloadPair {
  params: Payload;
  body: Payload;
}

interface ModelContext {
  checker: ts.TypeChecker;
  at: ts.Node;
}

const NOTHING: Payload = { kind: "nothing" };

export function modelClientRequest(
  checker: ts.TypeChecker,
  rtk: RtkRequest,
  at: ts.Node,
): ClientRequest {
  const context: ModelContext = { checker, at };
  const { method } = rtk;
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
  const { pathSlots, query, tags } = rtk.url;
  const { parameters: tagParameters, unverified: tagUnverified } =
    substituteTags(context, tags, pairs);
  const parameters = pathParameters(context, pathSlots, tagParameters);

  const inline = inlineQuery(query);
  queryNotes.push(...inline.notes);
  if (inline.fields.length) {
    queryNotes.push(
      "the URL template's inline query string is kept by new URL (ApiClient.buildUrl)",
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
  };

  const queryVariants: SentPayload[] = [];
  const bodyVariants: SentPayload[] = [];
  for (const pair of pairs) {
    let sentQuery = sendAsQuery(context, pair.params, queryNotes, onUnverified);
    if (foldsBody) {
      sentQuery = mergeQueryPayloads(
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
    sentQuery = mergeQueryPayloads(inlinePayload, sentQuery, onUnverified);
    queryVariants.push(finishPayload(checker, sentQuery, "query"));
  }
  if (foldsBody) {
    queryNotes.push(
      ...bodyNotes.splice(0),
      "a GET body is sent as query parameters, so it is compared with the backend query (ApiClient._prepareRequest)",
    );
    bodyNotes.push(
      "a GET body is sent as query parameters, so no request body is sent (ApiClient._prepareRequest)",
    );
  }

  return {
    method,
    path: rtk.url.path,
    pathParameters: parameters,
    query: {
      variants: queryVariants,
      notes: [...new Set(queryNotes)],
      unverified: queryUnverified,
      // A query with no keys is always possible, so nothing about it is certain.
      alwaysSent: false,
    },
    body: {
      variants: bodyVariants,
      notes: [...new Set(bodyNotes)],
      unverified: foldsBody ? undefined : body.unverified,
      alwaysSent: !foldsBody && body.alwaysSent,
    },
    failure: body.failure,
    unverified: extraOptionsUnverified(rtk) ?? tagUnverified,
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

function typeValue(type: ts.Type, itemOf?: ts.Type): SentValue {
  return {
    kind: "json",
    view: { kind: "type", type },
    ...(itemOf ? { itemOf } : {}),
  };
}

/** The type a value still has, when `JSON.stringify` writes it unchanged. */
function plainType(value: SentValue): ts.Type | undefined {
  return value.kind === "json" && value.view.kind === "type"
    ? value.view.type
    : undefined;
}

function valueTypes(values: SentValue[]): ts.Type[] {
  return values.flatMap((value) => {
    if (value.kind !== "json") {
      return [];
    }
    const { view } = value;
    if (view.kind === "type") {
      return [view.type];
    }
    return "from" in view && view.from ? [view.from] : [];
  });
}

function isItem(value: SentValue): boolean {
  return value.kind !== "empty" && value.itemOf !== undefined;
}

function valueKey(checker: ts.TypeChecker, value: SentValue): string {
  if (value.kind === "empty") {
    return "empty";
  }
  const item = value.itemOf
    ? `item of ${typeText(checker, value.itemOf)}:`
    : "";
  return value.kind === "json"
    ? `${item}json:${describeShape(checker, value.view)}`
    : `${item}text:${value.text}`;
}

function describeValue(checker: ts.TypeChecker, value: SentValue): string {
  switch (value.kind) {
    case "json":
      return describeShape(checker, value.view);
    case "text":
      return JSON.stringify(value.text);
    case "empty":
      return '""';
  }
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
 * The fields the client's spread copy of `type` has (ApiClient._resolveOptions).
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
    unverified: `the ${channel} is copied with { ...value } before it is sent, and ${reason} (ApiClient._resolveOptions)`,
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
  // BaseQueryArgs types params as an object, null or void, so only a body reaches these.
  if (
    !isObjectLike(type) ||
    checker.isArrayType(type) ||
    checker.isTupleType(type)
  ) {
    return unverified(
      `the checker does not model the copy of a ${typeText(checker, type)}`,
    );
  }
  if (isAugmentedLibType(type)) {
    return unverified(
      "the checker does not model own properties of an augmented library type",
    );
  }
  if (!type.isIntersection() && isLibType(type)) {
    return unverified(
      `a ${typeText(checker, type)} keeps its data behind prototype accessors`,
    );
  }
  if (channel === "body" && checker.getPropertyOfType(type, "toJSON")) {
    return unverified("a toJSON method may replace the whole body");
  }
  const own = properties(type).filter(
    (property) => !isPrototypeMember(property),
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
        ? `${channel === "params" ? "the query parameters come" : "the body comes"} from the object rest ${expression.getText()}, which has no declared properties and carries whatever keys the caller passed beyond the destructured ones (${channel === "params" ? "appendQueryParameters" : "JSON.stringify"})`
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
    },
    notes: dropped.map(
      (property) =>
        `${property.name} is a method or accessor, which { ...value } and JSON.stringify both leave out (ApiClient._resolveOptions)`,
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
  const dropped = members.filter((member) => member.flags & NULLISH);
  const copied = members
    .filter((member) => !(member.flags & NULLISH))
    .map((member) => typePayload(context, member, expression, "params"));
  const notes = [
    ...dropped.map(
      (member) =>
        `${typeText(checker, member)} in the frontend params sends no query parameters (baseQuery)`,
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
  const symbol = checker.resolveName(name, at, ts.SymbolFlags.Interface, false);
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
  // A non-GET body that is not undefined is always sent, as JSON or as-is (ApiClient._prepareRequest).
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
        });
        notes.push(
          "a null body is sent as the JSON object {} (ApiClient._resolveOptions and _prepareRequest)",
        );
      }
    } else if (raw) {
      if (method === "GET") {
        payloads.push(NOTHING);
        notes.push(
          `a ${raw.name} body is not sent with a GET request (ApiClient._prepareRequest)`,
        );
      } else {
        payloads.push({ kind: "type", type: member });
        unverified = `a ${raw.name} body is sent as-is (ApiClient._prepareRequest), and its fields are appended at runtime`;
      }
    } else if (checker.isArrayType(member) || checker.isTupleType(member)) {
      failure =
        "the client throws before sending an array body (ApiClient._prepareRequest)";
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
    `${RTK_CACHE_KEY} is removed from the ${channel} before sending (stripRtkCacheKey)`,
  );
  return {
    ...payload,
    fields: payload.fields.filter((field) => field.name !== RTK_CACHE_KEY),
  };
}

function withoutTypeFlags(
  checker: ts.TypeChecker,
  values: SentValue[],
  removed: ts.TypeFlags,
): SentValue[] {
  return values.flatMap((value): SentValue[] => {
    const type = plainType(value);
    if (!type) {
      return [value];
    }
    const all = unionMembers(checker, type);
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
      ? [typeValue(checker.getNonNullableType(type))]
      : kept.map((member) => typeValue(member));
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
    return typeValue(part.type, itemOf);
  };
  const converted = found.flatMap((value): SentValue[] => {
    const type = plainType(value);
    if (!type || value.kind === "empty" || value.itemOf) {
      return [value];
    }
    const parts = unionMembers(checker, type);
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
    const unchanged = results.every((result, index) => {
      const [only] = result;
      return (
        result.length === 1 &&
        only !== undefined &&
        only.kind !== "empty" &&
        !only.itemOf &&
        plainType(only) === parts[index]
      );
    });
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
  mapField: (field: SentField) => SentField | undefined,
  mapIndexValues: (values: SentValue[]) => SentValue[],
): Payload {
  if (payload.kind !== "fields") {
    return payload;
  }
  const fields = payload.fields.flatMap((field) => {
    const mapped = mapField(field);
    return mapped ? [mapped] : [];
  });
  const indexes = payload.indexes.map((index) => ({
    ...index,
    values: mapIndexValues(index.values),
  }));
  return { ...payload, fields, indexes };
}

// `appendQueryParameters` skips a null or undefined value and appends an array item by item,
// so neither kind of value is guaranteed to put its key in the query string (appendQueryParameters).
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
      const other = field.values.filter((value) => !plainType(value));
      const described = `${field.name} (${describeValues(checker, field.values)})`;
      if (!kept.length && !other.length) {
        notes.push(
          `${described} is null or undefined, so it is not sent (appendQueryParameters)`,
        );
        return undefined;
      }
      const hasNull = types.some((type) => type.flags & ts.TypeFlags.Null);
      const nullish = kept.length < types.length;
      const emptyArray = kept.some((type) => mayBeEmptyArray(checker, type));
      if (hasNull || (nullish && !field.optional)) {
        notes.push(
          `${described} is not sent when it is null or undefined (appendQueryParameters)`,
        );
      }
      if (emptyArray && !field.optional) {
        notes.push(
          `${described} is not sent when its array is empty (appendQueryParameters)`,
        );
      }
      const optional = field.optional || nullish || emptyArray;
      const present = withoutTypeFlags(checker, field.values, NULLISH);
      const sent = stringifiedValues(
        checker,
        field.name,
        present,
        "appendQueryParameters",
        true,
      );
      notes.push(...sent.notes);
      if (sent.unverified) {
        onUnverified(sent.unverified);
      }
      return { ...field, values: sent.values, optional };
    },
    (values) => {
      const present = values.flatMap((value) => {
        const type = plainType(value);
        return type
          ? unionMembers(checker, type)
              .filter((member) => !(member.flags & NULLISH))
              .map((member) => typeValue(member))
          : [value];
      });
      const sent = stringifiedValues(
        checker,
        "[key]",
        present,
        "appendQueryParameters",
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

function jsonValues(
  { checker }: ModelContext,
  values: SentValue[],
  notes: string[],
): SentValue[] {
  return values.map((value) => {
    const type = plainType(value);
    if (!type) {
      return value;
    }
    const view = jsonView(checker, type);
    if (view.kind === "type" && view.type === type) {
      return value;
    }
    notes.push(
      "body fields are compared after JSON.stringify conversion (JSON.stringify)",
    );
    return { kind: "json", view };
  });
}

// `JSON.stringify` leaves out a property whose value is undefined (JSON.stringify).
function sendAsJson(
  context: ModelContext,
  payload: Payload,
  notes: string[],
): Payload {
  const { checker } = context;
  return mapFields(
    payload,
    (field) => {
      const described = `${field.name} (${describeValues(checker, field.values)})`;
      const types = valueTypes(field.values).flatMap((type) =>
        unionMembers(checker, type),
      );
      const kept = types.filter(
        (type) =>
          !(type.flags & (UNDEFINED | ts.TypeFlags.ESSymbolLike)) &&
          !type.getCallSignatures().length,
      );
      if (!kept.length) {
        notes.push(
          `${described} has no JSON value, so JSON.stringify leaves it out of the body (JSON.stringify)`,
        );
        return undefined;
      }
      if (kept.length === types.length) {
        return {
          ...field,
          values: jsonValues(context, field.values, notes),
        };
      }
      notes.push(
        `${described} is left out of the body when its value cannot be serialised (JSON.stringify)`,
      );
      return {
        ...field,
        values: jsonValues(
          context,
          kept.map((type) => typeValue(type)),
          notes,
        ),
        optional: true,
      };
    },
    (values) => jsonValues(context, values, notes),
  );
}

function mergeQueryPayloads(
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
  onUnverified(
    "query parameters come from more than one source, which the checker does not model (ApiClient._prepareRequest)",
  );
  return first;
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
  const fields = describeFields(checker, payload.fields);
  const declared = payload.declared && typeText(checker, payload.declared);
  return {
    kind: "fields",
    description:
      declared && declared !== fields
        ? `${declared} sent as ${fields}`
        : fields,
    declared: payload.declared,
    fields: payload.fields,
    indexes: payload.indexes,
  };
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
    ? "extraOptions is spread over the request after url, method, params and body (baseQuery)"
    : undefined;
}

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

function knownTexts(
  checker: ts.TypeChecker,
  values: SentValue[],
): string[] | undefined {
  const texts = values.flatMap((value) => {
    if (value.kind === "text") {
      return [value.text];
    }
    const type = plainType(value);
    return type
      ? unionMembers(checker, type).map((part) =>
          part.isStringLiteral() ? part.value : undefined,
        )
      : [undefined];
  });
  return texts.every((text) => text !== undefined) ? texts : undefined;
}

// `new URL` resolves "." and ".." segments, and an unencoded "/", "\\", "?", "#" or "%" changes the URL itself (ApiClient.buildUrl).
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
    : `${source} may be ${JSON.stringify(text)}, which new URL does not keep as one path segment (ApiClient.buildUrl)`;
}

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

function substituteTag(
  checker: ts.TypeChecker,
  name: string,
  { params, body }: PayloadPair,
): Omit<SentPathParameter, "source"> & PayloadPair {
  const field =
    params.kind === "fields"
      ? params.fields.find((field) => field.name === name)
      : undefined;
  const values = field
    ? withoutTypeFlags(checker, field.values, UNDEFINED)
    : [];
  const mayBeMissing =
    !field ||
    field.optional ||
    valueTypes(field.values).some((type) =>
      unionMembers(checker, type).some(
        (part) => (part.flags & UNDEFINED) !== 0,
      ),
    );
  const unknownKeys =
    params.kind === "type" ||
    (params.kind === "fields" &&
      !field &&
      params.indexes.some((index) =>
        checker.isTypeAssignableTo(
          checker.getStringLiteralType(name),
          index.keyType,
        ),
      ));
  if (unknownKeys || (mayBeMissing && !isEmpty(body))) {
    return {
      values: [],
      notes: [],
      unverified: `:${name} may be supplied by runtime keys or the body, which the checker does not model (substituteUrlTags)`,
      params,
      body,
    };
  }
  return {
    values: [...values, ...(mayBeMissing ? [{ kind: "empty" } as const] : [])],
    notes: [
      `:${name} is filled from params.${name}, or becomes an empty string when it has no defined value (substituteUrlTags)`,
    ],
    unverified: undefined,
    params:
      params.kind === "fields"
        ? {
            ...params,
            fields: params.fields.filter((field) => field.name !== name),
          }
        : params,
    body,
  };
}

// Tags are substituted in URL order, and each one can consume a key a later tag would read.
function substituteTags(
  { checker }: ModelContext,
  tags: TagSlot[],
  pairs: PayloadPair[],
): { parameters: SentPathParameter[]; unverified: string | undefined } {
  let unsupported: string | undefined;
  const parameters = tags.map((slot) => {
    const values: SentValue[] = [];
    const notes: string[] = [];
    let unverified: string | undefined;
    for (const pair of pairs) {
      const substituted = substituteTag(checker, slot.name, pair);
      values.push(...substituted.values);
      notes.push(...substituted.notes);
      unverified ??= substituted.unverified;
      unsupported ??= substituted.unverified;
      pair.params = substituted.params;
      pair.body = substituted.body;
    }
    const sent = stringifiedValues(
      checker,
      `:${slot.name}`,
      unique(values, (value) => valueKey(checker, value)),
      "substituteUrlTags",
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
  return { parameters, unverified: unsupported };
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
): SentPathParameter[] {
  const remaining = [...tags];
  const parameters: SentPathParameter[] = [];
  for (const slot of path) {
    if (slot.kind === "text") {
      continue;
    }
    const parameter: SentPathParameter | undefined =
      slot.kind === "span"
        ? spanParameter(context, slot.expression)
        : remaining.shift();
    if (parameter) {
      parameters.push(parameter);
    }
  }
  return parameters;
}

function inlineQuery(query: UrlSlot[]): {
  fields: SentField[];
  notes: string[];
  unverified: string | undefined;
} {
  if (query.some((slot) => slot.kind !== "text")) {
    return {
      fields: [],
      notes: [],
      unverified:
        "the checker does not model a dynamic inline query string (ApiClient.buildUrl)",
    };
  }
  const text = query
    .map((slot) => (slot.kind === "text" ? slot.text : ""))
    .join("");
  const search = text.split("#")[0] ?? "";
  const fields: SentField[] = [];
  const names = new Set<string>();
  for (const [name, value] of new URLSearchParams(search)) {
    if (names.has(name)) {
      return {
        fields: [],
        notes: [],
        unverified: `${name} is repeated in the inline query string, and the checker does not model repeated keys`,
      };
    }
    names.add(name);
    fields.push({
      name,
      values: [{ kind: "text", text: value }],
      optional: false,
      declaration: undefined,
    });
  }
  return {
    fields,
    notes: text.includes("#")
      ? ["fetch does not send the URL fragment (ApiClient.buildUrl)"]
      : [],
    unverified: undefined,
  };
}
