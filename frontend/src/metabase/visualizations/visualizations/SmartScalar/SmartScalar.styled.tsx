import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/core/components/Icon";
import { space } from "metabase/styled-components/theme";
import { isEmpty } from "metabase/lib/validate";

// NIGHT-MODE TEXT HACK:
// Our "fullscreen-night-text" className only supports one shade of text (white).
// As a temporary fix, we create dark-mode analogs for "text-medium" and "text-light" using opacity:
const detailsOpacity = 0.85; // approximates color("text-medium")
const detailsNumberOpacity = 0.7; // approximates color("text-light")

export const Variation = styled.div`
  color: ${props => props.color};
  opacity: ${props =>
    isEmpty(props.color) ? detailsNumberOpacity * detailsOpacity : 1};
  display: flex;
  align-items: center;
  max-width: 100%;
`;

export const VariationIcon = styled(Icon)`
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  margin-right: ${space(1)};
  color: ${props => props.color};
`;

export const VariationValue = styled(Ellipsified)`
  font-weight: 900;
`;

export const VariationContainerTooltip = styled.div`
  display: flex;
  align-items: center;
`;

export const PreviousValueWrapper = styled.div`
  max-width: 100%;
`;

export const VariationContainer = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin: ${space(0)} ${space(1)};
  line-height: 1.2rem;
`;

export const Separator = styled.span`
  display: inline-block;
  transform: scale(0.7);
  margin: 0 0.2rem;
  opacity: 0.4;
`;

export const PreviousValueDetails = styled.h4`
  opacity: ${detailsOpacity};
  white-space: pre;
`;

export const PreviousValueNumber = styled.span`
  opacity: ${detailsNumberOpacity};
`;
export const ScalarPeriodContent = styled.h3`
  text-align: center;
  overflow: hidden;
  cursor: ${props => props.onClick && "pointer"};
  font-size: 0.875rem;
`;
