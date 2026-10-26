import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { MetricsViewerBody } from "metabase/metrics-viewer/components/MetricsViewerBody";
import { MetricsViewerProvider } from "metabase/metrics-viewer/context";
import { useViewerState } from "metabase/metrics-viewer/hooks";
import { Center } from "metabase/ui";

export function MetricsViewerPage() {
  const viewerState = useViewerState();

  if (!viewerState.initialLoadComplete) {
    // parsing formulas won't work until the initial set of definitions are loaded
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading />
      </Center>
    );
  }

  return (
    <MetricsViewerProvider value={viewerState}>
      <MetricsViewerBody />
    </MetricsViewerProvider>
  );
}
