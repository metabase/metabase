import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Ellipsified from "metabase/core/components/Ellipsified/Ellipsified";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";
import {
  breakpointMaxLarge,
  breakpointMaxSmall,
  space,
} from "metabase/styled-components/theme";

export const Variation = styled.div`
  color: ${props => props.color};
  display: flex;
  align-items: center;
  margin: ${space(0)};

  ${breakpointMaxSmall} {
    margin: ${space(1)} 0;
  }
`;

export const VariationIcon = styled(Icon)`
  flex: 0 0 auto;
  margin: ${space(0)};
  margin-right: ${space(1)};
  color: ${props => props.color};
  display: flex;
  align-items: center;

  ${breakpointMaxSmall} {
    margin: ${space(1)};
  }
`;

export const VariationValue = styled(Ellipsified)`
  flex: 1;
  min-width: 0;
  font-weight: 900;
`;

export const PreviousValueContainer = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  line-height: 1.2rem;

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
  color: ${color("text-light")};
  margin: ${space(0) / 2};
  text-align: center;

  ${breakpointMaxSmall} {
    text-transform: capitalize;
  }
`;

export const PreviousValueSeparator = styled.span`
  display: inline-block;
  color: ${color("text-light")};
  transform: scale(0.7);

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
