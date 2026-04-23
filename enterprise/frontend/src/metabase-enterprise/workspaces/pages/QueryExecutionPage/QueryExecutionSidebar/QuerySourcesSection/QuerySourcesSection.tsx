import { t } from "ttag";

import { useGetDatasetQuerySourcesQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Badge, Group, Stack, Title } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type {
  CardDatasetQuerySource,
  DatasetQuerySourceInfo,
  QueryExecution,
  TableDatasetQuerySource,
} from "metabase-types/api";

import { InfoList, InfoListItem } from "../InfoList";

type QuerySourcesSectionProps = {
  execution: QueryExecution;
};

export function QuerySourcesSection({ execution }: QuerySourcesSectionProps) {
  const { data, isLoading, error } = useGetDatasetQuerySourcesQuery(
    execution.query,
  );

  const sourceCount = data ? getSourceCount(data) : 0;
  const isPending = isLoading || error != null || data == null;

  return (
    <Stack aria-label={t`Sources`}>
      <Group gap="sm" wrap="nowrap">
        <Badge variant="filled" bg="brand">
          {sourceCount}
        </Badge>
        <Title order={5}>{t`Sources`}</Title>
      </Group>
      {isPending ? (
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <InfoList>
          {data.tables?.map((table) => (
            <InfoListItem key={table.id} label={t`Table`}>
              <Link to={getTableUrl(table)} variant="brand">
                {table.display_name}
              </Link>
            </InfoListItem>
          ))}
          {data.cards?.map((card) => (
            <InfoListItem key={card.id} label={getCardLabel(card)}>
              <Link to={getCardUrl(card)} variant="brand">
                {card.name}
              </Link>
            </InfoListItem>
          ))}
        </InfoList>
      )}
    </Stack>
  );
}

function getSourceCount({
  tables = [],
  cards = [],
}: DatasetQuerySourceInfo): number {
  return tables.length + cards.length;
}

function getCardLabel(card: CardDatasetQuerySource): string {
  switch (card.type) {
    case "model":
      return t`Model`;
    case "metric":
      return t`Metric`;
    case "question":
    default:
      return t`Question`;
  }
}

function getTableUrl(table: TableDatasetQuerySource): string {
  return Urls.dataStudioData({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
  });
}

function getCardUrl(card: CardDatasetQuerySource): string {
  const entity = { id: card.id, name: card.name };
  switch (card.type) {
    case "model":
      return Urls.model(entity);
    case "metric":
      return Urls.metric(entity);
    case "question":
    default:
      return Urls.question(entity);
  }
}
