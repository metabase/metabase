import styled from "@emotion/styled";

import { Group, Icon, Paper, Title } from "metabase/ui";

export const ProBadge = styled(Group)`
  border-radius: ${({ theme }) => theme.radius.xs};
`;

export const CTAContainer = Paper;

export const ClickIcon = styled(Icon)`
  ${CTAContainer}:hover & {
    color: var(--mb-color-brand);
  }
`;

export const CTAHeader = styled(Title)`
  ${CTAContainer}:hover & {
    color: var(--mb-color-brand);
  }
`;
