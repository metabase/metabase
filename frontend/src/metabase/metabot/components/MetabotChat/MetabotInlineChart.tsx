import { useMemo } from "react";
import { noop } from "underscore";

import { useGetAdhocQueryQuery } from "metabase/api";
import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { Anchor, Box, Center, Flex } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import {
  getDatasetError,
  getGenericErrorMessage,
} from "metabase/visualizations/lib/errors";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import S from "./MetabotInlineChart.module.css";

/**
 * Renders a Metabot-generated `card` entity as a live, read-only chart inline in
 * the conversation: it runs the card's embedded query ad-hoc and renders the
 * result; the title bar links out to the full question.
 */
export function MetabotInlineChart({
  value: { title, display, query },
}: {
  value: GeneratedCard;
}) {
  const datasetQuery = query.query;

  const card: Card = useMemo(
    () =>
      new Question({
        dataset_query: datasetQuery,
        display: display ?? "table",
        displayIsLocked: display != null,
        visualization_settings: {},
      }).card(),
    [datasetQuery, display],
  );

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

  return (
    <Box className={S.container} data-testid="metabot-inline-chart">
      <Flex className={S.header} align="center" gap="sm">
        <Anchor
          className={S.title}
          component={ForwardRefLink}
          to={link}
          target="_blank"
          fw="bold"
          truncate
        >
          {title}
        </Anchor>
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
