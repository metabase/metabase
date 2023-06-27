import { styled } from "metabase/ui/utils";
import { hueRotate } from "metabase/lib/colors";

export const EmptyPulseIllustration = styled.img`
  width: 100%;
  max-width: 574px;
  filter: hue-rotate(${hueRotate("brand")}deg);
`;
