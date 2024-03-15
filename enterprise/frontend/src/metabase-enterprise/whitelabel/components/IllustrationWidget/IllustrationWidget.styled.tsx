import styled from "@emotion/styled";

import { hueRotate } from "metabase/lib/colors";
import { Icons } from "metabase/ui";

export const LighthouseImage = styled.div`
  width: 100px;
  height: 90px;
  filter: hue-rotate(${() => hueRotate("brand")}deg);
  background-image: url("app/img/bridge.svg");
  background-size: 26rem auto;
  background-repeat: no-repeat;
  background-position: 37.5% 50%;
`;

const fallbackImage = `url("data:image/svg+xml,${encodeURI(
  Icons.warning.source,
)}")`;

//Add an error icon as a fallback when the preview image failed to load.
export const PreviewImage = styled.img`
  position: relative;
  width: 100px;
  height: 90px;
  object-fit: cover;

  &::before {
    content: "";
    display: inline-block;
    width: 100%;
    height: 100%;
  }

  &::after {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    content: ${fallbackImage};
    display: inline-block;
    width: 20px;
    height: 20px;
  }
`;
