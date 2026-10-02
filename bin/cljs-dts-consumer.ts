import * as Lib from "cljs/metabase.lib.js";
import type * as Shared from "cljs/metabase.lib.shared";
import * as Isa from "cljs/metabase.lib.types.isa";
import type * as Metric from "cljs/metabase.lib_metric.js";
import type * as Pivot from "cljs/metabase.pivot.js";
import type * as Fixture from "cljs/metabase.util.malli.typescript.fixture";

declare const specializedColumn: Shared.Metabase_Lib_Schema_Metadata_Column & {
  exact: "source";
};

const rebinnedColumn = Lib.with_binning(specializedColumn, null);
// @ts-expect-error transforms do not preserve arbitrary input properties
const exact: "source" = rebinnedColumn.exact;
void exact;

declare const reference: Shared.Input_Metabase_Lib_Schema_Ref_Ref;
const rebinnedReference: Shared.Metabase_Lib_Schema_Ref_Ref = Lib.with_binning(
  reference,
  null,
);
const temporalReference: Shared.Metabase_Lib_Schema_Ref_Ref =
  Lib.with_temporal_bucket(reference, null);
// @ts-expect-error a reference transformation does not return metadata
const referenceAsMetadata: Shared.Metabase_Lib_Schema_Metadata_Column =
  Lib.with_binning(reference, null);
void rebinnedReference;
void temporalReference;
void referenceAsMetadata;

declare const completeJoin: Shared.Input_Metabase_Lib_Schema_Join_Join;
declare const partialJoin: Shared.Input_Metabase_Lib_Join_Util_PartialJoin;
declare const joinStrategy: Shared.Metabase_Lib_Schema_Join_StrategyOption;
const completeJoinWithStrategy: Shared.Metabase_Lib_Schema_Join_Join =
  Lib.with_join_strategy(completeJoin, joinStrategy);
const partialJoinWithStrategy: Shared.Metabase_Lib_Join_Util_PartialJoin =
  Lib.with_join_strategy(partialJoin, joinStrategy);
Lib.with_join_fields(partialJoin, "all");
Lib.with_join_conditions(partialJoin, []);
const unrelatedObject = { unrelated: true };
// @ts-expect-error join transforms reject unrelated first arguments
Lib.with_join_strategy(unrelatedObject, joinStrategy);
// @ts-expect-error join transforms reject unrelated first arguments
Lib.with_join_fields(unrelatedObject, "all");
// @ts-expect-error join transforms reject unrelated first arguments
Lib.with_join_conditions(unrelatedObject, []);
void completeJoinWithStrategy;
void partialJoinWithStrategy;

declare const expressionClause: [string, object, ...unknown[]];
Lib.with_expression_name(expressionClause, "renamed");
// @ts-expect-error expression naming rejects unrelated objects
Lib.with_expression_name(unrelatedObject, "renamed");

declare const typeInfoOrNull: Fixture.Metabase_Util_Malli_Typescript_Fixture_TypeInfo | null;
if (!Isa.numeric_QMARK_(typeInfoOrNull)) {
  // @ts-expect-error a false category result can still be TypeInfo
  const nullOnly: null = typeInfoOrNull;
  void nullOnly;
}

declare const pivot: Extract<
  Shared.Metabase_Lib_Schema_DrillThru_DrillThru,
  { type: "drill-thru/pivot" }
>;
const categoryPivots = pivot.pivots.category;
// @ts-expect-error generated finite dictionaries reject keys outside the schema
pivot.pivots.other;
void categoryPivots;

declare const pivotTable: ReturnType<typeof Pivot.process_pivot_table>;
pivotTable.getRowSection(0, 0);
// @ts-expect-error nested generated callables preserve their numeric parameters
pivotTable.getRowSection("row", 0);

const maybeBinning = Lib.binning(specializedColumn);
// @ts-expect-error generated nullable outputs require a null check
const binningStrategy: Shared.Metabase_Lib_Schema_Binning_Binning =
  maybeBinning;
void binningStrategy;

declare const filterValue: NonNullable<
  ReturnType<typeof Metric.numberFilterParts>
>["values"][number];
const numberOrBigint: number | bigint = filterValue;
void numberOrBigint;
