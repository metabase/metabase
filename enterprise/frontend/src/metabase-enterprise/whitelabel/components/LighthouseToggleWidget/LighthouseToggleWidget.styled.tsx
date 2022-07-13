import styled from "@emotion/styled";
import { hueRotate } from "metabase/lib/colors";

export const LighthouseImage = styled.img`
  width: 5.875rem;
  filter: hue-rotate(${() => hueRotate("brand")}deg);
`;
