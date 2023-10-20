import moment from "moment-timezone";
import { t } from "ttag";
import { isNull } from "underscore";
import { useDatabaseQuery, useTableQuery } from "metabase/common/hooks";
import {
  browseDatabase,
  browseSchema,
  tableRowsQuery,
} from "metabase/lib/urls";
import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";
import { getRelativeTimeAbbreviated } from "metabase/lib/time";
import { isNotNull } from "metabase/core/utils/types";
import type { UserListResult } from "metabase-types/api";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { Icon } from "metabase/core/components/Icon";
import { SearchResultLink } from "metabase/search/components/SearchResultLink";
import type { WrappedResult } from "metabase/search/types";
import { Group, Box, Text } from "metabase/ui";
import type Database from "metabase-lib/metadata/Database";
import type { InfoTextData } from "./get-info-text";
import { getInfoText } from "./get-info-text";
import {
  DurationIcon,
  LastEditedInfoText,
  LastEditedInfoTooltip,
} from "./InfoText.styled";

export type InfoTextProps = {
  result: WrappedResult;
  isCompact?: boolean;
};

const LinkSeparator = (
  <Box component="span" c="text.1">
    <Icon name="chevronright" size={8} />
  </Box>
);

export const InfoTextTableLink = ({ result }: InfoTextProps) => {
  const { data: table } = useTableQuery({
    id: result.table_id,
  });

  const link = tableRowsQuery(result.database_id, result.table_id);
  const label = table?.display_name ?? null;

  return (
    <SearchResultLink key={label} href={link}>
      {label}
    </SearchResultLink>
  );
};

export const DatabaseLink = ({ database }: { database: Database }) => (
  <SearchResultLink key={database.name} href={browseDatabase(database)}>
    {database.name}
  </SearchResultLink>
);
export const TableLink = ({ result }: { result: WrappedResult }) => {
  const link = browseSchema({
    db: { id: result.database_id },
    schema_name: result.table_schema,
  });

  return (
    <>
      {LinkSeparator}
      <SearchResultLink key={result.table_schema} href={link}>
        {result.table_schema}
      </SearchResultLink>
    </>
  );
};

export const InfoTextTablePath = ({ result }: InfoTextProps) => {
  const { data: database, isLoading: isDatabaseLoading } = useDatabaseQuery({
    id: result.database_id,
  });

  const showDatabaseLink =
    !isDatabaseLoading && database && database.name !== null;
  const showTableLink = showDatabaseLink && !!result.table_schema;

  return (
    <>
      {showDatabaseLink && <DatabaseLink database={database} />}
      {showTableLink && <TableLink result={result} />}
    </>
  );
};

export const InfoTextAssetLink = ({ result }: InfoTextProps) => {
  if (result.model === "table") {
    return <InfoTextTablePath result={result} />;
  }

  if (result.model === "segment" || result.model === "metric") {
    return <InfoTextTableLink result={result} />;
  }

  const { label, link, icon }: InfoTextData = getInfoText(result);

  return label ? (
    <SearchResultLink key={label} href={link} leftIcon={icon}>
      {label}
    </SearchResultLink>
  ) : null;
};

export const InfoTextEditedInfo = ({ result, isCompact }: InfoTextProps) => {
  const { data: users = [], isLoading } = useUserListQuery();

  const isUpdated =
    isNotNull(result.last_edited_at) &&
    !moment(result.last_edited_at).isSame(result.created_at, "seconds");

  const { prefix, timestamp, userId } = isUpdated
    ? {
        prefix: t`Updated`,
        timestamp: result.last_edited_at,
        userId: result.last_editor_id,
      }
    : {
        prefix: t`Created`,
        timestamp: result.created_at,
        userId: result.creator_id,
      };

  const user = users.find((user: UserListResult) => user.id === userId);

  const formattedDuration = timestamp && getRelativeTimeAbbreviated(timestamp);

  const lastEditedInfoData = {
    item: {
      "last-edit-info": {
        id: user?.id,
        email: user?.email,
        first_name: user?.first_name,
        last_name: user?.last_name,
        timestamp,
      },
    },
    prefix,
  };

  if (isLoading) {
    return <Text color="text-1" data-testid="loading-text">{t`Loading…`}</Text>;
  }

  if (isNull(timestamp) && isNull(userId)) {
    return null;
  }

  const getEditedInfoText = () => {
    if (isCompact) {
      return (
        <Tooltip tooltip={<LastEditedInfoTooltip {...lastEditedInfoData} />}>
          <Group noWrap spacing={0} align="center">
            <DurationIcon name="clock" size={13} color={color("text-medium")} />
            <Text
              span
              size="sm"
              c="text.1"
              ml="xs"
              style={{ whiteSpace: "nowrap" }}
            >
              {formattedDuration}
            </Text>
          </Group>
        </Tooltip>
      );
    }
    return <LastEditedInfoText {...lastEditedInfoData} />;
  };

  return (
    <>
      <Text span size="sm" mx="xs" c="text.1">
        •
      </Text>
      {getEditedInfoText()}
    </>
  );
};

export const InfoText = ({ result, isCompact }: InfoTextProps) => (
  <Group noWrap spacing="xs">
    <InfoTextAssetLink result={result} />
    <InfoTextEditedInfo result={result} isCompact={isCompact} />
  </Group>
);
