import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useGetXrayDashboardQuery } from "metabase/api";
import type {
  AdhocVizValue,
  AutomagicDashboardValue,
} from "metabase/api/ai-streaming/schemas";
import { AdHocQuestionLoader } from "metabase/common/components/AdHocQuestionLoader";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { ForwardRefLink } from "metabase/common/components/Link";
import { QuestionResultLoader } from "metabase/common/components/QuestionResultLoader";
import {
  deserializeCardFromQuery,
  serializeCardForUrl,
} from "metabase/common/utils/card";
import {
  useMetabotContext,
  useRegisterMetabotContextProvider,
} from "metabase/metabot";
import {
  type MetabotAgentDataPartMessage,
  type MetabotAgentId,
  focusPromptInput as focusPromptInputAction,
  getIsProcessing,
  getMetabotRequestId,
  getPrompt,
  rememberDataPointTarget,
  setPrompt as setPromptAction,
  submitInput as submitInputAction,
} from "metabase/metabot/state";
import {
  getCustomVizRenderFeedbackAttemptKey,
  getCustomVizRenderFeedbackKey,
  getCustomVizRenderFeedbackPrompt,
} from "metabase/metabot/utils/custom-viz-render-feedback";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import { useDispatch, useSelector, useStore } from "metabase/redux";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  TableSelectionMention,
  VisualizationRenderErrorContext,
} from "metabase/visualizations/types";
import type { ClickObject } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  DashboardCard,
  Dataset,
  MetabotAdhocQueryInfo,
  MetabotCodeEdit,
} from "metabase-types/api";

import {
  CodeEditTablePills,
  NavigateToTablePills,
  pathHasDataSources,
} from "./MetabotAgentDataSourcePills";
import { AgentSuggestionMessage } from "./MetabotAgentSuggestionMessage";
import { AgentTodoListMessage } from "./MetabotAgentTodoMessage";
import Styles from "./MetabotChat.module.css";
import {
  type DataPointMentionId,
  type DataPointMentionTarget,
  getChartData,
  getClickedObjectFromDataPointTarget,
  getClickedObjectsFromDataSelection,
  getDataPointMention,
  getDataPointMentionMarkdown,
  getDataPointRangeMentionMarkdown,
  getDataSelectionMentionEvent,
  getFuzzyClickedObjectFromDataPointTarget,
  getNextDataPointRangeMentionId,
  getSelectedChartData,
  getSelectedChartRange,
} from "./data-point-mentions";
import {
  type DataPointCard,
  type OnDemandHandler,
  isQuestionLikeHref,
  nextDataPointCardMountOrder,
  normalizeQuestionLink,
  registerDataPointCard,
  setDataPointOnDemandHandler,
} from "./data-point-router";

const MAX_CUSTOM_VIZ_RENDER_FEEDBACK_ATTEMPTS = 3;
const submittedCustomVizRenderFeedbackKeys = new Set<string>();
const customVizRenderFeedbackAttemptCounts = new Map<string, number>();

type AgentDataPartMessageProps = {
  agentId: MetabotAgentId;
  message: MetabotAgentDataPartMessage;
  readonly: boolean;
  debug: boolean;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
};

