import type { Dayjs } from "dayjs";

import * as Metric from "cljs/metabase.lib_metric.js";
import * as Fixture from "cljs/metabase.util.malli.typescript.fixture";

const birdName: "bird" | "heron" = Fixture.bird_name;
const birdNames: readonly ("bird" | "heron")[] = Fixture.bird_names();
// @ts-expect-error generation-time expressions preserve their literal union
const otherBird: typeof Fixture.bird_name = "crow";
// @ts-expect-error expression metadata also applies inside native array schemas
const otherBirds: ReturnType<typeof Fixture.bird_names> = ["crow"];

declare const predicateValue: unknown;
if (Fixture.string_after_transform_QMARK_(predicateValue)) {
  const stringValue: string = predicateValue;
  // @ts-expect-error the transformed sequence predicate narrows to string, not number
  const numberValue: number = predicateValue;
  void stringValue;
  void numberValue;
}

declare const predicateObject: Parameters<
  typeof Fixture.bird_after_transform_QMARK_
>[0];
if (Fixture.bird_after_transform_QMARK_(predicateObject)) {
  const bird: "bird" = predicateObject.displayName;
  void bird;
}

Fixture.paired_arguments("text", 1);
Fixture.paired_arguments(1, "text");
// @ts-expect-error paired sequence alternatives reject Cartesian cross-pairs
Fixture.paired_arguments("text", "text");

const pairedCallback = Fixture.paired_callback();
pairedCallback("text", 1);
pairedCallback(1, "text");
// @ts-expect-error returned callables preserve whole correlated alternatives
pairedCallback(1, 1);

Fixture.accepts_nested({
  nested: { value: undefined },
  recursive: { child: undefined },
});
Fixture.accepts_wrapper_parity(
  { value: undefined },
  { value: undefined },
  [undefined],
  [undefined],
  { value: undefined },
  { value: undefined },
);

const nestedOutput = Fixture.nested_output();
const nestedNullValue: string | null = nestedOutput.value;
const nestedWithNull: Fixture.Metabase_Util_Malli_Typescript_Fixture_Nested = {
  value: null,
};
const nestedWithUndefined: Fixture.Metabase_Util_Malli_Typescript_Fixture_Nested =
  {
    // @ts-expect-error output aliases do not accept undefined
    value: undefined,
  };
void nestedNullValue;
void nestedWithNull;
void nestedWithUndefined;

const finiteKeys = Fixture.finite_keys();
const finiteValue: number | undefined = finiteKeys.one;
void finiteValue;
// @ts-expect-error finite dictionaries reject keys outside their literal union
finiteKeys.other;

const aliases = Fixture.fixture_aliases();
const safeOne = aliases[0];
// @ts-expect-error safe duplicate objects retain distinct phantom aliases
const safeTwo: Fixture.Metabase_Util_Malli_Typescript_Fixture_SafeTwo = safeOne;
void safeTwo;

const nullableOne: Fixture.Metabase_Util_Malli_Typescript_Fixture_NullableOne =
  null;
const nullableTwo: Fixture.Metabase_Util_Malli_Typescript_Fixture_NullableTwo =
  nullableOne;
void nullableTwo;

const tupleOne: Fixture.Metabase_Util_Malli_Typescript_Fixture_TupleOne = [
  null,
  1,
];
// @ts-expect-error object-like tuples retain distinct phantom aliases
const tupleTwo: Fixture.Metabase_Util_Malli_Typescript_Fixture_TupleTwo =
  tupleOne;
void tupleTwo;

const kindOne: Fixture.Metabase_Util_Malli_Typescript_Fixture_KindOne = {
  __kind: "runtime",
  value: "one",
};
const kindTwo: Fixture.Metabase_Util_Malli_Typescript_Fixture_KindTwo = kindOne;
void kindTwo;

const primitiveOne: Fixture.Metabase_Util_Malli_Typescript_Fixture_PrimitiveOne =
  "one";
