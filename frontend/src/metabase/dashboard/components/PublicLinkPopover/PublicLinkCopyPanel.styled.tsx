import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import CopyButton from "metabase/components/CopyButton";
import type { AnchorProps } from "metabase/ui";
import { Anchor } from "metabase/ui";

export const PublicLinkCopyButton = styled(CopyButton)`
  position: relative;
  top: 2px;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.brand[1]};
  }
`;

export const RemoveLinkAnchor = styled(Anchor)<
  AnchorProps & HTMLAttributes<HTMLAnchorElement>
>`
  white-space: nowrap;
`;
