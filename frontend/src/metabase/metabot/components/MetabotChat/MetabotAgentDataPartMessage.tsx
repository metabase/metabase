import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { AdhocVizValue } from "metabase/api/ai-streaming/schemas";
import { AdHocQuestionLoader } from "metabase/common/components/AdHocQuestionLoader";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { ForwardRefLink } from "metabase/common/components/Link";
import { QuestionResultLoader } from "metabase/common/components/QuestionResultLoader";
import { deserializeCardFromQuery } from "metabase/common/utils/card";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import {
  type MetabotAgentDataPartMessage,
  type MetabotAgentId,
  focusPromptInput as focusPromptInputAction,
  getPrompt,
  rememberDataPointTarget,
  setPrompt as setPromptAction,
} from "metabase/metabot/state";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import { useDispatch, useStore } from "metabase/redux";
import { ActionIcon, Badge, Box, Flex, Icon, Stack, Text } from "metabase/ui";
import type { TableSelectionMention } from "metabase/visualizations/types";
import type { ClickObject } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  Dataset,
  MetabotAdhocQueryInfo,
  MetabotCodeEdit,
} from "metabase-types/api";

import {
  CodeEditTablePills,
  NavigateToTablePills,
} from "./MetabotAgentDataSourcePills";
import { AgentSuggestionMessage } from "./MetabotAgentSuggestionMessage";
import { AgentTodoListMessage } from "./MetabotAgentTodoMessage";
import Styles from "./MetabotChat.module.css";
import {
  type DataPointMentionTarget,
  getChartData,
  getClickedObjectFromDataPointTarget,
  getClickedObjectsFromDataSelection,
  getDataPointMention,
  getDataPointMentionEvent,
  getDataPointMentionEventId,
  getDataPointMentionMarkdown,
  getDataPointRangeMentionMarkdown,
  getDataSelectionMentionEvent,
  getNextDataPointRangeMentionId,
  getSelectedChartData,
  getSelectedChartRange,
} from "./data-point-mentions";

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
    .with({ part: { type: "navigate_to" } }, ({ part }) => {
      const sourcePills = (
        <NavigateToTablePills
          path={part.value}
          messageId={readonly ? undefined : message.externalId}
        />
      );

      return (
        <Stack gap="md">
          {debug && <NavigateToDataPart type={part.type} path={part.value} />}
          <EmbeddedQuestionCard
            agentId={agentId}
            path={part.value}
            dataPointTargets={dataPointTargets}
          />
          {sourcePills}
        </Stack>
      );
    })
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
      />
    ))
    .with({ part: { type: "static_viz" } }, ({ part }) =>
      debug ? <DataPartJsonCard type={part.type} value={part.value} /> : null,
    )
    .exhaustive((msg: unknown) => {
      console.warn("AgentDataPartMessage received an unexpected value:", msg);
      return null;
    });

