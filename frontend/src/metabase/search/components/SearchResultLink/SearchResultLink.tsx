import { ResultLink } from "metabase/search/components/SearchResultLink/SearchResultLink.styled";
import type { TextProps, AnchorProps } from "metabase/ui";
import { Anchor, Box, Text } from "metabase/ui";

export const SearchResultLink = ({
  children,
  leftIcon = null,
  href,
  ...textProps
}: {
  children: JSX.Element | string | null;
  leftIcon?: JSX.Element | null;
  href?: string | null;
  textProps?: TextProps | AnchorProps;
}) => {
  const componentProps = href ? { as: Anchor, href } : { as: Text };
  return (
    <Box
      display="contents"
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
      }}
    >
      {leftIcon && (
        <Box component="span" mr="0.15rem" pos="relative" top="0.15rem">
          {leftIcon}
        </Box>
      )}
      <ResultLink
        span
        td={href ? "underline" : "none"}
        c="text.1"
        truncate
        {...componentProps}
        {...textProps}
      >
        {children}
      </ResultLink>
    </Box>
  );
};
