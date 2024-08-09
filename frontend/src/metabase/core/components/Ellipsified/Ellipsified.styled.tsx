import { css } from "@emotion/react";
import styled from "@emotion/styled";

const ellipsifyCss = css`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const clampCss = (lines: number) => css`
  display: -webkit-box;
  -webkit-line-clamp: ${lines};
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
`;

interface EllipsifiedRootProps {
  lines: number;
  "data-testid"?: string;
}

export const EllipsifiedRoot = styled.div<EllipsifiedRootProps>`
  ${({ lines }) => (lines > 1 ? clampCss(lines) : ellipsifyCss)};
`;
