import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useMetadataProvider } from "metabase/metadata-store";
import { useLocation, useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  type ConcreteTableId,
  type Dataset,
  METABOT_EVENT_ANALYSIS_SUGGESTION_EVENT,
  type MetabotEventAnalysisInfo,
  type MetabotEventAnalysisSuggestionEventDetail,
} from "metabase-types/api";
import { isRecord } from "metabase-types/guards";

import type {
  AnalysisContext,
  CommonSettings,
  UsersTable,
} from "../analyses/types";
import type { BaseQueryInput } from "../base-query";
import { buildSql } from "../build-sql";
import { BOUNCE_INSIGHTS } from "../insights/bounce-analysis";
import { FUNNEL_INSIGHTS } from "../insights/funnel-analysis";
import { HABIT_INSIGHTS } from "../insights/habit-analysis";
import { LIFECYCLE_INSIGHTS } from "../insights/lifecycle-analysis";
import type { InsightsAnalysis } from "../insights/types";
import { useInsights } from "../insights/use-insights";
import type { SegmentDraft } from "../segments/types";
import { usePaletteSegments } from "../segments/use-palette-segments";
import { updateSettings } from "../settings/compute";
import type { StoredSettings } from "../settings/types";
import type { AnalysisKind, AnalysisSpec } from "../spec/types";
import { orderCtes } from "../sql/compose";
import { encodeSettings } from "../url-state";
import type { CompiledBase } from "../use-analysis-query";
import { useStableValue } from "../use-stable-value";

import { getSuggestedSettings } from "./apply-suggestion";
import { getAnalysisDigest, getDigestCtes } from "./digest";
import { getSuggestedPrompts } from "./prompts";

const PROFILE = "product_analytics";
const CONTEXT_ITEM_ID = "event-analysis";
const NO_DRAFTS: SegmentDraft[] = [];

const getInsightsAnalysis = (
  spec: AnalysisSpec | undefined,
): InsightsAnalysis | undefined => {
  switch (spec?.kind) {
    case "funnel":
      return FUNNEL_INSIGHTS;
    case "paths":
      return BOUNCE_INSIGHTS;
    case "lifecycle":
      return LIFECYCLE_INSIGHTS;
    case "habit":
      return HABIT_INSIGHTS;
    default:
      return undefined;
  }
};

const isSuggestionEvent = (
  event: Event,
): event is CustomEvent<MetabotEventAnalysisSuggestionEventDetail> =>
  event instanceof CustomEvent && isRecord(event.detail);

type UseAnalysisMetabotArgs = {
  kind: AnalysisKind;
  title: string;
  question: string;
  tableId: ConcreteTableId | undefined;
  spec: AnalysisSpec | undefined;
  /** Must keep its identity while unchanged. */
  base: BaseQueryInput;
  context: AnalysisContext;
  usersTable: UsersTable | undefined;
  computed: CommonSettings;
  stored: StoredSettings;
  dataset: Dataset | undefined;
  /** The analysis's compiled base, for its CTEs when it has no insights. */
  compiledBase: CompiledBase | undefined;
  isResultLoading: boolean;
};

export type AnalysisMetabotPrompts =
  | { status: "loading" }
  | { status: "ready"; prompts: string[]; onSubmit: (prompt: string) => void };

/**
 * PROTOTYPE: Metabot for an event analysis. Runs the insights search, tells
 * Metabot about the analysis with each message, and applies the analyses it
 * suggests. The prompts load until the result and the insights are in.
 */
