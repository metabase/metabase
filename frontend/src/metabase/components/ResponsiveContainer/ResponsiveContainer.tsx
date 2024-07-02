import styled from "@emotion/styled";

import type { RefProp } from "metabase/browse/types";
import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import { Box, type BoxProps } from "metabase/ui";

/** Helps with @container queries in CSS */
export const ResponsiveContainer = styled(
  Box,
  doNotForwardProps("name", "type"),
)<
  BoxProps & {
    name: string;
    type?: string;
  }
>`
  container-name: ${props => props.name};
  container-type: ${props => props.type};
`;
ResponsiveContainer.defaultProps = { type: "inline-size" };

export const ResponsiveChild = styled(Box, doNotForwardProps("containerName"))<
  BoxProps & {
    containerName: string;
  } & Partial<RefProp<HTMLDivElement | null>>
>``;
