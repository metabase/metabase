import { useClipboard, useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetCardQuery,
} from "metabase/api";
import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import { getSavedChartCardId } from "metabase/metabot/state";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
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
import { isResourceNotFoundError } from "metabase/utils/errors";
import Visualization from "metabase/visualizations/components/Visualization";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import { getDatasetError, getGenericErrorMessage } from "metabase/viz-core";
import Question from "metabase-lib/v1/Question";

import S from "./MetabotInlineChart.module.css";
import { SaveChartAction } from "./SaveChartAction";

/**
 * Renders a Metabot-generated `card` entity as a live, read-only chart inline in
 * the conversation: it runs the card's embedded query ad-hoc and renders the
 * result, in readonly mode only once Run query is clicked; the title bar links
 * out to the full question.
 */
export function MetabotInlineChart({
  value,
  readonly = false,
  conversationId,
  size,
}: {
  value: GeneratedCard;
  readonly?: boolean;
  conversationId: string;
  size: "md" | "lg";
}) {
  const { id: chartId, title, description, display, query } = value;
  const datasetQuery = query.query;
  const clipboard = useClipboard();
  const recordedCardId = useSelector((state) =>
    getSavedChartCardId(state, chartId),
  );
  const siteUrl = useSetting("site-url");

  const { data: savedCard, error: savedCardError } = useGetCardQuery(
    recordedCardId != null
      ? { id: recordedCardId, ignore_error: true }
      : skipToken,
  );
  const isLinkSevered =
    isResourceNotFoundError(savedCardError) ||
    (savedCard != null && savedCard.metabot_chart_id !== chartId);
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
        : Urls.generatedCard(value),
    [question, savedCardId, value],
  );

  const [isRunRequested, { open: requestRun }] = useDisclosure(false);
  const shouldRunQuery = !readonly || isRunRequested;
  const { data: dataset, error } = useGetAdhocQueryQuery(
    shouldRunQuery ? datasetQuery : skipToken,
  );

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
    <Box
      className={cx(S.container, size === "lg" && S.large)}
      data-testid="metabot-inline-chart"
    >
      <Flex className={S.header} align="center" gap="sm">
        <Anchor
          className={S.title}
          component={ForwardRefLink}
          to={link}
          target="_blank"
          fw="bold"
          size="md"
          lh="1rem"
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
          conversationId={conversationId}
          chartId={chartId}
          savedCardId={savedCardId}
          question={question}
          readonly={readonly}
        />
      </Flex>
      <Box className={S.viz}>
        {!shouldRunQuery ? (
          <Center h="100%" p="lg">
            <Button
              variant="filled"
              leftSection={<Icon name="play_outlined" aria-hidden />}
              onClick={requestRun}
            >
              {t`Run query`}
            </Button>
          </Center>
        ) : chartError ? (
          <Center h="100%" p="lg">
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
