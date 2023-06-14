import styled from "@emotion/styled";
import { color, hueRotate, alpha } from "metabase/lib/colors";
import { space, breakpointMinSmall } from "metabase/styled-components/theme";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import { Icon } from "metabase/core/components/Icon";

export const Loading = styled(LoadingSpinner)`
  margin: ${space(1)} 0;
  color: ${color("brand")};
`;

export const LayoutIllustration = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  filter: hue-rotate(${hueRotate("brand")}deg);
  background-image: url("app/img/bridge.svg");
  background-size: max(2592px, 100%) auto;
  background-repeat: no-repeat;
  background-position: right bottom;
`;

export const LayoutCard = styled.div`
  width: 100%;
  margin-top: 1.5rem;
  padding: 2.5rem 1.5rem;
  background-color: ${color("white")};
  box-shadow: 0 1px 15px ${color("shadow")};
  border-radius: 6px;

  ${breakpointMinSmall} {
    width: 30.875rem;
    padding: 2.5rem 3.5rem;
  }
`;

export const CheckmarkIcon = styled(Icon)`
  border-radius: 100%;
  padding: 1rem;
  color: ${color("brand")};
  background: ${alpha(color("brand"), 0.3)};
`;
