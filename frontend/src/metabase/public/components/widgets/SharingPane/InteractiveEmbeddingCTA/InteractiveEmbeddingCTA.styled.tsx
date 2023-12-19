import styled from "@emotion/styled";
import type { PaperProps, TextProps } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { Group, Paper, Title, Text } from "metabase/ui";

export const ProBadge = styled(Group)`
  border-radius: ${({ theme }) => theme.radius.xs};
`;

export const CTAContainer = styled(Paper)<PaperProps>``;

export const ClickIcon = styled(Icon)`
  ${CTAContainer}:hover & {
    color: ${({ theme }) => theme.colors.brand[1]};
  }
`;

export const CTAHeader = styled(Title)`
  ${CTAContainer}:hover & {
    color: ${({ theme }) => theme.colors.brand[1]};
  }
`;

export const CTALinkText = styled(Text)<TextProps>`
  ${CTAContainer}:hover & {
    text-decoration: underline;
  }
`;
