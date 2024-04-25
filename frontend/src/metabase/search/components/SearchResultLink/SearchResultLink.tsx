import type { MouseEvent } from "react";

import Tooltip from "metabase/core/components/Tooltip";
import { useIsTruncated } from "metabase/hooks/use-is-truncated";
import { Anchor, Text } from "metabase/ui";

import { ResultLink, ResultLinkWrapper } from "./SearchResultLink.styled";

export const SearchResultLink = ({
  children,
  leftIcon = null,
  href = null,
}: {
  children: JSX.Element | string | null;
  leftIcon?: JSX.Element | null;
  href?: string | null;
}) => {
  const { isTruncated, ref: truncatedRef } =
    useIsTruncated<HTMLAnchorElement>();

  const componentProps = href
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
          c="text-medium"
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
