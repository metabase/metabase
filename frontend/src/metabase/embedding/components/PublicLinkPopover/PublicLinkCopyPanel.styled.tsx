import styled from "@emotion/styled";
import type { ComponentProps, ElementType, HTMLAttributes } from "react";

import { CopyButton } from "metabase/components/CopyButton";
import { Anchor } from "metabase/ui";

export const PublicLinkCopyButton = styled(CopyButton)`
  position: relative;
  top: 2px;
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const RemoveLinkAnchor = styled(Anchor)<
  ComponentProps<typeof Anchor<ElementType>> & HTMLAttributes<HTMLAnchorElement>
>`
  white-space: nowrap;
`;
