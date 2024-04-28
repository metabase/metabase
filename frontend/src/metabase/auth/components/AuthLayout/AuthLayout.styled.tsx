import styled from "@emotion/styled";

import { color, hueRotate } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const LayoutRoot = styled.div`
  position: relative;
  min-height: 100vh;
  background-color: ${color("bg-light")};
`;

export const LayoutBody = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  padding: 1.5rem 1rem 3rem;
  min-height: 100vh;
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

export const LayoutIllustration = styled.div<{
  backgroundImageSrc: string;
  isDefault: boolean;
}>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  filter: ${({ isDefault }) =>
    isDefault && `hue-rotate(${hueRotate("brand")}deg)`};
  background-image: ${({ backgroundImageSrc }) =>
    `url("${backgroundImageSrc}")`};
  background-size: ${({ isDefault }) =>
    isDefault ? "max(2592px, 100%) auto" : "100% auto"};
  background-repeat: no-repeat;
  background-position: right bottom;
`;
