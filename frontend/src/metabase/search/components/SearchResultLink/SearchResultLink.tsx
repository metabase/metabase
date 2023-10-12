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
  const Component = href ? Anchor : Text;

  return (
    <Component
      href={href ?? undefined}
      td={href ? "underline" : "none"}
      span
      c="text.1"
      truncate
      {...textProps}
    >
      {children}
    </Component>
  );
};
