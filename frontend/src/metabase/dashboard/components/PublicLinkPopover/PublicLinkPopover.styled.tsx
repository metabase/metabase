import styled from "@emotion/styled";
import CopyButton from "metabase/components/CopyButton";
import { Box, Group } from "metabase/ui";

export const PublicLinkCopyButton = styled(CopyButton)`
  position: relative;
  top: 2px;
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.brand[1]};
  }
`;

export const PublicLinkTextContainer = styled(Box)`
  flex: 1;
  overflow: hidden;
`;

export const LinkContainer = styled(Group)`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.xs};
`;
