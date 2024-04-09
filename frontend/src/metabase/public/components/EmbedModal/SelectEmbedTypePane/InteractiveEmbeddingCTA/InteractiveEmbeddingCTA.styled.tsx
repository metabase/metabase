import styled from "@emotion/styled";

import type { PaperProps } from "metabase/ui";
import { Icon, Group, Paper, Title } from "metabase/ui";

export const ProBadge = styled(Group)`
  border-radius: ${({ theme }) => theme.radius.xs};
`;

export const CTAContainer = styled(Paper)<PaperProps>``;

export const ClickIcon = styled(Icon)`
  ${CTAContainer}:hover & {
    color: ${({ theme }) => theme.fn.themeColor("brand")};
  }
`;

export const CTAHeader = styled(Title)`
  ${CTAContainer}:hover & {
    color: ${({ theme }) => theme.fn.themeColor("brand")};
  }
`;
