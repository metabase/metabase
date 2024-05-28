import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Stack } from "metabase/ui";

export const LegaleseStepDetailsContainer = styled(Stack)`
  ${({ theme }) => css`
    border: 1px solid ${theme.colors.border[0]};
    border-radius: ${theme.radius.md};
  `}
`;
