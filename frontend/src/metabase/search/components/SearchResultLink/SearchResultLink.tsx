import type { MouseEvent } from "react";
import Tooltip from "metabase/core/components/Tooltip";
import { Anchor, Text } from "metabase/ui";
import { useIsTruncated } from "metabase/hooks/use-is-truncated";
import { ResultLink, ResultLinkWrapper } from "./SearchResultLink.styled";

export const SearchResultLink = ({
  children,
  leftIcon = null,
  href = null,
  isEnabled = true,
}: {
  children: JSX.Element | string | null;
  leftIcon?: JSX.Element | null;
  href?: string | null;
  isEnabled?: boolean;
}) => {
  const { isTruncated, ref: truncatedRef } =
    useIsTruncated<HTMLAnchorElement>();

  const componentProps =
    href && isEnabled
      ? {
          as: Anchor,
          href,
          td: "underline",
          onClick: (e: MouseEvent<HTMLAnchorElement>) => e.stopPropagation(),
        }
      : {
          as: Text,
          td: "none",
        };

  return (
    <Tooltip isEnabled={isTruncated} tooltip={children}>
      <ResultLinkWrapper data-testid="result-link-wrapper" spacing="xs" noWrap>
        {leftIcon}
        <ResultLink
          {...componentProps}
          span
          c="text.1"
          size="sm"
          truncate
          ref={truncatedRef}
        >
          {children}
        </ResultLink>
      </ResultLinkWrapper>
    </Tooltip>
  );
};
