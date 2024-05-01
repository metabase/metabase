import styled from "@emotion/styled";

import MetabotLogo from "metabase/core/components/MetabotLogo";
import { color, hueRotate, alpha } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const StyledMetabotLogo = styled(MetabotLogo)`
  height: 4rem;
`;

export const LayoutRoot = styled.div`
  position: relative;
  display: flex;
  min-height: 100%;
  background-color: ${color("bg-light")};
`;

export const LayoutBody = styled.div`
  position: relative;
  flex: 1;
`;

export const LayoutIllustration = styled.div<{
  backgroundImageSrc: string;
  isDefault: boolean;
}>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: ;
  filter: ${({ isDefault }) =>
    isDefault && `hue-rotate(${hueRotate("brand")}deg)`};
  background-image: ${({ backgroundImageSrc }) =>
    `url("${backgroundImageSrc}")`};
  background-size: ${({ isDefault }) =>
    isDefault ? "max(2592px, 100%) auto" : "100% auto"};
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
  min-height: 20rem;
  min-width: 35rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

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
