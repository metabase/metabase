import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { alpha, color } from "metabase/lib/colors";
import {
  breakpointMinExtraLarge,
  breakpointMinLarge,
  breakpointMinMedium,
} from "metabase/styled-components/theme";

export interface LayoutProps {
  showScene?: boolean;
}

const sceneStyles = css`
  background-color: ${color("bg-light")};
  background-image: url("app/img/bridge.svg");
  background-size: max(1728px, 100%) auto;
  background-repeat: no-repeat;
  background-position: bottom;
`;

const gradientStyles = css`
  background: linear-gradient(
    to bottom,
    ${color("white")},
    ${alpha("brand", 0.2)}
  );
`;

export const LayoutRoot = styled.div<LayoutProps>`
  min-height: 100%;
  padding: 1rem;
  ${props => (props.showScene ? sceneStyles : gradientStyles)};

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
  margin-top: 2.5rem;

  ${breakpointMinMedium} {
    margin-top: 4rem;
  }

  ${breakpointMinLarge} {
    margin-top: 6rem;
  }
`;
