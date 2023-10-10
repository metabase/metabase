import { Icon } from "metabase/core/components/Icon";
import {
  InfoTextData,
  useInfoText,
} from "metabase/search/components/SearchResult/use-info-text";
import { SearchResultLink } from "metabase/search/components/SearchResultLink";
import type { WrappedResult } from "metabase/search/types";
import type { AnchorProps, TextProps } from "metabase/ui";
import { Box } from "metabase/ui";

export function InfoText({
  result,
  ...textProps
}: {
  result: WrappedResult;
  textProps?: TextProps | AnchorProps;
}) {
  const infoText: InfoTextData[] = useInfoText(result);

  return (
    <>
      {infoText.map(({ link, icon, label }: InfoTextData, index: number) => (
        <>
          {index > 0 && (
            <Box mt="xs" mx="xs" component="span">
              <Icon name="chevronright" size={10} />
            </Box>
          )}
          <SearchResultLink
            key={label}
            to={link}
            leftIcon={icon}
            {...textProps}
          >
            {label}
          </SearchResultLink>
        </>
      ))}
    </>
  );
}

