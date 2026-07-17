import type { MouseEvent } from "react";

import { Anchor, Group, Text, Tooltip } from "metabase/ui";
import { useIsTruncated } from "metabase/ui/hooks/use-is-truncated";

import S from "./SearchResultLink.module.css";

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

  return (
    <Tooltip disabled={!isTruncated || !children} label={children}>
      <Group
        className={S.resultLinkWrapper}
        data-testid="result-link-wrapper"
        gap="xs"
        wrap="nowrap"
      >
        {leftIcon}
        {href ? (
          <Anchor
            href={href}
            td="underline"
            onClick={(e: MouseEvent<HTMLAnchorElement>) => e.stopPropagation()}
            className={S.resultLink}
            size="sm"
            truncate
            ref={truncatedRef}
          >
            {children}
          </Anchor>
        ) : (
          <Text
            td="none"
            component="span"
            className={S.resultLink}
            size="sm"
            truncate
            ref={truncatedRef}
          >
            {children}
          </Text>
        )}
      </Group>
    </Tooltip>
  );
};
