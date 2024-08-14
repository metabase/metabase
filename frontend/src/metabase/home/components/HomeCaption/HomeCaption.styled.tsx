import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMinExtraLarge } from "metabase/styled-components/theme";

export interface CaptionProps {
  primary?: boolean;
}

export const CaptionRoot = styled.div<CaptionProps>`
  display: flex;
  align-items: center;
  color: ${props =>
    props.primary ? color("text-dark") : color("text-medium")};
  font-weight: bold;
  margin-bottom: 1.5rem;

  ${breakpointMinExtraLarge} {
    margin-bottom: 2rem;
  }
`;
