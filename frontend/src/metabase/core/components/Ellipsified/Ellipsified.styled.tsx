import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes, Ref } from "react";

import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import { Box, type BoxProps } from "metabase/ui";

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

type EllipsifiedRootProps = {
  lines?: number;
  "data-testid"?: string;
} & BoxProps & {
    ref?: Ref<HTMLDivElement | null>;
  } & HTMLAttributes<HTMLDivElement>;

export const EllipsifiedRoot = styled(
  Box,
  doNotForwardProps("lines"),
)<EllipsifiedRootProps>`
  ${props => ((props.lines ?? 1) > 1 ? clampCss(props) : ellipsifyCss)};
`;
