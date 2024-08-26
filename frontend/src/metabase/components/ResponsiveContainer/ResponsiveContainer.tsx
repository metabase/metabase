import styled from "@emotion/styled";
import type { Ref } from "react";

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
  } & { ref?: Ref<HTMLDivElement | null> }
>``;
