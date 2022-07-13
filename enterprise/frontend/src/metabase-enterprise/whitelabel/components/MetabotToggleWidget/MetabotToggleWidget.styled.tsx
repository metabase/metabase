import styled from "@emotion/styled";
import { hueRotate } from "metabase/lib/colors";

export const MetabotImage = styled.img`
  filter: hue-rotate(${() => hueRotate("brand")}deg);
`;
