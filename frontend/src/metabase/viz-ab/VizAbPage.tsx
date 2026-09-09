import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import type {
  VizEvalQueryType,
  VizJudgement,
  VizJudgementVerdict,
} from "metabase/api";
import {
  useCreateVizJudgementMutation,
  useListDatabasesQuery,
  useListVizJudgementsQuery,
} from "metabase/api";
import { getUserId } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSearchParams } from "metabase/router";
import {
  Box,
  Button,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type {
  Decision,
  NativeStructure,
  TwoStageDecision,
} from "metabase/visualizations/lib/default-viz/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import type Question from "metabase-lib/v1/Question";
import type { CardId, Dataset } from "metabase-types/api";

import { JudgementBar } from "./JudgementBar";
import { TraceTable } from "./TraceTable";
import { VizPanel } from "./VizPanel";
import { VERDICTS, getVerdictLabel } from "./types";
import {
  type VizAbFilters,
  questionQueryType,
  useVizAbCard,
} from "./useVizAbCard";

function getQueryTypeOptions() {
  return [
    { value: "all", label: t`MBQL + native` },
    { value: "query", label: t`MBQL only` },
    { value: "native", label: t`Native only` },
  ];
}

function formatMs(value: number | undefined | null): string {
  return value == null ? "–" : `${value.toFixed(1)} ms`;
}

function TimingLine({
  decision,
  native,
}: {
  decision: TwoStageDecision;
  native: NativeStructure | undefined;
}) {
  const { timings } = decision;
  const parts = [
    `stage 1 ${formatMs(timings.stage1Ms)}`,
    `row stats ${formatMs(timings.rowStatsMs)} (${timings.rowsScanned.toLocaleString()} rows)`,
    `stage 2 ${formatMs(timings.stage2Ms)}`,
    `reconcile ${formatMs(timings.reconcileMs)}`,
    `total ${formatMs(timings.totalMs)}`,
  ];
  if (native?.timing_ms != null) {
    parts.push(`native parse ${formatMs(native.timing_ms)} (server)`);
  }
  return (
    <Text size="xs" c="text-secondary">
      {parts.join(" · ")}
    </Text>
  );
}

function DecisionSummary({ decision }: { decision: Decision }) {
  const alternatives = decision.alternatives
    .map((alternative) =>
      alternative.variant
        ? `${alternative.display} (${alternative.variant})`
        : alternative.display,
    )
    .join(", ");
  return (
    <Stack gap={2}>
      <Text size="xs">
        {t`confidence ${decision.confidence.toFixed(2)}`}
        {decision.provisional &&
          ` · ${t`provisional`}: ${decision.provisionalReasons.join(", ")}`}
      </Text>
      <Text size="xs">{t`alternatives: ${alternatives || t`none`}`}</Text>
    </Stack>
  );
}

function Tally({ judgements }: { judgements: VizJudgement[] | undefined }) {
  const counts = useMemo(() => {
    const result = new Map<VizJudgementVerdict, number>();
    for (const judgement of judgements ?? []) {
      result.set(judgement.verdict, (result.get(judgement.verdict) ?? 0) + 1);
    }
    return result;
  }, [judgements]);
  const total = judgements?.length ?? 0;
  const summary = VERDICTS.map(
    (verdict) => `${getVerdictLabel(verdict)}: ${counts.get(verdict) ?? 0}`,
  ).join(" · ");
  return (
    <Text size="sm" c="text-secondary">
      {t`${total} judgements`} — {summary}
    </Text>
  );
}

function CardSummary({
  question,
  dataset,
}: {
  question: Question;
  dataset: Dataset | undefined;
}) {
  const card = question.card();
  const shape = dataset
    ? t`${dataset.row_count} rows × ${dataset.data.cols.length} cols`
    : null;
  const parts = [
    `#${card.id}`,
    card.name,
    questionQueryType(question),
    t`db ${card.database_id}`,
    shape,
  ].filter((part) => part != null);
  return <Text size="sm">{parts.join(" · ")}</Text>;
}

function readValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value == null || !(key in value)) {
    return undefined;
  }
  // `key in value` proves the property exists, but TS still types `value` as `object`
  return (value as Record<string, unknown>)[key];
}

function readString(value: unknown, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = readValue(value, key);
    if (typeof candidate === "string") {
      return candidate;
    }
  }
  return undefined;
}

function describeError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  const data = readValue(error, "data");
  return (
    readString(data, ["error", "message"]) ??
    readString(error, ["message", "error"]) ??
    JSON.stringify(error)
  );
}

function parseQueryType(value: string | null): VizEvalQueryType | undefined {
  if (value === "query" || value === "native") {
    return value;
  }
  return undefined;
}

function parseCardParam(value: string | null): CardId | undefined {
  const parsed = Number(value);
  return value != null && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}

