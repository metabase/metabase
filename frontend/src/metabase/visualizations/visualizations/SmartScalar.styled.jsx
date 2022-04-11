import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMaxSmall, space } from "metabase/styled-components/theme";

export const Variation = styled.div`
  color: ${props => props.color};
  display: flex;
  align-items: center;

  ${breakpointMaxSmall} {
    margin: ${space(1)} 0;
  }
`;

export const PreviousValueContainer = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  margin-top: ${space(0)};

  ${breakpointMaxSmall} {
    flex-direction: column;
  }
`;

export const PreviousValueVariation = styled.h4`
  align-items: center;
  color: ${color("text-light")};
  display: flex;

  ${breakpointMaxSmall} {
    text-transform: capitalize;
  }
`;

export const PreviousValueSeparator = styled.span`
  color: ${color("text-light")};
  font-size: 0.7rem;
  margin: 0 ${space(0)};

  ${breakpointMaxSmall} {
    display: none;
  }
`;
