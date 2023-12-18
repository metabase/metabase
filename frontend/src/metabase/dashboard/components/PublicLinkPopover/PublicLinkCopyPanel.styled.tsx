import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import CopyButton from "metabase/components/CopyButton";
import { color } from "metabase/lib/colors";
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

interface ExtensionOptionProps {
  isSelected: boolean;
}

export const ExtensionOption = styled.span<ExtensionOptionProps>`
  cursor: pointer;
  font-weight: bold;
  text-transform: uppercase;
  color: ${props => (props.isSelected ? color("brand") : color("text-light"))};

  &:hover {
    color: ${color("brand")};
  }
`;

export const RemoveLinkAnchor = styled(Anchor)<
  AnchorProps & HTMLAttributes<HTMLAnchorElement>
>`
  white-space: nowrap;
`;
