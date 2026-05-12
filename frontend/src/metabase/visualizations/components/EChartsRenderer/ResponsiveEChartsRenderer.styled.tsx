// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { ResponsiveEChartsRendererExplicitSize } from "./ResponsiveEChartsRenderer";

export const ResponsiveEChartsRendererStyled = styled.div`
  position: absolute;
  top: 0;
  inset-inline-start: 0;
  bottom: 0;
  inset-inline-end: 0;
`;

export const ResponsiveEChartsRenderer = styled(
  ResponsiveEChartsRendererExplicitSize,
)`
  height: 100%;
`;
