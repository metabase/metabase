import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

/* eslint-disable boundaries/element-types -- prototype: the metric input bar still lives in the metrics-viewer feature; move it to a shared metrics module before shipping */
import {
  MetricSearchInput,
  type MetricSourceId,
  type MetricsViewerDefinitionEntry,
  type MetricsViewerFormulaEntity,
  type SelectedMetric,
  createSourceId,
  isMetricEntry,
  loadMetricDefinition,
  parseSourceId,
} from "metabase/metrics-viewer";
/* eslint-enable boundaries/element-types */
import { useDispatch, useStore } from "metabase/redux";
import { Flex, Icon, Pill, Stack, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import {
  getChartSummarySession,
  getMetricBarItems,
  withMetricBarMetrics,
  withoutMetricBarItem,
} from "../SummarySidebar";

type ChartMetricBarProps = {
  question: Question;
  onQuestionChange: (question: Question) => void;
  /** Opens the summary sidebar, where ad-hoc values are edited. */
  onOpenSummary: () => void;
};

/**
 * The metrics explorer's input bar over the chart's summary values: saved metrics are
 * editable metric pills, other values (counts, column aggregations) ad-hoc pills that
 * open the summary sidebar. Every change rebuilds the question the same way the
 * summary sidebar does.
 */
export function ChartMetricBar({
  question,
  onQuestionChange,
  onOpenSummary,
}: ChartMetricBarProps) {
  const session = useMemo(() => getChartSummarySession(question), [question]);
  const items = useMemo(() => getMetricBarItems(session), [session]);
  const [addedMetrics, setAddedMetrics] = useState<SelectedMetric[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const metricItems = items.flatMap(({ metricId, label }) =>
    metricId != null ? [{ metricId, label }] : [],
  );
  const metricSourceIds = metricItems.map(({ metricId }) =>
    createSourceId(metricId, "metric"),
  );
  const formulaEntities: MetricsViewerFormulaEntity[] = metricSourceIds.map(
    (id) => ({ type: "metric", id, definition: null }),
  );
  const selectedMetrics = _.uniq(
    [
      ...metricItems.map(
        ({ metricId, label }): SelectedMetric => ({
          id: metricId,
          name: label,
          sourceType: "metric",
        }),
      ),
      ...addedMetrics,
    ],
    false,
    ({ id, sourceType }) => createSourceId(id, sourceType),
  );
  const definitions = useMetricDefinitions(
    metricItems.map(({ metricId }) => metricId),
  );

  const applyMetrics = (sourceIds: MetricSourceId[]) => {
    const sources = sourceIds.map(parseSourceId);
    const metricIds = sources
      .filter(({ type }) => type === "metric")
      .map(({ id }) => id);
    const { question: nextQuestion, unavailableIds } = withMetricBarMetrics(
      session,
      metricIds,
    );
    const rejectedNames = selectedMetrics
      .filter(
        ({ id, sourceType }) =>
          (sourceType === "measure" &&
            sourceIds.includes(createSourceId(id, sourceType))) ||
          (sourceType === "metric" && unavailableIds.includes(id)),
      )
      .map(({ name }) => name);
    setErrorMessage(
      rejectedNames.length > 0
        ? t`${rejectedNames.join(", ")} can't be added to this chart`
        : null,
    );
    if (nextQuestion != null) {
      onQuestionChange(nextQuestion);
    }
  };

  const adHocPills = items
    .filter(({ metricId }) => metricId == null)
    .map(({ valueId, label }) => (
      <Pill
        key={valueId}
        fz="md"
        px="sm"
        py="xxs"
        fw={600}
        withRemoveButton
        removeButtonProps={{ "aria-label": t`Remove ${label}` }}
        onRemove={() => {
          const nextQuestion = withoutMetricBarItem(session, valueId);
          if (nextQuestion != null) {
            onQuestionChange(nextQuestion);
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
          onOpenSummary();
        }}
        data-testid="chart-metric-bar-ad-hoc-pill"
      >
        <Flex align="center" gap="xxs">
          <Icon name="sum" size={12} />
          {label}
        </Flex>
      </Pill>
    ));

  return (
    <Stack gap="xs">
      <MetricSearchInput
        definitions={definitions}
        formulaEntities={formulaEntities}
        activeDimensionBreakout={null}
        onFormulaEntitiesChange={(entities) =>
          applyMetrics(entities.filter(isMetricEntry).map(({ id }) => id))
        }
        selectedMetrics={selectedMetrics}
        metricColors={{}}
        onAddMetric={(metric) => setAddedMetrics([...addedMetrics, metric])}
        onRemoveMetric={(id, sourceType) =>
          applyMetrics(
            metricSourceIds.filter(
              (sourceId) => sourceId !== createSourceId(id, sourceType),
            ),
          )
        }
        onSwapMetric={(oldMetric, newMetric) => {
          setAddedMetrics([...addedMetrics, newMetric]);
          const oldId = createSourceId(oldMetric.id, oldMetric.sourceType);
          applyMetrics(
            metricSourceIds.map((sourceId) =>
              sourceId === oldId
                ? createSourceId(newMetric.id, newMetric.sourceType)
                : sourceId,
            ),
          );
        }}
        leadingContent={adHocPills}
      />
      {errorMessage && (
        <Text size="sm" c="text-secondary">
          {errorMessage}
        </Text>
      )}
    </Stack>
  );
}

/**
 * Loaded definitions for `metricIds`; the input bar reads metric names from them when it
 * turns pills back into editable text. Unloaded metrics map to a `null` definition.
 */
function useMetricDefinitions(
  metricIds: number[],
): Record<MetricSourceId, MetricsViewerDefinitionEntry> {
  const dispatch = useDispatch();
  const store = useStore();
  const [loadedDefinitions, setLoadedDefinitions] = useState<
    Partial<Record<MetricSourceId, MetricsViewerDefinitionEntry>>
  >({});
  const requestedIdsRef = useRef(new Set<number>());
  const metricIdsKey = metricIds.join(",");

  useEffect(() => {
    metricIdsKey
      .split(",")
      .filter((id) => id.length > 0)
      .map(Number)
      .filter((metricId) => !requestedIdsRef.current.has(metricId))
      .forEach(async (metricId) => {
        requestedIdsRef.current.add(metricId);
        const sourceId = createSourceId(metricId, "metric");
        const definition = await loadMetricDefinition(
          dispatch,
          store.getState,
          metricId,
        ).catch(() => null);
        setLoadedDefinitions((definitions) => ({
          ...definitions,
          [sourceId]: { id: sourceId, definition },
        }));
      });
  }, [metricIdsKey, dispatch, store]);

  const definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry> = {};
  for (const metricId of metricIds) {
    const sourceId = createSourceId(metricId, "metric");
    definitions[sourceId] = loadedDefinitions[sourceId] ?? {
      id: sourceId,
      definition: null,
    };
  }
  return definitions;
}
