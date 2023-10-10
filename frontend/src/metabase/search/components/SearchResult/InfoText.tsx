import { Icon } from "metabase/core/components/Icon";
import type { InfoTextData } from "metabase/search/components/SearchResult/use-info-text";
import { useInfoText } from "metabase/search/components/SearchResult/use-info-text";
import {
  formatDate,
  getUserLabel,
} from "metabase/search/components/SearchResult/utils";
import { SearchResultLink } from "metabase/search/components/SearchResultLink";
import type { WrappedResult } from "metabase/search/types";
import type { AnchorProps, TextProps } from "metabase/ui";
import { Box, Text } from "metabase/ui";

type InfoTextProps = {
  result: WrappedResult;
  isCompact: boolean;
} & (TextProps | AnchorProps);

export function InfoText({ result, isCompact, ...textProps }: InfoTextProps) {
  const infoText: InfoTextData[] = useInfoText(result);

  const { updated_at, created_at } = result;

  const resultTextProps = {
    ...textProps,
    size: isCompact ? "sm" : "md",
  };

  const dateLabel = formatDate(updated_at || created_at);
  const userLabel = getUserLabel(result);
  const separator = (
    <Text {...resultTextProps} span mx="xs">
      •
    </Text>
  );

  return (
    <Box>
      {infoText.map(({ link, icon, label }: InfoTextData, index: number) => (
        <>
          {index > 0 && (
            <Box mt="xs" mx="xs" component="span">
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
      {!isCompact && dateLabel && (
        <>
          {separator}
          <SearchResultLink {...resultTextProps}>{dateLabel}</SearchResultLink>
        </>
      )}
      {userLabel && (
        <>
          {separator}
          <SearchResultLink {...resultTextProps}>{userLabel}</SearchResultLink>
        </>
      )}
    </Box>
  );
}
