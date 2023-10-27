import { t } from "ttag";
import { useDatabaseQuery, useTableQuery } from "metabase/common/hooks";
import { Icon } from "metabase/core/components/Icon";
import {
  browseDatabase,
  browseSchema,
  tableRowsQuery,
} from "metabase/lib/urls";
import { SearchResultLink } from "metabase/search/components/SearchResultLink";
import type { WrappedResult } from "metabase/search/types";
import { Box, Text } from "metabase/ui";
import type Database from "metabase-lib/metadata/Database";
import { getInfoText } from "./get-info-text";
import type { InfoTextData } from "./get-info-text";

type InfoTextAssetLinkProps = {
  result: WrappedResult;
  showLinks?: boolean;
};

const LinkSeparator = (
  <Box component="span" c="text.1">
    <Icon name="chevronright" size={8} />
  </Box>
);

const LoadingText = () => (
  <Text
    color="text-1"
    span
    size="sm"
    truncate
    data-testid="info-text-asset-link-loading-text"
  >{t`Loading…`}</Text>
);

export const InfoTextTableLink = ({
  result,
  showLinks,
}: InfoTextAssetLinkProps) => {
  const { data: table, isLoading } = useTableQuery({
    id: result.table_id,
  });

  const link = tableRowsQuery(result.database_id, result.table_id);
  const label = table?.display_name ?? null;

  if (isLoading) {
    return <LoadingText />;
  }

  return (
    <SearchResultLink href={showLinks ? link : undefined}>
      {label}
    </SearchResultLink>
  );
};

export const DatabaseLink = ({
  database,
  showLinks,
}: {
  database: Database;
  showLinks: InfoTextAssetLinkProps["showLinks"];
}) => (
  <SearchResultLink href={showLinks ? browseDatabase(database) : undefined}>
    {database.name}
  </SearchResultLink>
);

export const TableLink = ({ result, showLinks }: InfoTextAssetLinkProps) => {
  const link = browseSchema({
    db: { id: result.database_id },
    schema_name: result.table_schema,
  });

  return (
    <SearchResultLink href={showLinks ? link : undefined}>
      {result.table_schema}
    </SearchResultLink>
  );
};

export const InfoTextTablePath = ({
  result,
  showLinks,
}: InfoTextAssetLinkProps) => {
  const { data: database, isLoading: isDatabaseLoading } = useDatabaseQuery({
    id: result.database_id,
  });

  const showDatabaseLink =
    !isDatabaseLoading && database && database.name !== null;
  const showTableLink = showDatabaseLink && !!result.table_schema;

  if (isDatabaseLoading) {
    return <LoadingText />;
  }

  return (
    <>
      {showDatabaseLink && (
        <DatabaseLink showLinks={showLinks} database={database} />
      )}
      {showTableLink && (
        <>
          {LinkSeparator}
          <TableLink showLinks={showLinks} result={result} />
        </>
      )}
    </>
  );
};

export const InfoTextAssetLink = ({
  result,
  showLinks = true,
}: InfoTextAssetLinkProps) => {
  if (result.model === "table") {
    return <InfoTextTablePath showLinks={showLinks} result={result} />;
  }

  if (result.model === "segment" || result.model === "metric") {
    return <InfoTextTableLink showLinks={showLinks} result={result} />;
  }

  const { label, link, icon }: InfoTextData = getInfoText(result);

  return label ? (
    <SearchResultLink href={showLinks ? link : undefined} leftIcon={icon}>
      {label}
    </SearchResultLink>
  ) : null;
};