export function VizAbPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pinnedCardId = parseCardParam(searchParams.get("card"));
  const [cardInput, setCardInput] = useState<number | string>("");

  const [filters, setFilters] = useState<VizAbFilters>({
    databaseId: undefined,
    queryType: undefined,
    excludeJudged: true,
  });

  const [componentsLoaded, setComponentsLoaded] = useState(false);
  useEffect(() => {
    loadVisualizationComponents().then(() => setComponentsLoaded(true));
  }, []);

  const { data: databases } = useListDatabasesQuery();
  const { data: judgements } = useListVizJudgementsQuery();
  const [createJudgement, { isLoading: isSaving }] =
    useCreateVizJudgementMutation();
  const userId = useSelector(getUserId);

  const state = useVizAbCard(filters, pinnedCardId);
  const {
    card,
    question,
    cardId,
    dataset,
    decision,
    shownDecision,
    stageShown,
    setStageShown,
    nativeStructure,
    nativeError,
    currentDefault,
    savedSeries,
    currentSeries,
    newSeries,
    isLoading,
    error,
    remaining,
    next,
  } = state;

  const databaseOptions = useMemo(
    () =>
      (databases?.data ?? []).map((database) => ({
        value: String(database.id),
        label: database.name,
      })),
    [databases],
  );

  const goToNext = () => {
    if (pinnedCardId != null) {
      setSearchParams({});
    }
    next();
  };

  const submitJudgement = async (
    verdict: VizJudgementVerdict,
    note: string,
  ) => {
    if (!card || cardId == null) {
      return;
    }
    const twoStage = decision?.status === "ok" ? decision.value : undefined;
    const chosen = twoStage?.final.trace.candidates.find(
      (candidate) => candidate.id === twoStage.final.trace.chosenId,
    );
    const body: VizJudgement = {
      card_id: cardId,
      database_id: card.database_id ?? null,
      query_type: question ? questionQueryType(question) : null,
      verdict,
      stage_shown: twoStage ? stageShown : null,
      saved_display: card.display,
      current_display: currentDefault?.display ?? null,
      new_stage1_display: twoStage?.stage1.display ?? null,
      new_stage2_display: twoStage?.stage2.display ?? null,
      final_display: twoStage?.final.display ?? null,
      new_settings: twoStage?.final.settings ?? null,
      reconcile_outcome: twoStage?.final.trace.reconcile?.outcome ?? null,
      confidence: twoStage?.final.confidence ?? null,
      chosen_penalties:
        chosen?.penalties.map(({ id, contribution }) => ({
          id,
          contribution,
        })) ?? null,
      col_count: dataset?.data.cols.length ?? null,
      row_count: dataset?.row_count ?? null,
      timings: twoStage
        ? {
            ...twoStage.timings,
            nativeParseMs: nativeStructure?.timing_ms ?? null,
          }
        : null,
      note: note || null,
      user_id: userId ?? null,
      created_at: new Date().toISOString(),
    };
    await createJudgement(body);
    goToNext();
  };

  const errorMessage = error != null ? describeError(error) : undefined;
  const failedStatus = errorMessage ? t`Query failed` : undefined;
  const newStatus =
    decision?.status === "error"
      ? t`Heuristic error: ${decision.message}`
      : nativeError
        ? t`Native structure failed; using row inference`
        : undefined;

  const stageBadge =
    decision?.status === "ok" &&
    decision.value.stage1.display !== decision.value.final.display
      ? [t`stage 1 → ${decision.value.stage1.display}`]
      : [];
  const reconcileBadge =
    decision?.status === "ok" && decision.value.final.trace.reconcile
      ? [decision.value.final.trace.reconcile.outcome]
      : [];

  return (
    <Stack p="lg" gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3}>{t`Default visualization A/B`}</Title>
        <Tally judgements={judgements} />
      </Group>

      <Group align="flex-end" wrap="wrap">
        <Select
          label={t`Database`}
          placeholder={t`Any`}
          clearable
          data={databaseOptions}
          value={filters.databaseId != null ? String(filters.databaseId) : null}
          onChange={(value) =>
            setFilters({
              ...filters,
              databaseId: value != null ? Number(value) : undefined,
            })
          }
        />
        <Select
          label={t`Query type`}
          data={getQueryTypeOptions()}
          value={filters.queryType ?? "all"}
          onChange={(value) =>
            setFilters({
              ...filters,
              queryType: parseQueryType(value),
            })
          }
        />
        <Checkbox
          label={t`Exclude judged`}
          checked={filters.excludeJudged}
          onChange={(event) =>
            setFilters({
              ...filters,
              excludeJudged: event.currentTarget.checked,
            })
          }
        />
        <NumberInput
          label={t`Load card #`}
          value={cardInput}
          onChange={setCardInput}
          w={140}
        />
        <Button
          variant="outline"
          onClick={() =>
            typeof cardInput === "number" &&
            setSearchParams({ card: String(cardInput) })
          }
        >
          {t`Load`}
        </Button>
        <Button onClick={goToNext} loading={isLoading}>
          {t`Next random card`}
        </Button>
        {remaining != null && (
          <Text size="sm" c="text-secondary">
            {t`${remaining} eligible`}
          </Text>
        )}
      </Group>

      {question && <CardSummary question={question} dataset={dataset} />}
      {errorMessage && (
        <Text c="error" lineClamp={4}>
          {errorMessage}
        </Text>
      )}

      {componentsLoaded && (
        <SimpleGrid cols={3} spacing="md">
          <VizPanel
            title={t`1 · Saved`}
            series={savedSeries}
            status={failedStatus}
          />
          <VizPanel
            title={t`2 · Current default`}
            series={currentSeries}
            status={failedStatus}
          />
          <VizPanel
            title={t`3 · New default`}
            series={newSeries}
            status={newStatus ?? failedStatus}
            badges={[...stageBadge, ...reconcileBadge]}
          >
            <Group gap="sm">
              <SegmentedControl
                size="xs"
                data={[
                  { value: "1", label: t`Stage 1 (metadata)` },
                  { value: "2", label: t`Final (rows)` },
                ]}
                value={String(stageShown)}
                onChange={(value) => setStageShown(value === "1" ? 1 : 2)}
              />
            </Group>
            {decision?.status === "ok" && (
              <TimingLine decision={decision.value} native={nativeStructure} />
            )}
            {shownDecision && <DecisionSummary decision={shownDecision} />}
            {shownDecision && <TraceTable decision={shownDecision} />}
          </VizPanel>
        </SimpleGrid>
      )}

      <Box>
        <JudgementBar
          disabled={!card || isSaving || isLoading}
          onSubmit={submitJudgement}
        />
      </Box>
    </Stack>
  );
}
