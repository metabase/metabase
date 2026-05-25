import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { AdHocQuestionLoader } from "metabase/common/components/AdHocQuestionLoader";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { ForwardRefLink } from "metabase/common/components/Link";
import { QuestionResultLoader } from "metabase/common/components/QuestionResultLoader";
import { deserializeCardFromQuery } from "metabase/common/utils/card";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type {
  MetabotAgentDataPartMessage,
  MetabotAgentId,
} from "metabase/metabot/state";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Flex,
  Icon,
  Stack,
  Text,
} from "metabase/ui";
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
import { useMetabotQuestionFullscreen } from "./MetabotQuestionFullscreenContext";
import {
  getChartData,
  getDataPointMentionEventId,
  getDataPointMentionMarkdown,
  getDataPointRangeMentionMarkdown,
  getNextDataPointMentionId,
  getSelectedChartData,
  getSelectedChartRange,
} from "./data-point-mentions";

type AgentDataPartMessageProps = {
  agentId: MetabotAgentId;
  message: MetabotAgentDataPartMessage;
  readonly: boolean;
  debug: boolean;
};

export const AgentDataPartMessage = ({
  agentId,
  message,
  readonly,
  debug,
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
          <NavigateToQuestionCard agentId={agentId} path={part.value} />
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
    .with({ part: { type: "adhoc_viz" } }, ({ part }) =>
      debug ? <DataPartJsonCard type={part.type} value={part.value} /> : null,
    )
    .with({ part: { type: "static_viz" } }, ({ part }) =>
      debug ? <DataPartJsonCard type={part.type} value={part.value} /> : null,
    )
    .exhaustive((msg: unknown) => {
      console.warn("AgentDataPartMessage received an unexpected value:", msg);
      return null;
    });

const NavigateToQuestionCard = ({
  agentId,
  path,
}: {
  agentId: MetabotAgentId;
  path: string;
}) => {
  const { prompt, setPrompt, focusPromptInput } = useMetabotAgent(agentId);
  const { fullscreenQuestion, openFullscreenQuestion } =
    useMetabotQuestionFullscreen();
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedContext, setSelectedContext] =
    useState<MetabotAdhocQueryInfo | null>(null);
  const [selectedClicked, setSelectedClicked] = useState<ClickObject | null>(
    null,
  );
  const [isHighlightingSelection, setIsHighlightingSelection] = useState(false);
  const { questionHash, questionName } = useMemo(() => {
    try {
      const card = deserializeCardFromQuery(path);
      return {
        questionHash: path.replace(/^\/question#/, ""),
        questionName: card.name || t`Untitled question`,
      };
    } catch {
      return {
        questionHash: null,
        questionName: t`Untitled question`,
      };
    }
  }, [path]);
  const isOpenInFullscreen = fullscreenQuestion?.path === path;

  useRegisterMetabotContextProvider(
    async () =>
      selectedContext ? { user_is_viewing: [selectedContext] } : undefined,
    [selectedContext],
  );

  useEffect(() => {
    const handleMentionClick = (event: Event) => {
      const mentionId = getDataPointMentionEventId(event);
      const selectedData = selectedContext?.chart_configs?.[0]?.selected_data;
      const selectedRange = selectedContext?.chart_configs?.[0]?.selected_range;
      if (
        !mentionId ||
        (mentionId !== selectedData?.mention_id &&
          mentionId !== selectedRange?.mention_id)
      ) {
        return;
      }

      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setSelectedClicked(null);
      setIsHighlightingSelection(false);
      requestAnimationFrame(() => {
        setSelectedClicked(selectedClicked);
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
  }, [selectedClicked, selectedContext]);

  const handleVisualizationClick = useCallback(
    ({
      question,
      result,
      clicked,
    }: {
      question: Question;
      result: Dataset | null;
      clicked: ClickObject | null;
    }) => {
      const selectedData = getSelectedChartData(clicked);
      if (!selectedData) {
        return;
      }

      const mentionId = getNextDataPointMentionId();
      const selectedDataWithMention = {
        ...selectedData,
        mention_id: mentionId,
      };

      setSelectedClicked(clicked);
      setIsHighlightingSelection(false);

      setSelectedContext({
        type: "adhoc",
        name: question.displayName() ?? undefined,
        query: question.datasetQuery(),
        chart_configs: [
          {
            title: question.displayName(),
            description: question.description() ?? undefined,
            query: question.datasetQuery(),
            display_type: question.display(),
            data: getChartData(result),
            selected_data: selectedDataWithMention,
          },
        ],
      });

      const mention = getDataPointMentionMarkdown(selectedData, mentionId);
      const trimmedPrompt = prompt.trim();
      setPrompt(trimmedPrompt ? `${trimmedPrompt} ${mention}` : mention);
      focusPromptInput();
    },
    [focusPromptInput, prompt, setPrompt],
  );

  const handleTableSelectionMention = useCallback(
    ({
      question,
      result,
      selection,
    }: {
      question: Question;
      result: Dataset | null;
      selection: TableSelectionMention;
    }) => {
      const selectedRange = getSelectedChartRange(selection);
      const mentionId = getNextDataPointMentionId();
      const selectedRangeWithMention = {
        ...selectedRange,
        mention_id: mentionId,
      };

      setSelectedClicked(null);
      setIsHighlightingSelection(false);
      setSelectedContext({
        type: "adhoc",
        name: question.displayName() ?? undefined,
        query: question.datasetQuery(),
        chart_configs: [
          {
            title: question.displayName(),
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
      const trimmedPrompt = prompt.trim();
      setPrompt(trimmedPrompt ? `${trimmedPrompt} ${mention}` : mention);
      focusPromptInput();
    },
    [focusPromptInput, prompt, setPrompt],
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
        {isOpenInFullscreen ? (
          <Text c="text-secondary" size="sm" flex="0 0 auto">
            {t`Opened in fullscreen`}
          </Text>
        ) : (
          <Button
            variant="subtle"
            size="compact-sm"
            flex="0 0 auto"
            rightSection={<Icon name="expand" size="1rem" />}
            onClick={() =>
              openFullscreenQuestion({ path, title: questionName })
            }
          >
            {t`Open in fullscreen`}
          </Button>
        )}
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
                {({ result, rawSeries, loading: isLoadingResult, error }) => (
                  <Box className={Styles.navigateToQuestionVisualization}>
                    {error ? (
                      <NavigateToQuestionError />
                    ) : (
                      <QueryVisualization
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
                        handleVisualizationClick={(
                          clicked: ClickObject | null,
                        ) =>
                          handleVisualizationClick({
                            question,
                            result,
                            clicked,
                          })
                        }
                        onTableSelectionMention={(
                          selection: TableSelectionMention,
                        ) =>
                          handleTableSelectionMention({
                            question,
                            result,
                            selection,
                          })
                        }
                      />
                    )}
                  </Box>
                )}
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
