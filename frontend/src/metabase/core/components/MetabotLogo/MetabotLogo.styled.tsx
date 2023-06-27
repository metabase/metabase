import { styled } from "metabase/ui/utils";
import { hueRotate } from "metabase/lib/colors";

export const LogoRoot = styled.img`
  filter: hue-rotate(${hueRotate("brand")}deg);
`;
