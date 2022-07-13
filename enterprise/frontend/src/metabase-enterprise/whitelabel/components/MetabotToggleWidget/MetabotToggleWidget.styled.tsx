import styled from "@emotion/styled";
import { hueRotate } from "metabase/lib/colors";

export const MetabotImage = styled.img`
  width: 5.875rem;
  height: 5.3125rem;
  filter: hue-rotate(${() => hueRotate("brand")}deg);
`;
