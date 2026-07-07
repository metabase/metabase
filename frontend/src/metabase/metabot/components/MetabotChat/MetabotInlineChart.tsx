import { useClipboard } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";
import { noop } from "underscore";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetCardQuery,
} from "metabase/api";
import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { useSaveMetabotEntityMutation } from "metabase/api/metabot";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { useSetting } from "metabase/common/hooks";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import {
  type MetabotAgentId,
  getMetabotConversation,
  getSavedChartCardId,
  markChartSaved,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { push } from "metabase/router";
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Center,
  Flex,
  Icon,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import Visualization from "metabase/visualizations/components/Visualization";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import {
  getDatasetError,
  getGenericErrorMessage,
} from "metabase/visualizations/lib/errors";
import Question from "metabase-lib/v1/Question";
import type { DashboardTabId } from "metabase-types/api";

import S from "./MetabotInlineChart.module.css";

/**
 * Renders a Metabot-generated `card` entity as a live, read-only chart inline in
 * the conversation: it runs the card's embedded query ad-hoc and renders the
 * result; the title bar links out to the full question.
 */
export function MetabotInlineChart({
  value: { id: entityId, title, description, display, query },
  readonly = false,
  agentId = "omnibot",
}: {
  value: GeneratedCard;
  readonly?: boolean;
  agentId?: MetabotAgentId;
}) {
  const datasetQuery = query.query;
  const clipboard = useClipboard();
  const recordedCardId = useSelector((state) =>
    getSavedChartCardId(state, entityId),
  );
  const siteUrl = useSetting("site-url");

  // Editing (or deleting) the saved card severs its provenance link, so verify
  // the recorded save against the card itself. Subscribing via RTK Query means
  // an in-app edit invalidates the card tag and this flips back to unsaved
  // immediately. Only positive evidence unsaves: while loading, stay optimistic.
  const { data: savedCard, error: savedCardError } = useGetCardQuery(
    recordedCardId != null
      ? { id: recordedCardId, ignore_error: true }
      : skipToken,
  );
  const isLinkSevered =
    savedCardError != null ||
    (savedCard != null && savedCard.metabot_chart_id !== entityId);
  const savedCardId = isLinkSevered ? undefined : recordedCardId;

  const question = useMemo(() => {
    const base = new Question({
      dataset_query: datasetQuery,
      visualization_settings: {},
      name: title,
      description,
      ...(display != null ? { display, displayIsLocked: true } : {}),
    });
    return display != null ? base : base.setDefaultDisplay();
  }, [datasetQuery, title, description, display]);

  const card = useMemo(() => question.card(), [question]);

  const clipboardPayload = useMemo(
    () =>
      serializeChartClipboard(
        {
          name: title,
          description,
          display: question.display(),
          dataset_query: datasetQuery,
          visualization_settings: {},
        },
        siteUrl,
      ),
    [title, description, question, datasetQuery, siteUrl],
  );

  const link = useMemo(
    () =>
      savedCardId != null
        ? Urls.question(question.setId(savedCardId))
        : `/question#${serializeCardForUrl(card, { includeDisplayIsLocked: true })}`,
    [card, question, savedCardId],
  );

  const { data: dataset, error } = useGetAdhocQueryQuery(datasetQuery);

  const rawSeries = useMemo(
    () => (dataset ? [{ card, data: dataset.data }] : null),
    [card, dataset],
  );

  const datasetError = dataset ? getDatasetError(dataset) : undefined;
  const requestError = error
    ? { message: getGenericErrorMessage(), icon: "warning" as const }
    : undefined;
  const chartError = datasetError ?? requestError;

  return (
    <Box className={S.container} data-testid="metabot-inline-chart">
      <Flex className={S.header} align="center" gap="sm">
        <Anchor
          className={S.title}
          component={ForwardRefLink}
          to={link}
          target="_blank"
          fw="bold"
          flex={1}
          miw={0}
          truncate
        >
          {title}
        </Anchor>
        <Tooltip label={clipboard.copied ? t`Copied` : t`Copy chart`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`Copy chart`}
            onClick={() => clipboard.copy(clipboardPayload)}
          >
            <Icon name="copy" size={16} />
          </ActionIcon>
        </Tooltip>
        <SaveChartAction
          agentId={agentId}
          entityId={entityId}
          savedCardId={savedCardId}
          question={question}
          readonly={readonly}
        />
      </Flex>
      <Box className={S.viz}>
        {chartError ? (
          <Center h="100%" p="md">
            <ErrorView error={chartError.message} icon={chartError.icon} />
          </Center>
        ) : !rawSeries ? (
          <LoadingAndErrorWrapper loading />
        ) : (
          <Visualization
            rawSeries={rawSeries}
            isQueryBuilder={false}
            onChangeCardAndRun={noop}
          />
        )}
      </Box>
    </Box>
  );
}

function SaveChartAction({
  agentId,
  entityId,
  savedCardId,
  question,
  readonly,
}: {
  agentId: MetabotAgentId;
  entityId: string;
  savedCardId: number | undefined;
  question: Question;
  readonly: boolean;
}) {
  const dispatch = useDispatch();
  const [saveMetabotEntity] = useSaveMetabotEntityMutation();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const conversationId = useSelector(
    (state) => getMetabotConversation(state, agentId).conversationId,
  );

  const handleCreate = async (
    newQuestion: Question,
    options?: { dashboardTabId?: DashboardTabId },
  ) => {
    // One request creates the card AND stamps its Metabot provenance columns, so
    // the two cannot desync and the saved-state verification fetch never races
    // the stamp.
    const created = await saveMetabotEntity({
      conversation_id: conversationId,
      entity_id: entityId,
      card: {
        ...newQuestion.card(),
        dashboard_tab_id: options?.dashboardTabId,
      },
    }).unwrap();
    const savedQuestion = newQuestion.setId(created.id);
    dispatch(markChartSaved({ entityId, cardId: created.id }));
    dispatch(
      addUndo({
        icon: "check_filled",
        message: t`Saved`,
        extraAction: {
          label: t`View`,
          action: () => dispatch(push(Urls.question(savedQuestion))),
        },
      }),
    );
    return savedQuestion;
  };

  return (
    <>
      {match({ savedCardId, readonly })
        .with({ savedCardId: P.number }, ({ savedCardId }) => (
          <Button
            component={ForwardRefLink}
            to={Urls.question(question.setId(savedCardId))}
            target="_blank"
            variant="subtle"
            color="text-secondary"
            size="compact-xs"
            leftSection={<Icon name="check" size={14} />}
          >
            {t`Saved`}
          </Button>
        ))
        .with({ readonly: true }, () => null)
        .with({ savedCardId: P.nullish, readonly: false }, () => (
          <Button
            variant="subtle"
            size="compact-xs"
            onClick={() => setIsSaveModalOpen(true)}
          >
            {t`Save`}
          </Button>
        ))
        .exhaustive()}
      {isSaveModalOpen && (
        <SaveQuestionModal
          opened
          question={question}
          originalQuestion={null}
          onCreate={handleCreate}
          onSave={async () => undefined}
          onClose={() => setIsSaveModalOpen(false)}
          closeOnSuccess
        />
      )}
    </>
  );
}
