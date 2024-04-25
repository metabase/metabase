import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import type { PillSize } from "./types";

export interface ColorPillRootProps {
  isAuto: boolean;
  isSelected: boolean;
  pillSize: PillSize;
}

export const ColorPillRoot = styled.div<ColorPillRootProps>`
  display: inline-block;
  flex: 0 0 auto;
  padding: 0.1875rem;
  border-width: 0.0625rem;
  border-color: ${props =>
    props.isSelected ? color("text-light") : "transparent"};
  border-style: ${props => (props.isAuto ? "dashed" : "solid")};
  border-radius: 50%;
  cursor: pointer;

  &:hover {
    border-color: ${props =>
      props.isSelected ? color("text-dark") : color("text-light")};
  }

  ${props =>
    props.pillSize === "small" &&
    css`
      padding: 1px;

      ${ColorPillContent} {
        height: 0.875rem;
        width: 0.875rem;
      }
    `};
`;

export const ColorPillContent = styled.div`
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
`;