export const AgentDataPartMessage = ({
  agentId,
  message,
  readonly,
  debug,
  dataPointTargets,
}: AgentDataPartMessageProps) =>
  match(message)
    .with({ part: { type: "todo_list" } }, ({ part }) => (
      <AgentTodoListMessage todos={part.value} />
    ))
    .with({ part: { type: "transform_suggestion" } }, (msg) => (
      <AgentSuggestionMessage message={msg} readonly={readonly} />
    ))
    .with({ part: { type: "code_edit" } }, ({ part, metadata }) => {
      const sourcePills = (
        <CodeEditTablePills
          value={part.value}
          buffer={metadata?.codeEditBuffer}
          messageId={readonly ? undefined : message.externalId}
        />
      );

      return (
        <Stack gap="md">
          {debug && <CodeEditDataPart type={part.type} value={part.value} />}
          {sourcePills}
        </Stack>
      );
    })
    .with({ part: { type: "adhoc_viz" } }, ({ part }) => (
      <EmbeddedAdhocViz
        agentId={agentId}
        value={part.value}
        debug={debug}
        dataPointTargets={dataPointTargets}
        messageId={readonly ? undefined : message.externalId}
      />
    ))
    .with({ part: { type: "static_viz" } }, ({ part }) =>
      debug ? <DataPartJsonCard type={part.type} value={part.value} /> : null,
    )
    .with({ part: { type: "automagic_dashboard" } }, ({ part }) => (
      <EmbeddedAutomagicDashboard
        agentId={agentId}
        value={part.value}
        debug={debug}
        dataPointTargets={dataPointTargets}
      />
    ))
    .exhaustive((msg: unknown) => {
      console.warn("AgentDataPartMessage received an unexpected value:", msg);
      return null;
    });

const EmbeddedAdhocViz = ({
  agentId,
  value,
  debug,
  dataPointTargets,
  messageId,
}: {
  agentId: MetabotAgentId;
  value: AdhocVizValue;
  debug: boolean;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
  messageId?: string;
}) => {
  return (
    <Stack gap="md">
      {debug && <DataPartJsonCard type="adhoc_viz" value={value} />}
      <EmbeddedQuestionCard
        agentId={agentId}
        path={value.link}
        title={value.title}
        dataPointTargets={dataPointTargets}
        messageId={messageId}
      />
    </Stack>
  );
};

// Cap how many of an auto-generated dashboard's charts we render inline. Each
// one runs its own query, so we show a manageable prefix and link to the full
// dashboard for the rest.
const MAX_AUTOMAGIC_DASHBOARD_CARDS = 6;

const hasRunnableCard = (
  dc: DashboardCard,
): dc is DashboardCard & { card: Card } =>
  dc.card != null &&
  "dataset_query" in dc.card &&
  dc.card.dataset_query != null;

