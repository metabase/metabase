import { t } from "ttag";
import _ from "underscore";

import type {
  ChangeShape,
  HistoryProfile,
  HistoryShape,
} from "metabase/metadata/table-structure";
import type { RowValue } from "metabase-types/api";

export type ExampleVersion = {
  key: string;
  attribute: string;
  validFrom: string;
  validTo: string | null;
};

export type ExampleSource = {
  keyName: string;
  attributeName: string;
  validFromName: string;
  validToName: string;
  versions: ExampleVersion[];
  currentTableName: string | null;
  factTableName: string | null;
};

export type ShapeExample = {
  columns: string[];
  rows: string[][];
  currentRowIndex: number | null;
  note: string | null;
};

const EXAMPLE_VERSION_COUNT = 3;
const OPEN_END = "—";

const formatValue = (value: RowValue | undefined) =>
  value == null || typeof value === "object" ? OPEN_END : String(value);

const formatDate = (value: string | null) =>
  value == null ? OPEN_END : value.slice(0, 10);

export function getMockExampleVersions(): ExampleVersion[] {
  return [
    {
      key: "1042",
      attribute: t`Starter`,
      validFrom: "2024-01-10",
      validTo: "2024-06-02",
    },
    {
      key: "1042",
      attribute: t`Pro`,
      validFrom: "2024-06-02",
      validTo: "2025-02-14",
    },
    {
      key: "1042",
      attribute: t`Enterprise`,
      validFrom: "2025-02-14",
      validTo: null,
    },
  ];
}

export function getProfileExampleVersions(
  profile: Pick<HistoryProfile, "columns" | "entities">,
): { attributeName: string; versions: ExampleVersion[] } | null {
  const attributeField = _.sortBy(
    profile.columns,
    (column) => -column.changeCount,
  )[0]?.field;
  if (attributeField == null) {
    return null;
  }
  const valuesOf = (versions: HistoryProfile["entities"][number]["versions"]) =>
    versions.map((version) => version.values[attributeField.name]);
  const changingEntities = profile.entities.filter(
    (entity) => _.uniq(valuesOf(entity.versions)).length > 1,
  );
  const entity =
    changingEntities.find(
      (entity) => entity.versions.length === EXAMPLE_VERSION_COUNT,
    ) ?? changingEntities[0];
  if (entity == null) {
    return null;
  }
  return {
    attributeName: attributeField.display_name,
    versions: entity.versions.slice(-EXAMPLE_VERSION_COUNT).map((version) => ({
      key: entity.key,
      attribute: formatValue(version.values[attributeField.name]),
      validFrom: formatDate(version.validFrom),
      validTo: version.validTo == null ? null : formatDate(version.validTo),
    })),
  };
}

export function getHistoryShapeExample(
  shape: HistoryShape,
  source: ExampleSource,
): ShapeExample {
  const { keyName, attributeName, validFromName, validToName, versions } =
    source;
  const latestIndex = versions.length - 1;
  const datedRows = (rows: ExampleVersion[]) =>
    rows.map((version) => [
      version.key,
      version.attribute,
      version.validFrom,
      version.validTo ?? OPEN_END,
    ]);

  switch (shape) {
    case "versions-with-dates":
      return {
        columns: [keyName, attributeName, validFromName, validToName],
        rows: datedRows(versions),
        currentRowIndex: latestIndex,
        note: null,
      };
    case "latest-row-per-key":
      return {
        columns: [keyName, attributeName, validFromName],
        rows: versions.map((version) => [
          version.key,
          version.attribute,
          version.validFrom,
        ]),
        currentRowIndex: latestIndex,
        note: null,
      };
    case "current-table":
      return {
        columns: [keyName, attributeName, validFromName, validToName],
        rows: datedRows(versions.slice(0, -1)),
        currentRowIndex: null,
        note: t`Today's row is in ${source.currentTableName ?? t`another table`}.`,
      };
    case "current-values": {
      const currentValue = versions[latestIndex]?.attribute ?? OPEN_END;
      return {
        columns: [
          keyName,
          attributeName,
          t`Current ${attributeName}`,
          validFromName,
        ],
        rows: versions.map((version) => [
          version.key,
          version.attribute,
          currentValue,
          version.validFrom,
        ]),
        currentRowIndex: latestIndex,
        note: null,
      };
    }
    case "fact-key":
      return {
        columns: [source.factTableName ?? t`Fact`, keyName, t`Date`],
        rows: versions.map((version, index) => [
          `#${index + 1}`,
          version.key,
          version.validFrom,
        ]),
        currentRowIndex: null,
        note: t`Each row can use the ${attributeName} at its date, or today's.`,
      };
  }
}

export function getChangeShapeExample(
  shape: ChangeShape,
  {
    keyName,
    attributeName,
    previousAttributeName,
  }: { keyName: string; attributeName: string; previousAttributeName: string },
): ShapeExample {
  const key = "1042";
  if (shape === "overwritten") {
    return {
      columns: [keyName, attributeName],
      rows: [[key, t`New value`]],
      currentRowIndex: null,
      note: t`The old value is gone.`,
    };
  }
  return {
    columns: [keyName, attributeName, previousAttributeName],
    rows: [[key, t`New value`, t`Old value`]],
    currentRowIndex: null,
    note: null,
  };
}
