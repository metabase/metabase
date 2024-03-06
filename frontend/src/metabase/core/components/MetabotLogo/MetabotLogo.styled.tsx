import styled from "@emotion/styled";
import { hueRotate } from "metabase/ui/utils/colors";

export const LogoRoot = styled.img`
  filter: hue-rotate(${hueRotate("brand")}deg);
`;
