import type { MouseEvent } from "react";

import { useIsTruncated } from "metabase/common/hooks/use-is-truncated";
import { Anchor, Text, Tooltip } from "metabase/ui";

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
    <Tooltip disabled={!isTruncated || !children} label={children}>
      <ResultLinkWrapper
        data-testid="result-link-wrapper"
        gap="xs"
        wrap="nowrap"
      >
        {leftIcon}
        <ResultLink
          {...componentProps}
          span
          c="text-secondary"
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
