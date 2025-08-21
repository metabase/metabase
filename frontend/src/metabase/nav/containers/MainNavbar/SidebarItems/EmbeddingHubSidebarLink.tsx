import type { MouseEvent } from "react";
import { useCallback } from "react";

import { Box } from "metabase/ui";

import { FullWidthLink, NameContainer, NodeRoot } from "./SidebarItems.styled";

interface EmbeddingHubSidebarLinkProps {
  children: string;
  url: string;
  isSelected?: boolean;
  onClick?: (event: MouseEvent) => void;
}

export function EmbeddingHubSidebarLink({
  children,
  url,
  isSelected = false,
  onClick,
}: EmbeddingHubSidebarLinkProps) {
  const handleClick = useCallback(
    (event: MouseEvent) => {
      onClick?.(event);
    },
    [onClick],
  );

  return (
    <NodeRoot
      depth={0}
      isSelected={isSelected}
      aria-label={children}
      aria-selected={isSelected}
    >
      <FullWidthLink to={url} onClick={handleClick}>
        <Box w={12} h={12} bg="brand" style={{ borderRadius: "50%" }} />
        <NameContainer>{children}</NameContainer>
      </FullWidthLink>
    </NodeRoot>
  );
}
