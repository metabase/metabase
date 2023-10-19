import { Fragment } from "react";
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
import { useInfoText } from "./use-info-text";
import type { InfoTextData } from "./use-info-text";
import {
  DurationIcon,
  LastEditedInfoText,
  LastEditedInfoTooltip,
} from "./InfoText.styled";

type InfoTextProps = {
  result: WrappedResult;
  isCompact?: boolean;
};

export const InfoTextAssetLink = ({ result }: InfoTextProps) => {
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

export const InfoTextEditedInfo = ({ result, isCompact }: InfoTextProps) => {
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

  return isCompact ? (
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
  ) : (
    <LastEditedInfoText {...lastEditedInfoData} />
  );
};

export const InfoText = ({ result, isCompact }: InfoTextProps) => (
  <Group noWrap spacing="xs">
    <InfoTextAssetLink result={result} />
    <Text span size="sm" mx="xs" c="text.1">
      •
    </Text>
    <InfoTextEditedInfo result={result} isCompact={isCompact} />
  </Group>
);
