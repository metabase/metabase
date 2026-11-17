import { useElementSize } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import type { OrderedValue } from "metabase/metadata/lifecycle";
import { Box, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import type { TransitionRow } from "./use-process-model";

type SankeyLinks = {
  series: RawSeries;
  /** Some moves went back to an earlier status */
  hasReturns: boolean;
  /** No history, so every move is drawn the same width */
  isUnweighted: boolean;
};

/**
 * A Sankey can't draw a loop, so a move back to an earlier status (or out
 * of a final one) flows into its own "again" node instead of the status
 * itself. Forward moves follow the status order, so the rest can't loop.
 */
function getSankeyLinks(
  states: OrderedValue[],
  rows: TransitionRow[],
): SankeyLinks {
  const rankOf = (value: string) =>
    states.findIndex((state) => state.value === value);
  const isUnweighted = rows.every(({ count }) => count === 0);
  let hasReturns = false;
  const links = rows
    // With history, only moves that happened; without, the expected shape
    .filter(({ count }) => isUnweighted || count > 0)
    .map(({ from, to, count }) => {
      const isReturn = rankOf(to) <= rankOf(from);
      hasReturns ||= isReturn;
      return [from, isReturn ? t`${to} (again)` : to, isUnweighted ? 1 : count];
    });

  return {
    hasReturns,
    isUnweighted,
    series: [
      {
        card: createMockCard({
          name: t`Transitions`,
          display: "sankey",
          visualization_settings: {
            "sankey.source": "from",
            "sankey.target": "to",
            "sankey.value": "count",
            "sankey.show_edge_labels": !isUnweighted,
            "sankey.edge_color": "source",
          },
        }),
        data: createMockDatasetData({
          cols: [
            createMockColumn({
              name: "from",
              display_name: t`From`,
              base_type: "type/Text",
              source: "breakout",
            }),
            createMockColumn({
              name: "to",
              display_name: t`To`,
              base_type: "type/Text",
              source: "breakout",
            }),
            createMockColumn({
              name: "count",
              display_name: t`Seen`,
              base_type: "type/Integer",
              source: "aggregation",
            }),
          ],
          rows: links,
        }),
      },
    ],
  };
}

/**
 * PROTOTYPE: mocked. The moves between statuses as flows, sized by how often
 * each was seen, drawn by the Sankey visualization.
 */
export function TransitionsSankey({
  states,
  rows,
  height,
}: {
  states: OrderedValue[];
  rows: TransitionRow[];
  height: number;
}) {
  const { ref, width } = useElementSize();
  const { series, hasReturns, isUnweighted } = useMemo(
    () => getSankeyLinks(states, rows),
    [states, rows],
  );

  return (
    <Stack gap="xs">
      <Box ref={ref} h={height} data-testid="transitions-sankey">
        {width > 0 && (
          <Visualization rawSeries={series} width={width} height={height} />
        )}
      </Box>
      {(isUnweighted || hasReturns) && (
        <Text size="sm" c="text-secondary">
          {[
            isUnweighted &&
              t`There's no status history, so every move is drawn the same width.`,
            hasReturns &&
              t`Moves back to an earlier status end in their own "again" node.`,
          ]
            .filter(Boolean)
            .join(" ")}
        </Text>
      )}
    </Stack>
  );
}
