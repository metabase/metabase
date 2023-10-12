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
  const componentProps = href
    ? {
        as: Anchor,
        href,
        td: "underline",
      }
    : {
        as: Text,
        td: "none",
      };

  return (
    <ResultLink
      {...componentProps}
      span
      c="text.1"
      truncate
      onClick={e => e.stopPropagation()}
      {...textProps}
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
