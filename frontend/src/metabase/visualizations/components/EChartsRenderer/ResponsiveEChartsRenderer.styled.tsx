import styled from "@emotion/styled";

import { ResponsiveEChartsRendererExplicitSize } from "./ResponsiveEChartsRenderer";

export const ResponsiveEChartsRendererStyled = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
`;

export const ResponsiveEChartsRenderer = styled(
  ResponsiveEChartsRendererExplicitSize,
)`
  height: 100%;
`;
