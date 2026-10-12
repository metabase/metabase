import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getQuestionReturnUrl } from "metabase/common/metrics-viewer/question-handoff";
import { BreakoutLegend } from "metabase/metrics-viewer/components/BreakoutLegend/BreakoutLegend";
import { DimensionPickerSidebar } from "metabase/metrics-viewer/components/DimensionPickerSidebar";
import {
  MetricsViewerEmptyState,
  MetricsViewerNoDimensionBreakoutEmptyState,
} from "metabase/metrics-viewer/components/EmptyState";
import { MetricSearchPanel } from "metabase/metrics-viewer/components/MetricSearchPanel";
import { MetricsViewerDimensionBreakoutContent } from "metabase/metrics-viewer/components/MetricsViewerDimensionBreakoutContent";
import {
  MetricsViewerProvider,
  useMetricsViewerContext,
} from "metabase/metrics-viewer/context";
import { useViewerState } from "metabase/metrics-viewer/hooks";
import { useLocation } from "metabase/router";
import { Box, Button, Center, Flex, Icon, Stack } from "metabase/ui";

import { QuestionSummaryPage } from "../QuestionSummaryPage/QuestionSummaryPage";

import S from "./MetricsViewerPage.module.css";

export function MetricsViewerPage() {
  const location = useLocation();
  return new URLSearchParams(location.search).get("mode") === "question" ? (
    <QuestionSummaryPage />
  ) : (
    <SavedMetricsViewerPage />
  );
}

function SavedMetricsViewerPage() {
  const location = useLocation();
  const returnTo = getQuestionReturnUrl(location.search);
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
      <MetricsViewerPageBody returnTo={returnTo} />
    </MetricsViewerProvider>
  );
}

function MetricsViewerPageBody({ returnTo }: { returnTo: string | null }) {
  const { definitions, activeDimensionBreakout, isSidebarOpen } =
    useMetricsViewerContext();

  const hasDefinitions = Object.keys(definitions).length > 0;
  const hasLoadedDefinitions = Object.values(definitions).some(
    (entry) => entry.definition != null,
  );
  const showDimensionPickerSidebar = isSidebarOpen && activeDimensionBreakout;
  const showBreakoutLegend =
    !showDimensionPickerSidebar && activeDimensionBreakout?.type !== "scalar";

  return (
    <Stack px="3rem" h="100%" gap={0} className={S.root}>
      {returnTo && (
        <Box pt="lg">
          <Button
            component={Link}
            to={returnTo}
            leftSection={<Icon name="arrow_left" aria-hidden />}
          >
            {t`Back to table`}
          </Button>
        </Box>
      )}
      <Box pt="lg" flex="0 0 auto">
        <MetricSearchPanel />
      </Box>
      <Flex flex="1 1 auto" mih={0}>
        <Stack gap={0} flex={1} mih={0} miw={0}>
          <Flex flex="1 1 auto" mih={0} pt="xl">
            <Flex
              direction="column"
              pt="lg"
              pb="xl"
              flex={1}
              miw={0}
              className={S.content}
            >
              {!hasDefinitions ? (
                <MetricsViewerEmptyState />
              ) : activeDimensionBreakout ? (
                <MetricsViewerDimensionBreakoutContent />
              ) : hasLoadedDefinitions ? (
                <MetricsViewerNoDimensionBreakoutEmptyState />
              ) : null}
            </Flex>
            {showBreakoutLegend && <BreakoutLegend />}
            {showDimensionPickerSidebar && (
              <DimensionPickerSidebar
                activeDimensionBreakout={activeDimensionBreakout}
              />
            )}
          </Flex>
        </Stack>
      </Flex>
    </Stack>
  );
}
