import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface ColorPillRootProps {
  isAuto: boolean;
}

export const ColorPillRoot = styled.div<ColorPillRootProps>`
  display: inline-block;
  padding: 0.1875rem;
  border-width: 0.0625rem;
  border-color: ${color("text-light")};
  border-style: ${props => (props.isAuto ? "dashed" : "solid")};
  border-radius: 50%;
  cursor: pointer;
`;

export const ColorPillContent = styled.div`
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
`;
