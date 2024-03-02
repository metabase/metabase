import { css } from "@emotion/react";
import styled from "@emotion/styled";

const ellipsifyCss = css`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const clampCss = (props: EllipsifiedRootProps) => css`
  display: -webkit-box;
  -webkit-line-clamp: ${props.lines};
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
`;

interface EllipsifiedRootProps {
  lines?: number;
  "data-testid"?: string;
}

export const EllipsifiedRoot = styled.div<EllipsifiedRootProps>`
  ${props => ((props.lines ?? 1) > 1 ? clampCss(props) : ellipsifyCss)};
`;
