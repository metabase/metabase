import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const Label = styled.text`
  pointer-events: none;
  text-anchor: middle;
  fill: ${color("white")};
  font-weight: bold;
`;
