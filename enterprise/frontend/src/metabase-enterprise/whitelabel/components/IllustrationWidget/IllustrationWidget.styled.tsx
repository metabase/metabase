import styled from "@emotion/styled";

import noResultsSource from "assets/img/no_results.svg";
import { hueRotate } from "metabase/lib/colors";
import warningSource from "metabase/ui/components/icons/Icon/icons/warning.svg";

export const LighthouseImage = styled.div`
  width: 100px;
  height: 90px;
  filter: hue-rotate(${() => hueRotate("brand")}deg);
  background-image: url("app/img/bridge.svg");
  background-size: 26rem auto;
  background-repeat: no-repeat;
  background-position: 37.5% 50%;
`;

export const SailboatImage = styled.div`
  width: 100px;
  height: 90px;
  background-image: url(${noResultsSource});
  background-size: contain;
`;

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
    content: url(${warningSource});
    display: inline-block;
    width: 20px;
    height: 20px;
  }
`;
