import { ResultLink } from "metabase/search/components/SearchResultLink/SearchResultLink.styled";
import type { TextProps, AnchorProps } from "metabase/ui";
import { Anchor, Box, Text } from "metabase/ui";

export const SearchResultLink = ({
  children,
  leftIcon = null,
  to,
  ...textProps
}: {
  children: JSX.Element | string | null;
  leftIcon?: JSX.Element | null;
  to?: string | null;
  textProps?: TextProps | AnchorProps;
}) => {
  const componentProps = to ? { as: Anchor, to } : { as: Text };

  return (
    <ResultLink
      span
      td={to ? "underline" : "none"}
      c="text.1"
      lh="unset"
      {...componentProps}
      {...textProps}
    >
      <Box component="span" pos="relative" top="0.15rem">
        {leftIcon}
      </Box>
      {children}
    </ResultLink>
  );
};
