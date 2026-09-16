import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";
import { noop } from "underscore";

import { skipToken, useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import type { ShownEntity } from "metabase/api/ai-streaming/schemas";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Anchor, Box, Button, Center, Flex, Icon, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import { getDatasetError, getGenericErrorMessage } from "metabase/viz-core";
import type { CardId, IconName } from "metabase-types/api";

import S from "./MetabotInlineChart.module.css";

export function MetabotShownEntity({
  value,
  readonly,
}: {
  value: ShownEntity;
  readonly: boolean;
}) {
  const icon = match(value.type)
    .returnType<IconName>()
    .with("question", () => "io")
    .with("model", () => "model")
    .with("metric", () => "metric")
    .with("dashboard", () => "dashboard")
    .with("document", () => "document")
    .with("table", () => "table")
    .exhaustive();
  const isCard =
    value.type === "question" ||
    value.type === "model" ||
    value.type === "metric";

  return (
    <Box className={S.container} data-testid="metabot-shown-entity">
      <Flex className={S.header} align="center" gap="sm">
        <Icon name={icon} c="brand" />
        <Anchor
          className={S.title}
          component={ForwardRefLink}
          to={value.url}
          target="_blank"
          fw="bold"
          flex={1}
          miw={0}
          truncate
        >
          {value.title}
        </Anchor>
      </Flex>
      {isCard && <SavedChart cardId={value.id} readonly={readonly} />}
    </Box>
  );
}

function SavedChart({
  cardId,
  readonly,
}: {
  cardId: CardId;
  readonly: boolean;
}) {
  const [isRunRequested, { open: requestRun }] = useDisclosure(false);
  const shouldRunQuery = !readonly || isRunRequested;
  const { data: card, error: cardError } = useGetCardQuery({
    id: cardId,
    ignore_error: true,
  });
  const { data: dataset, error: queryError } = useGetCardQueryQuery(
    shouldRunQuery && card && !card.archived && !cardError
      ? { cardId }
      : skipToken,
  );
  const rawSeries = useMemo(
    () => (card && dataset ? [{ card, data: dataset.data }] : null),
    [card, dataset],
  );
  const datasetError = dataset ? getDatasetError(dataset) : undefined;
  const error =
    datasetError ??
    (queryError
      ? { message: getGenericErrorMessage(), icon: "warning" as const }
      : undefined);

  return (
    <Box className={S.viz}>
      {cardError || card?.archived ? (
        <Center h="100%" p="lg">
          <Text c="text-secondary">{t`This item is no longer available.`}</Text>
        </Center>
      ) : !shouldRunQuery ? (
        <Center h="100%" p="lg">
          <Button
            variant="filled"
            leftSection={<Icon name="play_outlined" aria-hidden />}
            onClick={requestRun}
          >
            {t`Run query`}
          </Button>
        </Center>
      ) : error ? (
        <Center h="100%" p="lg">
          <ErrorView error={error.message} icon={error.icon} />
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
  );
}
