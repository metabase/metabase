import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { Icon } from "metabase/core/components/Icon";
import { LastEditedInfo } from "metabase/search/components/SearchResult/InfoText.styled";
import type { InfoTextData } from "metabase/search/components/SearchResult/use-info-text";
import { useInfoText } from "metabase/search/components/SearchResult/use-info-text";
import { SearchResultLink } from "metabase/search/components/SearchResultLink";
import type { WrappedResult } from "metabase/search/types";
import type { AnchorProps, TextProps } from "metabase/ui";
import { Group, Box, Text } from "metabase/ui";

type InfoTextProps = {
  result: WrappedResult;
  isCompact: boolean;
} & (TextProps | AnchorProps);

export function InfoText({ result, isCompact, ...textProps }: InfoTextProps) {
  const { data: users = [] } = useUserListQuery();

  const timestampInfo = result.updated_at || result.created_at;
  const userId = result.last_editor_id || result.creator_id;

  const user = users.find(user => user.id === userId);
  const infoText: InfoTextData[] = useInfoText(result);

  if (infoText.length > 1) {
    console.log(result.name, infoText)
  }

  const resultTextProps = {
    ...textProps,
    size: "sm",
  };

  const separator = (
    <Text {...resultTextProps} span mx="xs">
      •
    </Text>
  );

  return (
    <Group noWrap spacing={0}>
      {infoText.map(({ link, icon, label }: InfoTextData, index: number) => (
        <>
          {index > 0 && (
            <Box mt="sm" mx="xs" component="span">
              <Icon name="chevronright" size={10} />
            </Box>
          )}
          <SearchResultLink
            key={label}
            href={link}
            leftIcon={icon}
            {...resultTextProps}
          >
            {label}
          </SearchResultLink>
        </>
      ))}
      {user && (
        <>
          {separator}
          <LastEditedInfo
            item={{
              "last-edit-info": {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                timestamp: timestampInfo,
              },
            }}
          />
        </>
      )}
    </Group>
  );
}
