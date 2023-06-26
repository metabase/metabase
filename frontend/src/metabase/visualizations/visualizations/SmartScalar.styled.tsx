import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";
import {
  breakpointMaxSmall,
  breakpointMaxLarge,
  space,
} from "metabase/styled-components/theme";

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
  justify-content: center;
  margin-top: ${space(0)};

  ${breakpointMaxSmall} {
    flex-direction: column;
  }

  ${breakpointMaxLarge} {
    ${props =>
      props.gridSize?.width <= 3 &&
      css`
        flex-direction: column;
      `}
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

  ${breakpointMaxLarge} {
    ${props =>
      props.gridSize?.width <= 3 &&
      css`
        display: none;
      `}
  }
`;