const EmbeddedAdhocViz = ({
  agentId,
  value,
  debug,
  dataPointTargets,
}: {
  agentId: MetabotAgentId;
  value: AdhocVizValue;
  debug: boolean;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
}) => {
  const sourcePills = (
    <NavigateToTablePills path={value.link} messageId={undefined} />
  );

  return (
    <Stack gap="md">
      {debug && <DataPartJsonCard type="adhoc_viz" value={value} />}
      <EmbeddedQuestionCard
        agentId={agentId}
        path={value.link}
        title={value.title}
        dataPointTargets={dataPointTargets}
      />
      {sourcePills}
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
    prev.onTableSelectionMention === next.onTableSelectionMention,
);

const EmbeddedQuestionCard = ({
  agentId,
  path,
  title,
  dataPointTargets,
}: {
  agentId: MetabotAgentId;
  path: string;
  title?: string;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
}) => {
  const dispatch = useDispatch();
  const store = useStore();
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
  const { questionHash, questionName } = useMemo(() => {
    try {
      const card = deserializeCardFromQuery(path);
      return {
        questionHash: path.replace(/^\/question#/, ""),
        questionName: title || card.name || t`Generated question`,
      };
    } catch {
      return {
        questionHash: null,
        questionName: title || t`Generated question`,
      };
    }
  }, [path, title]);

  useRegisterMetabotContextProvider(
    async () =>
      selectedContext ? { user_is_viewing: [selectedContext] } : undefined,
    [selectedContext],
  );

  useEffect(() => {
    const handleMentionClick = (event: Event) => {
      const mentionEvent = getDataPointMentionEvent(event);
      const mentionTarget =
        mentionEvent.target ??
        (mentionEvent.id != null
          ? dataPointTargets?.[String(mentionEvent.id)]
          : undefined);
      const clickedFromTarget = getClickedObjectFromDataPointTarget(
        resultRef.current,
        mentionTarget,
      );
      console.warn("[metabot data-point] embedded card mention event", {
        mentionEvent,
        mentionTarget,
        hasResult: resultRef.current != null,
        resultRowCount: resultRef.current?.data?.rows?.length,
        clickedFromTarget,
      });

      if (clickedFromTarget) {
        const question = questionRef.current;
        const selectedData = getSelectedChartData(clickedFromTarget);
        console.warn("[metabot data-point] embedded card target resolved", {
          hasQuestion: question != null,
          selectedData,
        });
        cardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
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
          console.warn("[metabot data-point] embedded card setting clicked", {
            clickedFromTarget,
          });
          setSelectedClickedViaMention(clickedFromTarget);
          setIsHighlightingSelection(true);
        });
        return;
      }

      const mentionId = getDataPointMentionEventId(event);
      const selectedData = selectedContext?.chart_configs?.[0]?.selected_data;
      const selectedRange = selectedContext?.chart_configs?.[0]?.selected_range;
      if (
        !mentionId ||
        (mentionId !== selectedData?.mention_id &&
          mentionId !== selectedRange?.mention_id)
      ) {
        console.warn("[metabot data-point] embedded card mention ignored", {
          mentionId,
          selectedDataMentionId: selectedData?.mention_id,
          selectedRangeMentionId: selectedRange?.mention_id,
        });
        return;
      }

      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setSelectedClicked(null);
      setSelectedClickedViaMention(null);
      setIsHighlightingSelection(false);
      requestAnimationFrame(() => {
        console.warn("[metabot data-point] embedded card restoring clicked", {
          selectedClicked,
        });
        setSelectedClickedViaMention(selectedClicked);
        setIsHighlightingSelection(true);
      });
    };

    window.addEventListener(
      "metabot:data-point-mention-click",
      handleMentionClick,
    );
    return () => {
      window.removeEventListener(
        "metabot:data-point-mention-click",
        handleMentionClick,
      );
    };
  }, [dataPointTargets, questionName, selectedClicked, selectedContext]);

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
        <Text fw="bold" size="sm" truncate>
          {questionName}
        </Text>
      </Flex>
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
                  questionRef.current = question;
                  resultRef.current = result;

                  return (
                    <Box className={Styles.navigateToQuestionVisualization}>
                      {error ? (
                        <NavigateToQuestionError />
                      ) : (
                        <MemoizedQueryVisualization
                          question={question}
                          result={result}
                          rawSeries={rawSeries}
                          queryBuilderMode="view"
                          isRunnable={false}
                          isRunning={isLoadingResult || result == null}
                          isDirty={false}
                          isResultDirty={false}
                          maxTableRows={10}
                          clicked={selectedClicked}
                          clickedViaMention={selectedClickedViaMention}
                          clickedViaMentionGroup={selectedClickedGroup}
                          handleVisualizationClick={handleVisualizationClick}
                          onTableSelectionMention={handleTableSelectionMention}
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

const NavigateToDataPart = ({ type, path }: { type: string; path: string }) => (
  <Flex
    direction="row"
    align="center"
    justify="space-between"
    bd="1px solid var(--mb-color-border)"
    bdrs="sm"
    className={Styles.agentPartCard}
    p="sm"
    pl="md"
  >
    <Flex align="center">
      <Icon name="document" c="text-secondary" mr="sm" />
      <Text fw="bold">{type}</Text>
    </Flex>
    <ActionIcon
      component={ForwardRefLink}
      to={path}
      target="_blank"
      h="sm"
      aria-label={t`Visit`}
      className={cx(Styles.agentPartActions, Styles.agentPartActionIcon)}
    >
      <Icon name="external" size="1rem" />
    </ActionIcon>
  </Flex>
);

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
