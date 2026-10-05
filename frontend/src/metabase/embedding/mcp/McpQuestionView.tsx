import {
  type CSSProperties,
  type MutableRefObject,
  useCallback,
  useEffect,
  useState,
} from "react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { Alert, Box, Divider, Flex } from "metabase/ui";

import { ChartTypePicker } from "./ChartTypePicker/ChartTypePicker";
import { McpQuestionTitle } from "./McpQuestionTitle";
import { getMcpDeserializedQuery } from "./McpUiAppRoute.utils";
import { TimeGranularityControl } from "./TimeControlBar/TimeGranularityControl";
import { TimeRangeControl } from "./TimeControlBar/TimeRangeControl";
import type { DerivedQuery } from "./api";
import type { ApplyMcpOperations, McpDeriveOperation } from "./derive";
import { useMcpQueryControls } from "./hooks/useMcpQueryControls";

export const MCP_CONTENT_HEIGHT = "500px";

const QUERY_BAR_RESERVED_HEIGHT = "calc(2rem + var(--mantine-spacing-sm))";
const RECLAIMED_CONTENT_BOTTOM_PADDING = "var(--mantine-spacing-xl)";

export interface McpQuestionViewProps {
  queryKey: string | null;
  safeAreaPaddingTop: number;
  deriveQuery: (operations: McpDeriveOperation[]) => Promise<DerivedQuery>;
  applyOperationsRef: MutableRefObject<ApplyMcpOperations | null>;
  isQueryRunningRef: MutableRefObject<boolean>;
}

/**
 * Applies operations by asking the server to derive a new query handle, which
 * becomes the current one, then shows that handle's query. Runs of the question then go through the new
 * handle, so the question never runs a query the iframe built.
 */
function getDeriveErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "serverMessage" in error &&
    typeof error.serverMessage === "string" &&
    error.serverMessage
  ) {
    return error.serverMessage;
  }

  return t`This change could not be applied.`;
}

function useApplyMcpOperations(
  deriveQuery: McpQuestionViewProps["deriveQuery"],
  onError: (message: string | null) => void,
): ApplyMcpOperations {
  const { question, updateQuestion } = useSdkQuestionContext();

  return useCallback(
    (operations) => {
      if (!question) {
        return;
      }

      deriveQuery(operations)
        .then(({ query }) => {
          const derived = getMcpDeserializedQuery(query);

          if (!derived) {
            throw new Error("The derived query could not be read.");
          }

          onError(null);
          updateQuestion(question.setDatasetQuery(derived.card.dataset_query), {
            run: true,
          });
        })
        .catch((error) => {
          console.error("Error changing the MCP query", error);
          onError(getDeriveErrorMessage(error));
        });
    },
    [deriveQuery, onError, question, updateQuestion],
  );
}

export function McpQuestionView({
  queryKey,
  safeAreaPaddingTop,
  deriveQuery,
  applyOperationsRef,
  isQueryRunningRef,
}: McpQuestionViewProps) {
  const { isQueryRunning } = useSdkQuestionContext();

  useEffect(() => {
    isQueryRunningRef.current = isQueryRunning;
  }, [isQueryRunning, isQueryRunningRef]);

  const [deriveError, setDeriveError] = useState<string | null>(null);
  const applyOperations = useApplyMcpOperations(deriveQuery, setDeriveError);

  useEffect(() => {
    applyOperationsRef.current = applyOperations;
  }, [applyOperations, applyOperationsRef]);

  const {
    hasChartTypeSelector,
    hasTimeControls,
    timeGranularity,
    timeRange,
    chartTypes,
    currentChartType,
    onChartTypeChange,
  } = useMcpQueryControls(queryKey, applyOperations);

  const isTableVisualization = currentChartType === "table";

  // When table has no time controls, we can remove vertical padding and increase height.
  const shouldUseFullHeightTable = isTableVisualization && !hasTimeControls;

  const baseVisualizationHeight = hasTimeControls
    ? `calc(${MCP_CONTENT_HEIGHT} - 8.5rem)`
    : `calc(${MCP_CONTENT_HEIGHT} - 8.5rem + ${QUERY_BAR_RESERVED_HEIGHT})`;

  const tableVisualizationHeight = `calc(${baseVisualizationHeight} + ${RECLAIMED_CONTENT_BOTTOM_PADDING} + ${safeAreaPaddingTop}px)`;

  const resolvedVisualizationHeight = shouldUseFullHeightTable
    ? tableVisualizationHeight
    : baseVisualizationHeight;

  // We cannot reduce top padding when chart type selector is shown,
  // as switching between them will cause layout shift due to height change.
  const shouldReduceTopPadding =
    shouldUseFullHeightTable && !hasChartTypeSelector;

  const contentStyle: CSSProperties = {
    boxSizing: "border-box",
    paddingTop: shouldReduceTopPadding
      ? "calc(var(--mantine-spacing-xl) + 0px)"
      : `calc(var(--mantine-spacing-xl) + ${safeAreaPaddingTop}px)`,
  };

  return (
    <Flex
      direction="column"
      justify="space-between"
      h={MCP_CONTENT_HEIGHT}
      gap="sm"
      pb={shouldUseFullHeightTable ? undefined : "xl"}
      style={contentStyle}
    >
      <Flex
        px="xl"
        align="center"
        justify="space-between"
        gap="sm"
        flex="0 0 auto"
      >
        <Box flex={1} miw={0}>
          <McpQuestionTitle />
        </Box>

        <Flex align="center" flex="0 0 auto">
          {hasChartTypeSelector && (
            <ChartTypePicker
              chartTypes={chartTypes}
              value={currentChartType}
              onChange={onChartTypeChange}
            />
          )}
        </Flex>
      </Flex>

      <Flex px="xxs" flex={1} style={{ overflow: "hidden" }}>
        <SdkQuestion.QuestionVisualization
          height={resolvedVisualizationHeight}
        />
      </Flex>

      {deriveError && (
        <Box px="xl">
          <Alert
            color="error"
            variant="outline"
            p="xs"
            withCloseButton
            onClose={() => setDeriveError(null)}
          >
            {deriveError}
          </Alert>
        </Box>
      )}

      {hasTimeControls && (
        <Flex px="xl" justify="center">
          <Flex
            h={32}
            align="stretch"
            bd="1px solid var(--mb-color-border-neutral)"
            bdrs="xs"
            style={{ overflow: "hidden" }}
            data-testid="query-explorer-bar"
          >
            {timeRange && <TimeRangeControl timeRange={timeRange} />}

            {timeRange && timeGranularity && <Divider orientation="vertical" />}

            {timeGranularity && (
              <TimeGranularityControl timeGranularity={timeGranularity} />
            )}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
