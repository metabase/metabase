import { Stack } from "metabase/ui";

import { ExplorationChartSkeleton } from "./ExplorationChartSkeleton";

export function ExplorationChartAreaSkeleton() {
  return (
    <Stack
      data-testid="exploration-chart-area-skeleton"
      flex={1}
      h="100%"
      mih={0}
      py="3rem"
      pr="3rem"
      align="center"
      style={{ overflowY: "auto" }}
    >
      <Stack
        flex={1}
        w="100%"
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
        p="lg"
      >
        <ExplorationChartSkeleton name={null} />
      </Stack>
    </Stack>
  );
}
