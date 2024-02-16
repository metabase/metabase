import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color, lighten } from "metabase/lib/colors";
import { isEmpty } from "metabase/lib/validate";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const Variation = styled.div`
  color: ${props => (isEmpty(props.color) ? color("text-light") : props.color)};
  display: flex;
  align-items: center;
  max-width: 100%;

  .Dashboard.Dashboard--night.Dashboard--fullscreen .fullscreen-night-text &,
  .variation-container-tooltip & {
    color: ${props =>
      isEmpty(props.color) ? lighten("text-medium", 0.3) : props.color};
  }
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
  color: ${lighten("text-light", 0.25)};

  .Dashboard.Dashboard--night.Dashboard--fullscreen .fullscreen-night-text &,
  .variation-container-tooltip & {
    color: ${lighten("text-medium", 0.15)};
  }
`;

export const PreviousValueDetails = styled.h4`
  color: ${color("text-medium")};
  white-space: pre;

  .Dashboard.Dashboard--night.Dashboard--fullscreen .fullscreen-night-text &,
  .variation-container-tooltip & {
    color: ${lighten("text-light", 0.25)};
  }
`;

export const PreviousValueNumber = styled.span`
  color: ${color("text-light")};

  .Dashboard.Dashboard--night.Dashboard--fullscreen .fullscreen-night-text &,
  .variation-container-tooltip & {
    color: ${lighten("text-medium", 0.45)};
  }
`;
export const ScalarPeriodContent = styled.h3`
  text-align: center;
  overflow: hidden;
  cursor: ${props => props.onClick && "pointer"};
  font-size: 0.875rem;
`;
