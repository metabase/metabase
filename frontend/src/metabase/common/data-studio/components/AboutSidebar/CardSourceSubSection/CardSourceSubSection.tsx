import { t } from "ttag";

import { useGetDatabaseQuery, useGetTableQuery } from "metabase/api";
import type { StackProps } from "metabase/ui";
import type { Card, DatabaseId, TableId } from "metabase-types/api";

import { AboutSubSection } from "../AboutSubSection";
import { MetadataCard } from "../MetadataCard";
import { MetadataRow } from "../MetadataRow";
import { MetadataRowLink } from "../MetadataRowLink";

interface CardSourceUrls {
  database?: (databaseId: DatabaseId) => string;
  table?: (databaseId: DatabaseId, tableId: TableId) => string;
}

interface CardSourceSubSectionProps {
  card: Card;
  urls: CardSourceUrls;
  mt?: StackProps["mt"];
}

export function CardSourceSubSection({
  card,
  urls,
  mt,
}: CardSourceSubSectionProps) {
  const { data: database } = useGetDatabaseQuery(
    { id: card.database_id! },
    { skip: !card.database_id },
  );

  const { data: table } = useGetTableQuery(
    { id: card.table_id! },
    { skip: !card.table_id },
  );

  if (!database && !table) {
    return null;
  }

  const databaseUrl = database && urls.database?.(database.id);
  const tableUrl =
    table && card.database_id != null
      ? urls.table?.(card.database_id, table.id)
      : undefined;

  return (
    <AboutSubSection title={t`Source`} mt={mt}>
      <MetadataCard>
        {database && (
          <MetadataRow icon="database">
            {databaseUrl ? (
              <MetadataRowLink to={databaseUrl}>
                {database.name}
              </MetadataRowLink>
            ) : (
              database.name
            )}
          </MetadataRow>
        )}
        {table && (
          <MetadataRow icon="table">
            {tableUrl ? (
              <MetadataRowLink to={tableUrl}>
                {table.display_name || table.name}
              </MetadataRowLink>
            ) : (
              (table.display_name ?? table.name)
            )}
          </MetadataRow>
        )}
      </MetadataCard>
    </AboutSubSection>
  );
}
