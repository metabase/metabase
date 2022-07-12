import styled from "@emotion/styled";
import { color, hueRotate } from "metabase/lib/colors";
import {
  breakpointMinExtraLarge,
  breakpointMinLarge,
  breakpointMinMedium,
} from "metabase/styled-components/theme";

export const LayoutRoot = styled.div`
  position: relative;
  min-height: 100%;
  padding: 1rem;
  background-color: ${color("bg-light")};

  ${breakpointMinMedium} {
    padding: 3rem 4rem;
  }

  ${breakpointMinLarge} {
    padding: 4rem 7rem 2rem;
  }

  ${breakpointMinExtraLarge} {
    padding: 10rem 15rem 4rem;
  }
`;

export const LayoutBody = styled.div`
  position: relative;
  margin-top: 2.5rem;

  ${breakpointMinMedium} {
    margin-top: 4rem;
  }

  ${breakpointMinLarge} {
    margin-top: 6rem;
  }
`;

export const LayoutIllustration = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  filter: hue-rotate(${hueRotate("brand")}deg);
  background-image: url("app/img/bridge.svg");
  background-size: max(min(1728px, 260vh), 100%) auto;
  background-repeat: no-repeat;
  background-position: bottom;
`;
