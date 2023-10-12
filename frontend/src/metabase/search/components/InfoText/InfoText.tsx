import { Fragment } from "react";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { Icon } from "metabase/core/components/Icon";
import { SearchResultLink } from "metabase/search/components/SearchResultLink";
import type { WrappedResult } from "metabase/search/types";
import type { AnchorProps, TextProps } from "metabase/ui";
import { Group, Box, Text } from "metabase/ui";
import { useInfoText } from "./use-info-text";
import type { InfoTextData } from "./use-info-text";
import { LastEditedInfo } from "./InfoText.styled";

type InfoTextProps = {
  result: WrappedResult;
  isCompact: boolean;
} & (TextProps | AnchorProps);

export const InfoTextAssetLink = ({
  result,
  ...resultTextProps
}: {
  result: WrappedResult;
}) => {
  const infoText: InfoTextData[] = useInfoText(result);

  const linkSeparator = (
    <Box mx="xs" component="span" c="text.1">
      <Icon name="chevronright" size={8} />
    </Box>
  );

  const linkItems = infoText.map(
    ({ link, icon, label }: InfoTextData, index: number) => (
      <SearchResultLink
        key={label}
        href={link}
        leftIcon={icon}
        {...resultTextProps}
      >
        {label}
      </SearchResultLink>
    ),
  );

  return (
    <Text truncate>
      {linkItems.map((linkItem, index) => (
        <Fragment key={index}>
          {index > 0 && linkSeparator}
          {linkItem}
        </Fragment>
      ))}
    </Text>
  );
};

export const InfoTextEditedInfo = ({ result }: { result: WrappedResult }) => {
  const { data: users = [] } = useUserListQuery();

  const isUpdated = result.updated_at !== result.created_at;

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

  const user = users.find(user => user.id === userId);

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

export function InfoText({ result, isCompact, ...textProps }: InfoTextProps) {
  const resultTextProps = {
    ...textProps,
    size: "sm",
  };

  const separator = (
    <Text {...resultTextProps} span mx="xs" c="text.1">
      •
    </Text>
  );

  return (
    <Group noWrap spacing="xs">
      <InfoTextAssetLink result={result} {...resultTextProps} />
      {separator}
      <InfoTextEditedInfo result={result} {...resultTextProps} />
    </Group>
  );
}
