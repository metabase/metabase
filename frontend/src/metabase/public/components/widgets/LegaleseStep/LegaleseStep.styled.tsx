// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Stack } from "metabase/ui";

export const LegaleseStepDetailsContainer = styled(Stack)`
  ${({ theme }) => css`
    border: 1px solid ${theme.colors["border-neutral"][0]};
    border-radius: ${theme.radius.md};
  `}
`;
