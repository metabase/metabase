import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const TriggerContainer = styled.div<{ hasValue: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  position: relative;
  padding: 0.6875rem;
  border: 1px solid
    ${props => (props.hasValue ? color("brand") : color("border"))};
  border-radius: ${space(0)};
  cursor: pointer;
`;