const primitiveTwo: Fixture.Metabase_Util_Malli_Typescript_Fixture_PrimitiveTwo =
  primitiveOne;
void primitiveTwo;

const contextualIdentity = Fixture.contextual_identity();
const contextualOutput = contextualIdentity({ value: undefined });
contextualIdentity(contextualOutput);
const wrongContext = Fixture.context_two();
// @ts-expect-error contextual aliases preserve nominal schema identity
contextualIdentity(wrongContext);

const localGlobalCallback = Fixture.local_global_callback();
localGlobalCallback({ global: undefined });

// Metric factories accept omissions which native output represents as null or an absent key.
declare const relativeParts: NonNullable<
  ReturnType<typeof Metric.relativeDateFilterParts>
>;
Metric.relativeDateFilterClause({
  dimension: relativeParts.dimension,
  value: -2,
  unit: "second",
});
Metric.relativeDateFilterClause({
  ...relativeParts,
  offsetUnit: null,
  offsetValue: null,
});
Metric.relativeDateFilterClause({ ...relativeParts, unit: "millisecond" });
// @ts-expect-error interval units are canonical, not arbitrary strings
Metric.relativeDateFilterClause({ ...relativeParts, unit: "century" });
const offsetUnit: string | undefined = relativeParts.offsetUnit;
const offsetValue: number | null = relativeParts.offsetValue;
// @ts-expect-error the native converter omits an unset offset unit
const requiredOffsetUnit: string = relativeParts.offsetUnit;
// @ts-expect-error the native converter preserves a null offset value
const requiredOffsetValue: number = relativeParts.offsetValue;
const displayName: string | null | undefined =
  relativeParts.dimension["display-name"];
// @ts-expect-error dimensions retain their persistent-map keys, unlike outer JS parts
const camelDisplayName: string | null | undefined =
  relativeParts.dimension.displayName;
void offsetUnit;
void offsetValue;
void requiredOffsetUnit;
void requiredOffsetValue;
void displayName;
void camelDisplayName;

declare const dateParts: NonNullable<
  ReturnType<typeof Metric.specificDateFilterParts>
>;
const nativeDate: Date | null = dateParts.values[0];
// @ts-expect-error failed temporal conversion is null, not a fabricated Date
const requiredDate: Date = dateParts.values[0];
Metric.specificDateFilterClause({
  ...dateParts,
  values: [new Date(), "2024-01-15"],
});
declare const timeParts: NonNullable<ReturnType<typeof Metric.timeFilterParts>>;
const platformTime: Dayjs = timeParts.values[0];
// @ts-expect-error standalone times are Dayjs values at the CLJS boundary
const timeAsDate: Date = timeParts.values[0];
void nativeDate;
void requiredDate;
void platformTime;
void timeAsDate;

declare const numberParts: NonNullable<
  ReturnType<typeof Metric.numberFilterParts>
>;
Metric.numberFilterClause({ ...numberParts, values: [1, 1n] });
// @ts-expect-error numeric factories reject string-valued parts
Metric.numberFilterClause({ ...numberParts, values: ["1"] });

declare const stringParts: NonNullable<
  ReturnType<typeof Metric.stringFilterParts>
>;
Metric.stringFilterClause({ ...stringParts, options: undefined });
const requiredOptions: { caseSensitive?: boolean } | null = stringParts.options;
// @ts-expect-error options is always present at the native output boundary
const undefinedOptions: typeof stringParts.options = undefined;
void requiredOptions;
void undefinedOptions;

declare const excludeParts: NonNullable<
  ReturnType<typeof Metric.excludeDateFilterParts>
>;
Metric.excludeDateFilterClause({ ...excludeParts, unit: null });
// @ts-expect-error an unset native output unit is omitted, never null
const nullUnit: typeof excludeParts.unit = null;
void nullUnit;
