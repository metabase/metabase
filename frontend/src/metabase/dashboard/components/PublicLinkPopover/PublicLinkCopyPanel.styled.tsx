import styled from "@emotion/styled";
import type { HTMLAttributes, ElementType, ComponentProps } from "react";

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

type PolymorphicAnchor = typeof Anchor<ElementType>;
export const RemoveLinkAnchor = styled(Anchor)<
  ComponentProps<PolymorphicAnchor> & HTMLAttributes<HTMLAnchorElement>
>`
  white-space: nowrap;
`;
