import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Box, Button, Flex, Icon, Text } from "metabase/ui";
import { formatValue } from "metabase/value-formatting";
import * as Lib from "metabase-lib";
import type { Dataset } from "metabase-types/api";

import { getGroupingSuggestions } from "../../utils/formula-suggestions";

import S from "./DatasetExplorer.module.css";

const SKELETON_ROW_COUNT = 6;

/**
 * A table-shaped placeholder shown until the summary has a grouping. Each
 * calculation is a column with its overall total, and the rows zone offers
 * groupings from the table, so it's clear what goes where.
 */
export function ResultSkeleton({
  query,
  result,
  onQueryChange,
}: {
  query: Lib.Query;
  result: Dataset | undefined;
  onQueryChange: (query: Lib.Query) => void;
}) {
  const aggregationNames = Lib.aggregations(query, -1).map(
    (aggregation) => Lib.displayInfo(query, -1, aggregation).displayName,
  );
  const groupings = useMemo(() => getGroupingSuggestions(query), [query]);
  const totals = result?.data?.rows?.[0];
  const valueColumnCount = Math.max(aggregationNames.length, 1);
  const valueColumns = {
    gridTemplateColumns: `repeat(${valueColumnCount}, minmax(8rem, 1fr))`,
  };

  return (
    <Box className={S.skeleton} data-testid="result-skeleton">
      <Box className={S.skeletonCorner} />
      <Box className={S.skeletonValueHeaders} style={valueColumns}>
        {aggregationNames.length === 0 ? (
          <Box className={S.skeletonHeaderCell}>
            <Text c="text-secondary">{t`Add a calculation above`}</Text>
          </Box>
        ) : (
          aggregationNames.map((name, index) => (
            <Box key={index} className={S.skeletonHeaderCell}>
              <Text fw={700} truncate>
                {name}
              </Text>
              {totals && (
                <Text size="sm" c="text-secondary" truncate>
                  {t`Total`}{" "}
                  {formatValue(totals[index], {
                    column: result?.data.cols[index],
                  })}
                </Text>
              )}
            </Box>
          ))
        )}
      </Box>
      <Box className={S.skeletonRows}>
        <Text size="sm" fw={700} c="text-secondary">{t`Rows`}</Text>
        <Text size="sm" c="text-secondary">
          {t`Group by something to fill in the rows`}
        </Text>
        <Flex direction="column" gap="xs" align="flex-start">
          {groupings.map((grouping) => (
            <Button
              key={grouping.label}
              size="compact-sm"
              variant="default"
              radius="xl"
              leftSection={<Icon name="add" size={12} aria-hidden />}
              onClick={() =>
                onQueryChange(Lib.breakout(query, -1, grouping.column))
              }
            >
              {grouping.label}
            </Button>
          ))}
        </Flex>
      </Box>
      <Box className={S.skeletonBody} style={valueColumns} aria-hidden>
        {_.range(SKELETON_ROW_COUNT * valueColumnCount).map((index) => (
          <Box key={index} className={S.skeletonCell} />
        ))}
      </Box>
    </Box>
  );
}
