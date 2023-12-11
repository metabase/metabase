import styled from "@emotion/styled";
import type { PaperProps } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { Group, Paper, Title } from "metabase/ui";

export const ProBadge = styled(Group)`
  border-radius: ${({ theme }) => theme.radius.xs};
`;

export const ClickIcon = styled(Icon)``;

export const CTAHeader = styled(Title)``;
export const CTAContainer = styled(Paper)<PaperProps>`
  &:hover {
    ${CTAHeader} {
      color: ${({ theme }) => theme.colors.brand[1]};
    }

    ${ClickIcon} {
      color: ${({ theme }) => theme.colors.brand[1]};
    }
  }
`;
