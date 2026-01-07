// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

export const Root = styled.div<{ isDashboard?: boolean }>`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-bottom: 0.5rem;
  color: ${({ isDashboard }) =>
    isDashboard ? color("text-secondary") : color("text-tertiary")};
`;

export const StyledIcon = styled(Icon)`
  margin-bottom: 1rem;
`;

export const ShortMessage = styled.span`
  font-weight: bold;
  font-size: 1.12em;
`;
