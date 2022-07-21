import styled from "@emotion/styled";
import { hueRotate } from "metabase/lib/colors";

export const MetabotImage = styled.img`
  display: block;
  width: 100px;
  height: 90px;
  margin: 0.5rem 1rem 0.75rem 1.25rem;
  filter: hue-rotate(${() => hueRotate("brand")}deg);
`;
