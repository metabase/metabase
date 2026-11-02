import { useEffect, useMemo, useRef } from "react";

import { MetricsViewerBody } from "metabase/metrics-viewer/components/MetricsViewerBody";
import {
  MetricsViewerProvider,
  useMetricsViewerContext,
} from "metabase/metrics-viewer/context";
import { useViewerState } from "metabase/metrics-viewer/hooks";
import { isMetricEntry } from "metabase/metrics-viewer/types";
import { Center, Loader } from "metabase/ui";

/** What the explorer currently shows, for the embedding page to title itself with. */
export type MetricsExplorerDescription = {
  seriesNames: string[];
  /** The dimension the chart is broken out by, e.g. "Created At" or "Category". */
  breakoutLabel: string | null;
};

type MetricsExplorerProps = {
  /** Encoded viewer state (see `encodeState`) to start from. Read once, on mount. */
  initialHash: string;
  /** Receives the encoded state whenever the user changes it. */
  onHashChange: (hash: string) => void;
  /** Receives the series and breakout shown whenever they change. */
  onDescriptionChange?: (description: MetricsExplorerDescription) => void;
};

/**
 * The metrics explorer, embeddable in other pages: the `/explore` page's search bar and chart
 * without its heading and Filter button, with its state kept by the caller instead of the URL.
 */
export function MetricsExplorer({
  initialHash,
  onHashChange,
  onDescriptionChange,
}: MetricsExplorerProps) {
  const viewerState = useViewerState({ initialHash, onHashChange });

  if (!viewerState.initialLoadComplete) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }

  return (
    <MetricsViewerProvider value={viewerState}>
      {onDescriptionChange && (
        <DescriptionReporter onDescriptionChange={onDescriptionChange} />
      )}
      <MetricsViewerBody isEmbedded />
    </MetricsViewerProvider>
  );
}

function DescriptionReporter({
  onDescriptionChange,
}: Required<Pick<MetricsExplorerProps, "onDescriptionChange">>) {
  const { formulaEntities, sourceDataById, activeDimensionBreakout } =
    useMetricsViewerContext();
  const onDescriptionChangeRef = useRef(onDescriptionChange);
  onDescriptionChangeRef.current = onDescriptionChange;

  const seriesNames = useMemo(
    () =>
      formulaEntities.flatMap((entity) => {
        const name = isMetricEntry(entity)
          ? sourceDataById[entity.id]?.name
          : entity.name;
        return name ? [name] : [];
      }),
    [formulaEntities, sourceDataById],
  );
  const seriesNamesKey = seriesNames.join("\n");
  const breakoutLabel = activeDimensionBreakout?.label ?? null;

  useEffect(() => {
    onDescriptionChangeRef.current({
      seriesNames: seriesNamesKey ? seriesNamesKey.split("\n") : [],
      breakoutLabel,
    });
  }, [seriesNamesKey, breakoutLabel]);

  return null;
}
