import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

// export const Variation = styled.div`
//   .${DashboardS.Dashboard}.${DashboardS.DashboardNight}.${DashboardS.DashboardFullscreen}
//     .${DashboardS.fullscreenNightText}
//     &,
//   .variation-container-tooltip & {
//     color: ${props =>
//       isEmpty(props.color) ? lighten("text-medium", 0.3) : props.color};
//   }
// `;

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

// export const Separator = styled.span`
//   .${DashboardS.Dashboard}.${DashboardS.DashboardNight}.${DashboardS.DashboardFullscreen}
//     .${DashboardS.fullscreenNightText}
//     &,
//   .variation-container-tooltip & {
//     color: ${lighten("text-medium", 0.15)};
//   }
// `;

// export const PreviousValueDetails = styled.h4`
//   color: ${color("text-medium")};
//   white-space: pre;

//   .${DashboardS.Dashboard}.${DashboardS.DashboardNight}.${DashboardS.DashboardFullscreen}
//     .${DashboardS.fullscreenNightText}
//     &,
//   .variation-container-tooltip & {
//     color: ${lighten("text-light", 0.25)};
//   }
// `;

// export const PreviousValueNumber = styled.span`
//   .${DashboardS.Dashboard}.${DashboardS.DashboardNight}.${DashboardS.DashboardFullscreen}
//     .${DashboardS.fullscreenNightText}
//     &,
//   .variation-container-tooltip & {
//     color: ${lighten("text-medium", 0.45)};
//   }
// `;
