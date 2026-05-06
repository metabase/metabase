import { Skeleton, Stack } from "metabase/ui";
import type { ExplorationQuery } from "metabase-types/api";

import S from "./ExplorationChartSkeleton.module.css";
import { ExplorationVisualizationHeader } from "./ExplorationVisualizationHeader";

/**
 * Loading placeholder shown while an exploration query is `pending` or
 * `running`. The visual mimics a tiny chart card — title bar, y-axis ticks,
 * and a flat area-chart silhouette in the body.
 */
export function ExplorationChartSkeleton({
  name,
  explorationQuery,
}: {
  name: string | null;
  explorationQuery: ExplorationQuery;
}) {
  return (
    <>
      <ExplorationVisualizationHeader
        name={name}
        explorationQuery={explorationQuery}
      />

      <Stack gap="md" h="100%" className={S.root}>
        <Stack gap={6} className={S.titleBlock}>
          <Skeleton h={14} w="40%" radius="sm" />
          <Skeleton h={10} w="20%" radius="sm" />
        </Stack>
        <div className={S.chartBlock}>
          <div className={S.yAxis}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} h={8} w="60%" radius="sm" />
            ))}
          </div>
          <svg
            aria-hidden
            className={S.chartSilhouette}
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
          >
            <path
              d="M0,32 L15,28 L30,24 L45,20 L60,18 L75,12 L90,8 L100,5 L100,40 L0,40 Z"
              className={S.chartArea}
            />
            <path
              d="M0,32 L15,28 L30,24 L45,20 L60,18 L75,12 L90,8 L100,5"
              className={S.chartLine}
            />
          </svg>
        </div>
      </Stack>
    </>
  );
}