export const useAnalysisMetabot = ({
  kind,
  title,
  question,
  tableId,
  spec,
  base,
  context,
  usersTable,
  computed,
  stored,
  dataset,
  compiledBase,
  isResultLoading,
}: UseAnalysisMetabotArgs): AnalysisMetabotPrompts => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sendToast] = useToast();
  const metadataProvider = useMetadataProvider(context.table?.db_id ?? null);
  const analysis = getInsightsAnalysis(spec);
  const insights = useInsights({ spec, analysis, tableId, base, context });
  const segments = usePaletteSegments(tableId, "event", NO_DRAFTS);
  const { submitInput, setProfileOverride } = useMetabotAgent();

  const isInsightsSettled =
    insights.state.status === "done" ||
    insights.state.status === "error" ||
    insights.state.status === "idle";
  const isPairsSettled =
    insights.state.status !== "done" || !insights.state.isFindingPairs;
  const isReady =
    spec !== undefined &&
    dataset !== undefined &&
    !isResultLoading &&
    isInsightsSettled &&
    isPairsSettled;

  const breakoutColumn =
    computed.breakout?.type === "property"
      ? computed.breakout.column
      : computed.breakout?.type === "cohorts"
        ? computed.breakout.segments.map(({ label }) => label).join(", ")
        : null;

  const getContextItem = (): MetabotEventAnalysisInfo | undefined => {
    if (!isReady || spec === undefined) {
      return undefined;
    }
    const databaseId = insights.databaseId ?? compiledBase?.databaseId;
    if (databaseId === undefined) {
      return undefined;
    }
    // Without insights, the analysis's own CTEs.
    const ctes =
      insights.ctes ??
      (compiledBase !== undefined
        ? orderCtes(buildSql(spec, compiledBase.sql, compiledBase.columns).ctes)
        : []);
    return {
      type: "event_analysis",
      id: CONTEXT_ITEM_ID,
      title,
      findings: getAnalysisDigest({
        title,
        question,
        table: context.table,
        usersTable: usersTable?.table,
        spec,
        dateRange: computed.date_range,
        filters: computed.filters,
        breakoutColumn,
        events: base.events,
        dataset,
        insights: insights.state,
        outcome: insights.outcome,
        segmentNames: segments.saved.map(({ name }) => name),
        ctes,
      }),
      database_id: databaseId,
      sql_engine: "clickhouse",
      ctes: getDigestCtes(ctes, insights.populationSource),
    };
  };
  // `useInsights` returns new objects each render; this keeps the provider
  // registered until what Metabot would see changes.
  const contextItem = useStableValue(getContextItem());

  useRegisterMetabotContextProvider(
    async () =>
      contextItem !== undefined ? { user_is_viewing: [contextItem] } : {},
    [contextItem],
  );

  // Typed follow-ups in the sidebar use the profile too, while the page is open.
  useEffect(() => {
    setProfileOverride(PROFILE);
    return () => setProfileOverride(undefined);
  }, [setProfileOverride]);

  const handleSuggestion = useCallback(
    ({ suggestion, action }: MetabotEventAnalysisSuggestionEventDetail) => {
      if (tableId === undefined) {
        return;
      }
      const result = getSuggestedSettings(
        {
          metadataProvider,
          tableId,
          usersTable: usersTable?.table,
          settings: computed,
          segments: segments.saved,
        },
        suggestion.changes,
      );
      if (result.status === "error") {
        sendToast({
          message: t`Couldn't set up that analysis: ${result.message}`,
          icon: "warning",
        });
        return;
      }
      // Applying navigates like any edit does, so Back undoes it.
      const targetKind = suggestion.kind ?? kind;
      const hash = encodeSettings(updateSettings(stored, result.changes));
      const path =
        targetKind === kind
          ? `${location.pathname}${location.search}`
          : Urls.eventAnalysis(targetKind, tableId);
      const url = `${path}#${hash}`;
      if (action === "open") {
        window.open(url, "_blank");
      } else {
        navigate(url);
      }
    },
    [
      tableId,
      metadataProvider,
      usersTable,
      computed,
      segments.saved,
      kind,
      stored,
      location,
      navigate,
      sendToast,
    ],
  );

  useEffect(() => {
    const listener = (event: Event) => {
      if (isSuggestionEvent(event)) {
        handleSuggestion(event.detail);
      }
    };
    window.addEventListener(METABOT_EVENT_ANALYSIS_SUGGESTION_EVENT, listener);
    return () =>
      window.removeEventListener(
        METABOT_EVENT_ANALYSIS_SUGGESTION_EVENT,
        listener,
      );
  }, [handleSuggestion]);

  const handleSubmit = useCallback(
    (prompt: string) => submitInput(prompt, { profile: PROFILE }),
    [submitInput],
  );

  if (!isReady || spec === undefined) {
    return { status: "loading" };
  }
  return {
    status: "ready",
    prompts: getSuggestedPrompts(spec, insights.state),
    onSubmit: handleSubmit,
  };
};
