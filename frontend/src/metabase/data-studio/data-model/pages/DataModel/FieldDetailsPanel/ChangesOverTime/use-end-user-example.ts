import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import {
  type HistoryBinding,
  type HistoryEntity,
  type PastValuesBinding,
  findFieldById,
  useHistoryProfile,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  Dataset,
  Field,
  RowValue,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";

export type ExampleEvent = {
  id: string;
  date: string;
  valueThen: string;
  valueNow: string;
};

export type EndUserExample =
  | { status: "loading" }
  | { status: "unavailable" }
  | {
      status: "ready";
      entityLabel: string;
      changedOn: string;
      before: string;
      after: string;
      events: ExampleEvent[];
    };

type ExampleInput = {
  binding: PastValuesBinding;
  historyTable: Table | undefined;
  valueField: Field | undefined;
  dimensionTable: Table | undefined;
  factTable: Table | undefined;
  fkField: Field | undefined;
  eventDateField: Field | undefined;
};

const FACT_ROW_LIMIT = 2000;
const LABEL_RE = /(^|_)(name|title|display_name)$/;

const toText = (value: RowValue | undefined) =>
  value == null ? "" : String(value);

const toDay = (value: string) => value.slice(0, 10);

function toHistoryBinding(binding: PastValuesBinding): HistoryBinding {
  return {
    durableKeyFieldId: binding.keyFieldId,
    validFromFieldId: binding.validFromFieldId,
    validToFieldId: binding.validToFieldId,
    currentFlagFieldId: null,
    versionFieldId: null,
    currentRowsOnly: false,
  };
}

type Change = {
  entity: HistoryEntity;
  changedOn: string;
  before: string;
  after: string;
};

function findLatestChange(
  entities: HistoryEntity[],
  valueField: Field,
): Change | undefined {
  const changes = entities.flatMap((entity) =>
    entity.versions.flatMap((version, index) => {
      const previous = entity.versions[index - 1];
      const before = toText(previous?.values[valueField.name]);
      const after = toText(version.values[valueField.name]);
      const isChange =
        previous != null && version.validFrom != null && before !== after;
      return isChange && version.validFrom != null
        ? [{ entity, changedOn: toDay(version.validFrom), before, after }]
        : [];
    }),
  );
  return _.last(_.sortBy(changes, (change) => change.changedOn));
}

const toFilterValue = (key: string) => (/^\d+$/.test(key) ? Number(key) : key);

function getFactQuery(
  input: ExampleInput,
  change: Change | undefined,
): StructuredDatasetQuery | typeof skipToken {
  const { factTable, fkField, eventDateField } = input;
  if (!factTable || !fkField || !eventDateField || !change) {
    return skipToken;
  }
  return {
    database: factTable.db_id,
    type: "query",
    query: {
      "source-table": factTable.id,
      filter: [
        "=",
        ["field", getRawTableFieldId(fkField), null],
        toFilterValue(change.entity.key),
      ],
      "order-by": [
        ["asc", ["field", getRawTableFieldId(eventDateField), null]],
      ],
      limit: FACT_ROW_LIMIT,
    },
  };
}

function getLabelQuery(
  dimensionTable: Table | undefined,
  change: Change | undefined,
): StructuredDatasetQuery | typeof skipToken {
  const pk = dimensionTable?.fields?.find(isPK);
  if (!dimensionTable || !pk || !change) {
    return skipToken;
  }
  return {
    database: dimensionTable.db_id,
    type: "query",
    query: {
      "source-table": dimensionTable.id,
      filter: [
        "=",
        ["field", getRawTableFieldId(pk), null],
        toFilterValue(change.entity.key),
      ],
      limit: 1,
    },
  };
}

function readColumn(dataset: Dataset | undefined, field: Field | undefined) {
  const index = dataset?.data.cols.findIndex(
    (col) => field != null && col.name === field.name,
  );
  return (row: RowValue[]) =>
    index == null || index < 0 ? undefined : row[index];
}

function readLabel(dataset: Dataset | undefined) {
  const col = dataset?.data.cols.find((col) =>
    LABEL_RE.test(col.name.toLowerCase()),
  );
  const row = dataset?.data.rows[0];
  if (!col || !row || !dataset) {
    return undefined;
  }
  return toText(row[dataset.data.cols.indexOf(col)]);
}

function pickEvents(
  dataset: Dataset | undefined,
  input: ExampleInput,
  change: Change,
): ExampleEvent[] {
  const pk = input.factTable?.fields?.find(isPK);
  const readId = readColumn(dataset, pk);
  const readDate = readColumn(dataset, input.eventDateField);
  const rows = (dataset?.data.rows ?? []).map((row) => ({
    id: toText(readId(row)),
    date: toText(readDate(row)),
  }));
  const before = _.last(
    rows.filter((row) => toDay(row.date) < change.changedOn),
  );
  const after = rows.find((row) => toDay(row.date) >= change.changedOn);
  return [
    ...(before
      ? [{ ...before, date: toDay(before.date), valueThen: change.before }]
      : []),
    ...(after
      ? [{ ...after, date: toDay(after.date), valueThen: change.after }]
      : []),
  ].map((event) => ({ ...event, valueNow: change.after }));
}

/**
 * Real rows that show what grouping a fact table by a changing attribute
 * returns: two events by one entity, from before and after its latest change.
 */
export function useEndUserExample(input: ExampleInput): EndUserExample {
  const { binding, historyTable, valueField } = input;
  const isBound =
    binding.source === "history-table" &&
    historyTable != null &&
    valueField != null &&
    findFieldById(historyTable, binding.keyFieldId) != null;
  const profileState = useHistoryProfile(
    historyTable ?? { db_id: 0, id: 0, fields: [] },
    toHistoryBinding(binding),
    { skip: !isBound },
  );
  const change =
    isBound && profileState.status === "loaded" && valueField
      ? findLatestChange(profileState.profile.entities, valueField)
      : undefined;
  const { data: facts, isFetching: isFetchingFacts } = useGetAdhocQueryQuery(
    getFactQuery(input, change),
  );
  const { data: labels } = useGetAdhocQueryQuery(
    getLabelQuery(input.dimensionTable, change),
  );

  if (!isBound || profileState.status === "error") {
    return { status: "unavailable" };
  }
  if (profileState.status !== "loaded" || isFetchingFacts) {
    return { status: "loading" };
  }
  if (!change) {
    return { status: "unavailable" };
  }
  return {
    status: "ready",
    entityLabel: readLabel(labels) ?? change.entity.label ?? change.entity.key,
    changedOn: change.changedOn,
    before: change.before,
    after: change.after,
    events: pickEvents(facts, input, change),
  };
}
