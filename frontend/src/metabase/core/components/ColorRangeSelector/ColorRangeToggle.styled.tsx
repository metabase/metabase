import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import ColorRange from "metabase/core/components/ColorRange";

import type { ColorRangeProps } from "../ColorRange/ColorRange";

export const ToggleRoot = styled.div`
  display: flex;
`;

export const ToggleColorRange = styled(ColorRange)<ColorRangeProps>`
  flex: 1 1 auto;
  cursor: ${props => (props.onSelect ? "pointer" : " default")};
`;

export const ToggleButton = styled(Button)`
  flex: 0 0 auto;
  margin-left: 0.375rem;
`;
