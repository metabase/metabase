import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { breakpointMaxSmall } from "metabase/styled-components/theme";
import { Box, Stack } from "metabase/ui";

const sectionStyle = css`
  padding: 1.5rem;
  ${breakpointMaxSmall} {
    padding: 0.75rem;
  }
`;

export const StrategyFormLauncherPanelBox = styled(Box)<
  React.PropsWithChildren<any>
>`
  ${sectionStyle}
  border-bottom: 1px solid var(--mb-color-border);
`;

export const StrategyFormLauncherPanelStack = styled(Stack)`
  ${sectionStyle}
  gap: 1rem;
  ${breakpointMaxSmall} {
    gap: 0.5rem;
  }
`;
