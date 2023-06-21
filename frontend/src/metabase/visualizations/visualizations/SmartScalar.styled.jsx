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
  max-width: 100%;
`;

export const VariationIcon = styled(Icon)`
  flex: 0 0 auto;
  margin-right: ${space(1)};
  color: ${props => props.color};
  display: flex;
  align-items: center;
`;

export const VariationValue = styled(Ellipsified)`
  flex: 1;
  min-width: 0;
  font-weight: 900;
`;

export const VariationTooltip = styled(Ellipsified)`
  display: flex;
  align-items: center;
  gap: ${space(0)};
`;

export const PreviousValueWrapper = styled.div`
  width: 100%;
`;

export const PreviousValueContainer = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin: ${space(0)} ${space(1)};
  gap: ${space(0)};
  line-height: 1.2rem;

  ${breakpointMaxSmall} {
    margin: ${space(1)};
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

export const PreviousValue = styled.h4`
  color: ${color("text-light")};
  text-align: center;

  ${breakpointMaxSmall} {
    text-transform: capitalize;
  }
`;

export const Separator = styled.span`
  display: inline-block;
  transform: scale(0.7);
`;

export const PreviousValueSeparator = styled(Separator)`
  color: ${color("text-light")};

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
