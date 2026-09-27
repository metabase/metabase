import { t } from "ttag";

import { skipToken } from "metabase/api";
import { type TableShapeChip, useGetTableShapesQuery } from "metabase/api/jev";
import { Badge, Button, Group, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

interface TableUsageChipsProps {
  query: Lib.Query;
  stageIndex: number;
  tableId: number | null;
  updateQuery: (query: Lib.Query) => Promise<void>;
}

/** Resolve one of a table's columns by its field name (chips carry the field name, not a Lib ref). */
function columnByName(
  columns: Lib.ColumnMetadata[],
  query: Lib.Query,
  stageIndex: number,
  name: string,
): Lib.ColumnMetadata | undefined {
  return columns.find(
    (col) => Lib.displayInfo(query, stageIndex, col).name === name,
  );
}

const DATE_RANGE_SHAPES = new Set([
  "date-range",
  "date-threshold",
  "date-exact",
]);

/** Turn a clicked chip into a real query change, or return the query unchanged if it can't apply. */
function applyChip(
  query: Lib.Query,
  stageIndex: number,
  chip: TableShapeChip,
): Lib.Query {
  if (chip.kind === "aggregation" && chip.shape === "count") {
    return Lib.aggregateByCount(query, stageIndex);
  }

  if (chip.kind === "breakout" && chip.field) {
    const column = columnByName(
      Lib.breakoutableColumns(query, stageIndex),
      query,
      stageIndex,
      chip.field.name,
    );
    if (column) {
      // chip.shape carries the temporal unit ("month", "day", …); pick the matching bucket.
      const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);
      const bucket = buckets.find(
        (b) => Lib.displayInfo(query, stageIndex, b).shortName === chip.shape,
      );
      const bucketedColumn = bucket
        ? Lib.withTemporalBucket(column, bucket)
        : column;
      return Lib.breakout(query, stageIndex, bucketedColumn);
    }
  }

  if (
    chip.kind === "filter" &&
    chip.field &&
    DATE_RANGE_SHAPES.has(chip.shape)
  ) {
    const column = columnByName(
      Lib.filterableColumns(query, stageIndex),
      query,
      stageIndex,
      chip.field.name,
    );
    if (column) {
      const clause = Lib.relativeDateFilterClause({
        column,
        value: -30,
        unit: "day",
        offsetValue: null,
        offsetUnit: null,
        options: {},
      });
      return Lib.filter(query, stageIndex, clause);
    }
  }

  return query;
}

/**
 * Collective "what people do on this table" starter chips, learned from behavior (value-free shapes).
 * A quick prove-it surface for the intent model: after you pick a table, show the typical filters /
 * aggregations / groupings; clicking Count actually drives the query.
 */
export const TableUsageChips = ({
  query,
  stageIndex,
  tableId,
  updateQuery,
}: TableUsageChipsProps) => {
  const { data } = useGetTableShapesQuery(tableId ?? skipToken);

  const chips = data?.chips ?? [];

  if (chips.length === 0) {
    return null;
  }

  const handleChip = (chip: TableShapeChip) => {
    const nextQuery = applyChip(query, stageIndex, chip);
    if (nextQuery !== query) {
      updateQuery(nextQuery);
    }
  };

  return (
    <Group gap="xs" mt="sm" wrap="wrap" align="center">
      <Icon name="sparkles" c="brand" size={14} />
      <Text size="sm" c="text-secondary">{t`People usually:`}</Text>
      {chips.map((chip, index) => (
        <Button
          key={`${chip.kind}-${chip.shape}-${index}`}
          size="sm"
          variant="light"
          leftSection={<Icon name="add" size={12} />}
          onClick={() => handleChip(chip)}
          rightSection={
            <Badge size="xs" variant="light" color="neutral">
              {chip.count}
            </Badge>
          }
        >
          {chip.label}
        </Button>
      ))}
    </Group>
  );
};
