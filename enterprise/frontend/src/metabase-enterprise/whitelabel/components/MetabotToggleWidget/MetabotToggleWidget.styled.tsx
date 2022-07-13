import styled from "@emotion/styled";
import { hueRotate } from "metabase/lib/colors";

export const MetabotImage = styled.img`
  display: block;
  width: 99.5px;
  height: 90px;
  filter: hue-rotate(${() => hueRotate("brand")}deg);
`;
