import styled from "@emotion/styled";

import { hueRotate } from "metabase/lib/colors";

export const LighthouseImage = styled.div`
  width: 100px;
  height: 90px;
  filter: hue-rotate(${() => hueRotate("brand")}deg);
  background-image: url("app/img/bridge.svg");
  background-size: 26rem auto;
  background-repeat: no-repeat;
  background-position: 37.5% 50%;
`;
