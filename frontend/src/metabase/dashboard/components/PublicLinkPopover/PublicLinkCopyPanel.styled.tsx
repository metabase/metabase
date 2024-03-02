import styled from "@emotion/styled";
import type { ComponentProps, ElementType, HTMLAttributes } from "react";

import { CopyButton } from "metabase/components/CopyButton";
import { Anchor } from "metabase/ui";

export const PublicLinkCopyButton = styled(CopyButton)`
  position: relative;
  top: 2px;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.fn.themeColor("brand")};
  }
`;

export const RemoveLinkAnchor = styled(Anchor)<
  ComponentProps<typeof Anchor<ElementType>> & HTMLAttributes<HTMLAnchorElement>
>`
  white-space: nowrap;
`;
