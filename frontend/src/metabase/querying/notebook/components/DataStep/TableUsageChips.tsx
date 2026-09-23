import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useGetTableShapesQuery } from "metabase/api/jev";
import { Badge, Button, Group, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

interface TableUsageChipsProps {
  query: Lib.Query;
  stageIndex: number;
  tableId: number | null;
  updateQuery: (query: Lib.Query) => Promise<void>;
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

  const handleCount = () => {
    updateQuery(Lib.aggregateByCount(query, stageIndex));
  };

  return (
    <Group gap="xs" mt="sm" wrap="wrap" align="center">
      <Icon name="sparkles" c="brand" size={14} />
      <Text size="sm" c="text-secondary">{t`People usually:`}</Text>
      {chips.map((chip, index) => {
        const isCount = chip.kind === "aggregation" && chip.shape === "count";
        return (
          <Button
            key={`${chip.kind}-${chip.shape}-${index}`}
            size="xs"
            variant="light"
            leftSection={<Icon name="add" size={12} />}
            onClick={isCount ? handleCount : undefined}
            rightSection={
              <Badge size="xs" variant="light" color="neutral">
                {chip.count}
              </Badge>
            }
          >
            {chip.label}
          </Button>
        );
      })}
    </Group>
  );
};
