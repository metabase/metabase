import dayjs from "dayjs";
import { t } from "ttag";
import { isNull } from "underscore";
import type { UserListResult } from "metabase-types/api";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import Tooltip from "metabase/core/components/Tooltip";
import { isNotNull } from "metabase/lib/types";
import { getRelativeTime } from "metabase/lib/time";
import type { WrappedResult } from "metabase/search/types";
import { Text } from "metabase/ui";
import {
  LastEditedInfoText,
  LastEditedInfoTooltip,
} from "./InfoTextEditedInfo.styled";

const LoadingText = () => (
  <Text
    color="text-1"
    span
    size="sm"
    truncate
    data-testid="last-edited-info-loading-text"
  >{t`Loading…`}</Text>
);

const InfoTextSeparator = (
  <Text span size="sm" mx="xs" c="text.1">
    •
  </Text>
);

export const InfoTextEditedInfo = ({
  result,
  isCompact,
}: {
  result: WrappedResult;
  isCompact?: boolean;
}) => {
  const { data: users = [], isLoading } = useUserListQuery();

  const isUpdated =
    isNotNull(result.last_edited_at) &&
    !dayjs(result.last_edited_at).isSame(result.created_at, "seconds");

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
    return (
      <>
        {InfoTextSeparator}
        <LoadingText />
      </>
    );
  }

  if (isNull(timestamp) && isNull(userId)) {
    return null;
  }

  const getEditedInfoText = () => {
    if (isCompact) {
      const formattedDuration = timestamp && getRelativeTime(timestamp);
      return (
        <Tooltip tooltip={<LastEditedInfoTooltip {...lastEditedInfoData} />}>
          <Text span size="sm" c="text.1" truncate>
            {formattedDuration}
          </Text>
        </Tooltip>
      );
    }
    return <LastEditedInfoText {...lastEditedInfoData} />;
  };

  return (
    <>
      {InfoTextSeparator}
      {getEditedInfoText()}
    </>
  );
};
