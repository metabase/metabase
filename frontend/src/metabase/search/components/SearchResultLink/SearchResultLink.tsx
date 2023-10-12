import { ResultLink } from "metabase/search/components/SearchResultLink/SearchResultLink.styled";
import type { TextProps, AnchorProps } from "metabase/ui";
import { Anchor, Text } from "metabase/ui";

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
      href={href ?? undefined}
      td={href ? "underline" : "none"}
      span
      c="text.1"
      truncate
      {...textProps}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </ResultLink>
  );
};
