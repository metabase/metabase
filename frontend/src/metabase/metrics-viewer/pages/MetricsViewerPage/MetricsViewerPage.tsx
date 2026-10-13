import { useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getQuestionReturnUrl } from "metabase/common/metrics-viewer/question-handoff";
import { BreakoutLegend } from "metabase/metrics-viewer/components/BreakoutLegend/BreakoutLegend";
import { DatasetPanel } from "metabase/metrics-viewer/components/DatasetPanel/DatasetPanel";
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
import {
  Box,
  Button,
  Center,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";

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
  const dataset = new URLSearchParams(location.search).get("dataset");
  const viewerState = useViewerState(dataset ? "table" : undefined);

  if (!viewerState.initialLoadComplete) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading />
      </Center>
    );
  }

  return (
    <MetricsViewerProvider value={viewerState}>
      <MetricsViewerPageBody returnTo={returnTo} dataset={dataset} />
    </MetricsViewerProvider>
  );
}

function MetricsViewerPageBody({
  returnTo,
  dataset,
}: {
  returnTo: string | null;
  dataset: string | null;
}) {
  const { definitions, activeDimensionBreakout, isSidebarOpen } =
    useMetricsViewerContext();
  const [showDataset, setShowDataset] = useState(true);

  const hasDefinitions = Object.keys(definitions).length > 0;
  const hasLoadedDefinitions = Object.values(definitions).some(
    (entry) => entry.definition != null,
  );
  const showDimensionPickerSidebar = isSidebarOpen && activeDimensionBreakout;
  const showBreakoutLegend =
    !showDimensionPickerSidebar &&
    activeDimensionBreakout?.type !== "scalar" &&
    activeDimensionBreakout?.display !== "table";

  return (
    <Stack px="xl" h="100%" gap={0} className={S.root}>
      {(returnTo || dataset) && (
        <Group pt="md" justify="space-between">
          {returnTo && (
            <Button
              component={Link}
              to={returnTo}
              leftSection={<Icon name="arrow_left" aria-hidden />}
            >{t`Back to table`}</Button>
          )}
          {dataset && (
            <Button onClick={() => setShowDataset((value) => !value)}>
              {showDataset ? t`Hide dataset` : t`Show dataset`}
            </Button>
          )}
        </Group>
      )}
      <Box pt="lg" flex="0 0 auto">
        <MetricSearchPanel />
        {dataset && (
          <Text
            size="sm"
            c="text-secondary"
            mt="sm"
          >{t`Add metrics or formulas above to explore alongside your dataset. Dataset filters and metric filters are independent.`}</Text>
        )}
      </Box>
      <Flex flex="1 1 auto" mih={0} gap="lg" pt="lg" className={S.workspace}>
        {dataset && (
          <Stack
            data-testid="explorer-dataset"
            flex={1}
            miw={0}
            mih={0}
            pb="md"
            style={{ display: showDataset ? undefined : "none" }}
          >
            <DatasetPanel serializedDataset={dataset} />
          </Stack>
        )}
        {(!dataset || hasDefinitions || !showDataset) && (
          <Flex flex={1} miw={0} mih={0} data-testid="explorer-metrics">
            <Stack gap={0} flex={1} mih={0} miw={0}>
              {dataset && <Text fw="bold" mb="sm">{t`Metrics`}</Text>}
              <Flex
                direction="column"
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
            </Stack>
            {showBreakoutLegend && <BreakoutLegend />}
            {showDimensionPickerSidebar && (
              <DimensionPickerSidebar
                activeDimensionBreakout={activeDimensionBreakout}
              />
            )}
          </Flex>
        )}
      </Flex>
    </Stack>
  );
}
