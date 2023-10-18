import { Fragment } from "react";
import { isNotNull } from "metabase/core/utils/types";
import type { UserListResult } from "metabase-types/api";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { Icon } from "metabase/core/components/Icon";
import { SearchResultLink } from "metabase/search/components/SearchResultLink";
import type { WrappedResult } from "metabase/search/types";
import { Group, Box, Text } from "metabase/ui";
import { useInfoText } from "./use-info-text";
import type { InfoTextData } from "./use-info-text";
import { LastEditedInfo } from "./InfoText.styled";

type InfoTextProps = {
  result: WrappedResult;
};

export const InfoTextAssetLink = ({ result }: { result: WrappedResult }) => {
  const infoText: InfoTextData[] = useInfoText(result);

  const linkSeparator = (
    <Box component="span" c="text.1">
      <Icon name="chevronright" size={8} />
    </Box>
  );

  return (
    <>
      {infoText.map(({ link, icon, label }: InfoTextData, index: number) => (
        <Fragment key={index}>
          {index > 0 && linkSeparator}
          <SearchResultLink key={label} href={link} leftIcon={icon}>
            {label}
          </SearchResultLink>
        </Fragment>
      ))}
    </>
  );
};

export const InfoTextEditedInfo = ({ result }: { result: WrappedResult }) => {
  const { data: users = [] } = useUserListQuery();

  const isUpdated =
    isNotNull(result.updated_at) && result.updated_at !== result.created_at;

  const { prefix, timestamp, userId } = isUpdated
    ? {
        prefix: "Updated",
        timestamp: result.updated_at,
        userId: result.last_editor_id,
      }
    : {
        prefix: "Created",
        timestamp: result.created_at,
        userId: result.creator_id,
      };

  const user = users.find((user: UserListResult) => user.id === userId);

  return (
    <LastEditedInfo
      item={{
        "last-edit-info": {
          id: user?.id,
          email: user?.email,
          first_name: user?.first_name,
          last_name: user?.last_name,
          timestamp,
        },
      }}
      prefix={prefix}
    />
  );
};

export const InfoText = ({ result }: InfoTextProps) => (
  <Group noWrap spacing="xs">
    <InfoTextAssetLink result={result} />
    <Text span size="sm" mx="xs" c="text.1">
      •
    </Text>
    <InfoTextEditedInfo result={result} />
  </Group>
);