// Renders an auto-generated (X-ray) dashboard inline as a stack of its charts.
// We fetch the transient dashboard, then reuse the same self-contained
// `EmbeddedQuestionCard` used for ad-hoc charts for each of its cards. This
// avoids mounting the dashboard engine (which owns a single global Redux slice
// and can't coexist with another open dashboard or a second inline embed).
const EmbeddedAutomagicDashboard = ({
  agentId,
  value,
  debug,
  dataPointTargets,
}: {
  agentId: MetabotAgentId;
  value: AutomagicDashboardValue;
  debug: boolean;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
}) => {
  const subPath = useMemo(
    () => value.url.replace(/^\/auto\/dashboard\//, "").replace(/^\/+/, ""),
    [value.url],
  );
  const {
    data: dashboard,
    isLoading,
    error,
  } = useGetXrayDashboardQuery(subPath);

  const questionCards = useMemo(
    () => (dashboard?.dashcards ?? []).filter(hasRunnableCard),
    [dashboard],
  );
  const shownCards = questionCards.slice(0, MAX_AUTOMAGIC_DASHBOARD_CARDS);
  const hiddenCount = questionCards.length - shownCards.length;

  return (
    <Stack gap="sm" data-testid="metabot-automagic-dashboard">
      {debug && <DataPartJsonCard type="automagic_dashboard" value={value} />}
      {isLoading ? (
        <Flex h="6rem" align="center" justify="center">
          <Loader size="sm" />
        </Flex>
      ) : error || !dashboard ? (
        <Flex h="6rem" align="center" justify="center">
          <Text c="text-secondary" size="sm">
            {t`Could not load the generated dashboard.`}
          </Text>
        </Flex>
      ) : shownCards.length === 0 ? (
        <Flex h="6rem" align="center" justify="center">
          <Text c="text-secondary" size="sm">
            {t`This dashboard has no charts to show.`}
          </Text>
        </Flex>
      ) : (
        <>
          <Box className={Styles.embeddedAutomagicDashboardGrid}>
            {shownCards.map((dc) => (
              <EmbeddedQuestionCard
                key={dc.id}
                agentId={agentId}
                path={`/question#${serializeCardForUrl(dc.card)}`}
                title={dc.card.name}
                dataPointTargets={dataPointTargets}
              />
            ))}
          </Box>
          <Flex justify="center">
            <Button
              component={ForwardRefLink}
              to={value.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="default"
              size="compact-sm"
            >
              {hiddenCount > 0
                ? t`See full dashboard (${hiddenCount} more)`
                : t`See full dashboard`}
            </Button>
          </Flex>
        </>
      )}
    </Stack>
  );
};

// Memoized so the embedded chart only re-renders when its own inputs change
// (question/result/selection), not when unrelated chat state churns — e.g. a
// newly remembered data-point target or a streaming message. Re-rendering it
// would recompute the ECharts option and wipe the active data-point highlight.
// We compare on `result`/`question` rather than the derived `rawSeries` array,
// which the loader re-creates on every render.
const MemoizedQueryVisualization = memo(
  QueryVisualization,
  (prev, next) =>
    prev.question === next.question &&
    prev.result === next.result &&
    prev.isRunning === next.isRunning &&
    prev.clicked === next.clicked &&
    prev.clickedViaMention === next.clickedViaMention &&
    prev.clickedViaMentionGroup === next.clickedViaMentionGroup &&
    prev.handleVisualizationClick === next.handleVisualizationClick &&
    prev.onTableSelectionMention === next.onTableSelectionMention &&
    prev.onVisualizationRenderError === next.onVisualizationRenderError,
);

const EmbeddedQuestionCard = ({
  agentId,
  path,
  title,
  dataPointTargets,
  autoHighlightTarget,
  messageId,
}: {
  agentId: MetabotAgentId;
  path: string;
  title?: string;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
  messageId?: string;
  // When set, this card was rendered on demand to surface a data point whose
  // source chart wasn't on screen. Once its result loads it highlights this
  // target automatically.
  autoHighlightTarget?: DataPointMentionTarget;
}) => {
  const dispatch = useDispatch();
  const store = useStore();
  const { getChatContext } = useMetabotContext();
  const metabotRequestId = useSelector((state) =>
    getMetabotRequestId(state, agentId),
  );
  const isDoingScience = useSelector((state) =>
    getIsProcessing(state, agentId),
  );
  // Read the latest targets from a ref so the click handlers can stay stable
  // (depending on the prop would re-create them and re-render the chart).
  const dataPointTargetsRef = useRef(dataPointTargets);
  dataPointTargetsRef.current = dataPointTargets;
  // Read the prompt lazily from the store at click time instead of subscribing
  // to it. Subscribing here would re-render this card (and its embedded chart)
  // on every keystroke, which wipes and re-applies the data-point highlight,
  // causing it to flash and resetting its auto-dismiss timer.
  const setPrompt = useCallback(
    (value: string) => dispatch(setPromptAction({ agentId, prompt: value })),
    [dispatch, agentId],
  );
  const focusPromptInput = useCallback(
    () => dispatch(focusPromptInputAction({ agentId })),
    [dispatch, agentId],
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<Question | null>(null);
  const resultRef = useRef<Dataset | null>(null);
  const loadedVisualizationRef = useRef<{
    question: Question;
    result: Dataset;
    rawSeries: unknown;
  } | null>(null);
  const [pendingRenderFeedback, setPendingRenderFeedback] = useState<
    string | null
  >(null);
  const [selectedContext, setSelectedContext] =
    useState<MetabotAdhocQueryInfo | null>(null);
  const [selectedClicked, setSelectedClicked] = useState<ClickObject | null>(
    null,
  );
  const [selectedClickedViaMention, setSelectedClickedViaMention] =
    useState<ClickObject | null>(null);
  const [selectedClickedGroup, setSelectedClickedGroup] = useState<
    ClickObject[] | null
  >(null);
  const [isHighlightingSelection, setIsHighlightingSelection] = useState(false);
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);
  const [hasExpandedSources, setHasExpandedSources] = useState(false);
  const hasDataSources = useMemo(() => pathHasDataSources(path), [path]);
  const toggleSources = useCallback(() => {
    setIsSourcesExpanded((expanded) => !expanded);
    setHasExpandedSources(true);
  }, []);
  const { questionHash, questionName, questionKey } = useMemo(() => {
    // Computed from the raw path so the card can be matched to a chart link in
    // the reply text even if its query fails to deserialize/execute.
    const questionKey = normalizeQuestionLink(path);
    try {
      const card = deserializeCardFromQuery(path);
      return {
        questionHash: path.replace(/^\/question#/, ""),
        questionName: title || card.name || t`Generated question`,
        questionKey,
      };
    } catch {
      return {
        questionHash: null,
        questionName: title || t`Generated question`,
        questionKey,
      };
    }
  }, [path, title]);

  useRegisterMetabotContextProvider(
    async () =>
      selectedContext ? { user_is_viewing: [selectedContext] } : undefined,
    [selectedContext],
  );

  // Mirror the latest selection into refs so the registered router callbacks can
  // stay referentially stable (depending on the state directly would re-register
  // on every selection change).
  const selectedContextRef = useRef(selectedContext);
  selectedContextRef.current = selectedContext;
  const selectedClickedRef = useRef(selectedClicked);
  selectedClickedRef.current = selectedClicked;

  // Highlight a resolved data point in this card's chart. The router calls this
  // (after scrolling the card into view) when this card holds — or best-fits —
  // the clicked mention's row.
  const highlightClickedViaMention = useCallback(
    (clicked: ClickObject) => {
      const question = questionRef.current;
      const selectedData = getSelectedChartData(clicked);
      setSelectedClicked(null);
      setSelectedClickedViaMention(null);
      setSelectedClickedGroup(null);
      setIsHighlightingSelection(false);

      if (question && selectedData) {
        setSelectedContext({
          type: "adhoc",
          name: questionName,
          query: question.datasetQuery(),
          chart_configs: [
            {
              title: questionName,
              description: question.description() ?? undefined,
              query: question.datasetQuery(),
              display_type: question.display(),
              data: getChartData(resultRef.current),
              selected_data: selectedData,
            },
          ],
        });
      }

      requestAnimationFrame(() => {
        setSelectedClickedViaMention(clicked);
        setIsHighlightingSelection(true);
      });
    },
    [questionName],
  );

  // Re-highlight a selection the user themselves created in this card (a single
  // cell or a range) when its mention id is clicked again in the chat. Returns
  // true if this card owns the id.
  const resolveMentionId = useCallback((id: DataPointMentionId): boolean => {
    const selectedData =
      selectedContextRef.current?.chart_configs?.[0]?.selected_data;
    const selectedRange =
      selectedContextRef.current?.chart_configs?.[0]?.selected_range;
    if (id !== selectedData?.mention_id && id !== selectedRange?.mention_id) {
      return false;
    }

    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setSelectedClicked(null);
    setSelectedClickedViaMention(null);
    setIsHighlightingSelection(false);
    requestAnimationFrame(() => {
      setSelectedClickedViaMention(selectedClickedRef.current);
      setIsHighlightingSelection(true);
    });
    return true;
  }, []);

  // Briefly pulse the card border. Used when a chart link in the reply text is
  // clicked, to draw attention after scrolling the card into view.
  const flash = useCallback(() => setIsHighlightingSelection(true), []);

  const { cardId, cardMountOrder } = useMemo(() => {
    const order = nextDataPointCardMountOrder();
    return { cardId: `dpcard_${order}`, cardMountOrder: order };
  }, []);

  useEffect(() => {
    const card: DataPointCard = {
      id: cardId,
      mountedAt: cardMountOrder,
      getResult: () => resultRef.current,
      highlight: highlightClickedViaMention,
      scrollIntoView: () =>
        cardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      resolveMentionId,
      questionKey: questionKey ?? undefined,
      questionName,
      flash,
    };
    return registerDataPointCard(card);
  }, [
    cardId,
    cardMountOrder,
    highlightClickedViaMention,
    resolveMentionId,
    questionKey,
    questionName,
    flash,
  ]);

  // On-demand cards highlight their target once the result is available. The
  // result arrives asynchronously through the loader's render prop (not as a
  // dependency here), so poll a few animation frames until resultRef is ready.
  useEffect(() => {
    if (!autoHighlightTarget) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const tryHighlight = () => {
      if (cancelled) {
        return;
      }
      const result = resultRef.current;
      const clicked =
        getClickedObjectFromDataPointTarget(result, autoHighlightTarget) ??
        getFuzzyClickedObjectFromDataPointTarget(result, autoHighlightTarget)
          ?.clicked;
      if (clicked) {
        cardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        highlightClickedViaMention(clicked);
        return;
      }
      // ~2s of frames; the query usually resolves well before this.
      if (attempts++ < 120) {
        requestAnimationFrame(tryHighlight);
      }
    };
    tryHighlight();

    return () => {
      cancelled = true;
    };
  }, [autoHighlightTarget, highlightClickedViaMention]);

  useEffect(() => {
    const handleSelectionClick = (event: Event) => {
      const { targets } = getDataSelectionMentionEvent(event);
      const clickedObjects = getClickedObjectsFromDataSelection(
        resultRef.current,
        targets,
      );

      if (clickedObjects.length === 0) {
        return;
      }

      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setSelectedClicked(null);
      setSelectedClickedViaMention(null);
      setSelectedClickedGroup(null);
      setIsHighlightingSelection(false);

      requestAnimationFrame(() => {
        setSelectedClickedGroup(clickedObjects);
        setIsHighlightingSelection(true);
      });
    };

    window.addEventListener(
      "metabot:data-selection-mention-click",
      handleSelectionClick,
    );
    return () => {
      window.removeEventListener(
        "metabot:data-selection-mention-click",
        handleSelectionClick,
      );
    };
  }, []);

  useEffect(() => {
    if (!pendingRenderFeedback || isDoingScience) {
      return;
    }

    const feedback = pendingRenderFeedback;
    setPendingRenderFeedback(null);
    void (async () => {
      dispatch(
        submitInputAction({
          type: "text",
          message: feedback,
          context: await getChatContext(),
          agentId,
          metabot_id: metabotRequestId,
          hidden: true,
          suppressNavigateTo: true,
        }),
      );
    })();
  }, [
    agentId,
    dispatch,
    getChatContext,
    isDoingScience,
    metabotRequestId,
    pendingRenderFeedback,
  ]);

  const handleVisualizationRenderError = useCallback(
    ({
      question,
      error,
      context,
    }: {
      question: Question;
      error: unknown;
      context?: VisualizationRenderErrorContext;
    }) => {
      const display = question.display();
      if (!PLUGIN_CUSTOM_VIZ.isCustomVizDisplay(display)) {
        return;
      }

      const plugin = PLUGIN_CUSTOM_VIZ.getCustomVizPluginFromSettings(
        question.card().visualization_settings,
      );
      const details = {
        agentId,
        display,
        questionName: question.displayName() ?? questionName,
        path,
        plugin,
        error,
        context,
      };
      const feedbackKey = getCustomVizRenderFeedbackKey(details);
      if (submittedCustomVizRenderFeedbackKeys.has(feedbackKey)) {
        return;
      }

      const attemptKey = getCustomVizRenderFeedbackAttemptKey(details);
      const attemptCount =
        customVizRenderFeedbackAttemptCounts.get(attemptKey) ?? 0;
      if (attemptCount >= MAX_CUSTOM_VIZ_RENDER_FEEDBACK_ATTEMPTS) {
        return;
      }

      submittedCustomVizRenderFeedbackKeys.add(feedbackKey);
      customVizRenderFeedbackAttemptCounts.set(attemptKey, attemptCount + 1);
      setPendingRenderFeedback(getCustomVizRenderFeedbackPrompt(details));
    },
    [agentId, path, questionName],
  );

  const handleVisualizationClick = useCallback(
    (clicked: ClickObject | null) => {
      const question = questionRef.current;
      const result = resultRef.current;
      if (!question) {
        return;
      }

      const selectedData = getSelectedChartData(clicked);
      if (!selectedData) {
        return;
      }

      const mention = getDataPointMention(
        selectedData,
        dataPointTargetsRef.current,
      );
      const selectedDataWithMention = {
        ...selectedData,
        mention_id: mention.id,
      };

      if (mention.isGenerated && mention.target) {
        dispatch(
          rememberDataPointTarget({
            agentId,
            id: mention.id,
            target: mention.target,
          }),
        );
      }

      setSelectedClicked(clicked);
      setSelectedClickedViaMention(null);
      setSelectedClickedGroup(null);
      setIsHighlightingSelection(false);

      setSelectedContext({
        type: "adhoc",
        name: questionName,
        query: question.datasetQuery(),
        chart_configs: [
          {
            title: questionName,
            description: question.description() ?? undefined,
            query: question.datasetQuery(),
            display_type: question.display(),
            data: getChartData(result),
            selected_data: selectedDataWithMention,
          },
        ],
      });

      const mentionMarkdown = getDataPointMentionMarkdown(
        selectedData,
        mention.id,
      );
      const trimmedPrompt = (getPrompt(store.getState(), agentId) ?? "").trim();
      setPrompt(
        trimmedPrompt ? `${trimmedPrompt} ${mentionMarkdown}` : mentionMarkdown,
      );
      focusPromptInput();
    },
    [agentId, dispatch, focusPromptInput, questionName, setPrompt, store],
  );

  const handleTableSelectionMention = useCallback(
    (selection: TableSelectionMention) => {
      const question = questionRef.current;
      const result = resultRef.current;
      if (!question) {
        return;
      }

      const selectedRange = getSelectedChartRange(selection);
      const mentionId = getNextDataPointRangeMentionId();
      const selectedRangeWithMention = {
        ...selectedRange,
        mention_id: mentionId,
      };

      setSelectedClicked(null);
      setSelectedClickedViaMention(null);
      setIsHighlightingSelection(false);
      setSelectedContext({
        type: "adhoc",
        name: questionName,
        query: question.datasetQuery(),
        chart_configs: [
          {
            title: questionName,
            description: question.description() ?? undefined,
            query: question.datasetQuery(),
            display_type: question.display(),
            data: getChartData(result),
            selected_range: selectedRangeWithMention,
          },
        ],
      });

      const mention = getDataPointRangeMentionMarkdown(
        selectedRange,
        mentionId,
      );
      const trimmedPrompt = (getPrompt(store.getState(), agentId) ?? "").trim();
      setPrompt(trimmedPrompt ? `${trimmedPrompt} ${mention}` : mention);
      focusPromptInput();
    },
    [agentId, focusPromptInput, questionName, setPrompt, store],
  );

  return (
    <Box
      ref={cardRef}
      bd="1px solid var(--mb-color-border)"
      bdrs="sm"
      className={cx(Styles.agentPartCard, Styles.navigateToQuestionCard, {
        [Styles.navigateToQuestionCardHighlight]: isHighlightingSelection,
      })}
      data-testid="metabot-generated-question"
      onAnimationEnd={() => setIsHighlightingSelection(false)}
    >
      <Flex
        align="center"
        justify="space-between"
        gap="md"
        className={Styles.navigateToQuestionHeader}
      >
        {isQuestionLikeHref(path) ? (
          <Text
            component={ForwardRefLink}
            to={path}
            target="_blank"
            rel="noopener noreferrer"
            fw="bold"
            size="sm"
            truncate
            className={Styles.navigateToQuestionTitleLink}
          >
            {questionName}
          </Text>
        ) : (
          <Text fw="bold" size="sm" truncate>
            {questionName}
          </Text>
        )}
        {hasDataSources && (
          <Tooltip label={t`View data sources used`}>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-expanded={isSourcesExpanded}
              aria-label={
                isSourcesExpanded
                  ? t`Collapse data sources`
                  : t`Expand data sources`
              }
              onClick={toggleSources}
            >
              <Icon
                name="database"
                size={14}
                c={isSourcesExpanded ? "brand" : "text-secondary"}
              />
            </ActionIcon>
          </Tooltip>
        )}
      </Flex>
      {hasDataSources && (
        <Collapse in={isSourcesExpanded}>
          {hasExpandedSources && (
            <Box className={Styles.navigateToQuestionSources}>
              <NavigateToTablePills
                path={path}
                messageId={messageId}
                chromeless
              />
            </Box>
          )}
        </Collapse>
      )}
      {questionHash ? (
        <AdHocQuestionLoader questionHash={questionHash}>
          {({ question, loading: isLoadingQuestion, error: questionError }) => {
            if (questionError) {
              return <NavigateToQuestionError />;
            }

            if (isLoadingQuestion || !question) {
              return <NavigateToQuestionLoading />;
            }

            return (
              <QuestionResultLoader question={question} collectionPreview>
                {({ result, rawSeries, loading: isLoadingResult, error }) => {
                  if (result) {
                    loadedVisualizationRef.current = {
                      question,
                      result,
                      rawSeries,
                    };
                  }
                  const loadedVisualization = loadedVisualizationRef.current;
                  const visualizationQuestion =
                    loadedVisualization?.question ?? question;
                  const visualizationResult =
                    loadedVisualization?.result ?? result;
                  const visualizationRawSeries =
                    loadedVisualization?.rawSeries ?? rawSeries;
                  const isVisualizationRunning =
                    !loadedVisualization && (isLoadingResult || result == null);

                  questionRef.current = visualizationQuestion;
                  resultRef.current = visualizationResult;

                  return (
                    <Box className={Styles.navigateToQuestionVisualization}>
                      {error && !loadedVisualization ? (
                        <NavigateToQuestionError />
                      ) : (
                        <MemoizedQueryVisualization
                          question={visualizationQuestion}
                          result={visualizationResult}
                          rawSeries={visualizationRawSeries}
                          queryBuilderMode="view"
                          isRunnable={false}
                          isRunning={isVisualizationRunning}
                          isDirty={false}
                          isResultDirty={false}
                          maxTableRows={10}
                          clicked={selectedClicked}
                          clickedViaMention={selectedClickedViaMention}
                          clickedViaMentionGroup={selectedClickedGroup}
                          handleVisualizationClick={handleVisualizationClick}
                          onTableSelectionMention={handleTableSelectionMention}
                          onVisualizationRenderError={(
                            error: unknown,
                            context?: VisualizationRenderErrorContext,
                          ) =>
                            handleVisualizationRenderError({
                              question,
                              error,
                              context,
                            })
                          }
                        />
                      )}
                    </Box>
                  );
                }}
              </QuestionResultLoader>
            );
          }}
        </AdHocQuestionLoader>
      ) : (
        <NavigateToQuestionError />
      )}
    </Box>
  );
};

type OnDemandCardState = {
  key: string;
  path: string;
  target: DataPointMentionTarget;
};

// Hosts data-point cards rendered on demand: when a clicked mention can't be
// resolved against any card currently on screen (its source ran silently or in
// an earlier, now-unmounted turn), the router asks us to render the point's
// source question here so it can be highlighted in context.
export const DataPointOnDemandHost = ({
  agentId,
  dataPointTargets,
}: {
  agentId: MetabotAgentId;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
}) => {
  const [cards, setCards] = useState<OnDemandCardState[]>([]);
  const keyRef = useRef(0);

  useEffect(() => {
    const handler: OnDemandHandler = (target) => {
      const url = target.source?.question_url;
      if (!url) {
        return;
      }
      setCards((prev) => {
        // The registry routes to a mounted card whenever one can resolve the
        // point, so we only get here when none exists. Guard against re-adding
        // the same source if two still-unresolved points share it.
        if (prev.some((card) => card.path === url)) {
          return prev;
        }
        keyRef.current += 1;
        return [
          ...prev,
          { key: `ondemand_${keyRef.current}`, path: url, target },
        ];
      });
    };
    return setDataPointOnDemandHandler(handler);
  }, []);

  if (cards.length === 0) {
    return null;
  }

  return (
    <Stack gap="md" data-testid="metabot-data-point-on-demand">
      {cards.map((card) => (
        <EmbeddedQuestionCard
          key={card.key}
          agentId={agentId}
          path={card.path}
          title={t`Source data`}
          dataPointTargets={dataPointTargets}
          autoHighlightTarget={card.target}
        />
      ))}
    </Stack>
  );
};

const NavigateToQuestionError = () => (
  <Box className={Styles.navigateToQuestionVisualization}>
    <Flex h="100%" align="center" justify="center">
      <Text c="text-secondary" size="sm">
        {t`Could not load the generated question.`}
      </Text>
    </Flex>
  </Box>
);

const NavigateToQuestionLoading = () => (
  <Box className={Styles.navigateToQuestionVisualization}>
    <Flex h="100%" align="center" justify="center">
      <Text c="text-secondary" size="sm">
        {t`Loading generated question...`}
      </Text>
    </Flex>
  </Box>
);

const DataPartJsonCard = ({
  type,
  value,
}: {
  type: string;
  value: unknown;
}) => {
  const clipboard = useClipboard();
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <Box
      bd="1px solid var(--mb-color-border)"
      bdrs="sm"
      className={Styles.agentPartCard}
    >
      <Flex
        py="sm"
        px="md"
        direction="row"
        align="center"
        justify="space-between"
      >
        <Flex align="center">
          <Icon name="document" c="text-secondary" mr="sm" />
          <Text fw="bold">{type}</Text>
        </Flex>
        <ActionIcon
          h="sm"
          onClick={() => clipboard.copy(formatted)}
          className={cx(Styles.agentPartActions, Styles.agentPartActionIcon)}
        >
          <Icon name="copy" size="1rem" />
        </ActionIcon>
      </Flex>
      <Box
        p="sm"
        bg="background-primary"
        style={{
          borderTop: "1px solid var(--mb-color-border)",
          borderBottomLeftRadius: "var(--mantine-radius-sm)",
          borderBottomRightRadius: "var(--mantine-radius-sm)",
        }}
      >
        <Box
          component="pre"
          m={0}
          style={{
            fontFamily: "var(--mb-default-monospace-font-family)",
            fontSize: "0.75rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowX: "auto",
          }}
        >
          {formatted}
        </Box>
      </Box>
    </Box>
  );
};

const CodeEditDataPart = ({
  type,
  value,
}: {
  type: string;
  value: MetabotCodeEdit;
}) => {
  const clipboard = useClipboard();

  return (
    <Box
      bd="1px solid var(--mb-color-border)"
      bdrs="sm"
      className={Styles.agentPartCard}
    >
      <Flex
        py="sm"
        px="md"
        direction="row"
        align="center"
        justify="space-between"
      >
        <Flex align="center" gap="sm">
          <Icon name="document" c="text-secondary" />
          <Text fw="bold">{type}</Text>
          <Text c="text-secondary">{t`Buffer ID: ${value.buffer_id}`}</Text>
          <Badge variant="light" size="sm">
            {value.mode}
          </Badge>
        </Flex>
        <ActionIcon
          h="sm"
          onClick={() => clipboard.copy(value.value)}
          className={cx(Styles.agentPartActions, Styles.agentPartActionIcon)}
        >
          <Icon name="copy" size="1rem" />
        </ActionIcon>
      </Flex>
      <Box
        style={{
          borderTop: "1px solid var(--mb-color-border)",
          borderBottomLeftRadius: "var(--mantine-radius-sm)",
          borderBottomRightRadius: "var(--mantine-radius-sm)",
          overflow: "hidden",
        }}
      >
        <CodeEditor value={value.value} language="sql" readOnly />
      </Box>
    </Box>
  );
};
