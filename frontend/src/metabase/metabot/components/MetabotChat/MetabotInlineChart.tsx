import { useClipboard } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import { noop } from "underscore";

import { useCreateCardMutation, useGetAdhocQueryQuery } from "metabase/api";
import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import { getSavedChartCardId, markChartSaved } from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
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
 * result; the title bar links out to the full question and lets the user save it.
 */
export function MetabotInlineChart({
  value: { id: entityId, title, description, display, query },
  readonly = false,
}: {
  value: GeneratedCard;
  readonly?: boolean;
}) {
  const datasetQuery = query.query;
  const dispatch = useDispatch();
  const clipboard = useClipboard();
  const [createCard] = useCreateCardMutation();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const savedCardId = useSelector((state) =>
    getSavedChartCardId(state, entityId),
  );

  const clipboardPayload = useMemo(
    () =>
      serializeChartClipboard({
        name: title,
        description,
        display: display ?? "table",
        dataset_query: datasetQuery,
        visualization_settings: {},
      }),
    [title, description, display, datasetQuery],
  );

  const handleCopyEvent = (event: React.ClipboardEvent) => {
    const hasTextSelection = !!window.getSelection()?.toString();
    if (hasTextSelection) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData("text/plain", clipboardPayload);
  };

  const question = useMemo(
    () =>
      new Question({
        dataset_query: datasetQuery,
        display: display ?? "table",
        displayIsLocked: display != null,
        visualization_settings: {},
      })
        .setDisplayName(title)
        .setDescription(description ?? null),
    [datasetQuery, display, title, description],
  );

  const card = useMemo(() => question.card(), [question]);

  const link = useMemo(
    () =>
      `/question#${serializeCardForUrl(card, { includeDisplayIsLocked: true })}`,
    [card],
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

  const handleCreate = async (
    newQuestion: Question,
    options?: { dashboardTabId?: DashboardTabId },
  ) => {
    const created = await createCard({
      ...newQuestion.card(),
      dashboard_tab_id: options?.dashboardTabId,
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
    <Box
      className={S.container}
      data-testid="metabot-inline-chart"
      tabIndex={0}
      onCopy={handleCopyEvent}
    >
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
        {savedCardId != null && (
          <Anchor
            component={ForwardRefLink}
            to={Urls.question(question.setId(savedCardId))}
            target="_blank"
            size="sm"
            c="text-secondary"
          >
            <Flex align="center" gap="xs">
              <Icon name="check" size={14} />
              {t`Saved`}
            </Flex>
          </Anchor>
        )}
        {savedCardId == null && !readonly && (
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setIsSaveModalOpen(true)}
          >
            {t`Save`}
          </Button>
        )}
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
    </Box>
  );
}
