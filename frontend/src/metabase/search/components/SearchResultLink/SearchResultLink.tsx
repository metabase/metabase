import type { TextProps, AnchorProps } from "metabase/ui";
import { Anchor, Text, Box } from "metabase/ui";
import { ResultLink } from "./SearchResultLink.styled";

export const SearchResultLink = ({
  children,
  leftIcon = null,
  href = null,
  ...textProps
}: {
  children: JSX.Element | string | null;
  leftIcon?: JSX.Element | null;
  href?: string | null;
  textProps?: TextProps | AnchorProps;
}) => {
  return (
    <ResultLink
      as={href ? Anchor : Text}
      href={href ?? undefined}
      td={href ? "underline" : "none"}
      span
      c="text.1"
      truncate
      {...textProps}
      onClick={e => e.stopPropagation()}
    >
      {leftIcon && (
        <Box mr="xs" component="span">
          {leftIcon}
        </Box>
      )}
      {children}
    </ResultLink>
  );
};
