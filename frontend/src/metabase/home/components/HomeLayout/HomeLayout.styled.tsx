import styled from "@emotion/styled";
import Button from "metabase/core/components/Button/Button";
import { hueRotate, lighten } from "metabase/lib/colors";
import {
  breakpointMinExtraLarge,
  breakpointMinLarge,
  breakpointMinMedium,
} from "metabase/styled-components/theme";

export const LayoutRoot = styled.div`
  position: relative;
  min-height: 100%;
  padding: 0.5rem;
  background-image: url("app/img/omniloy_background.svg");
  background-repeat: no-repeat;
  background-position: 100% 100%;
  background-size: 130rem auto;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

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

export const LayoutIllustration = styled.div<{
  backgroundImageSrc: string;
  isDefault: boolean;
}>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  filter: ${({ isDefault }) =>
    isDefault && `hue-rotate(${hueRotate("brand")}deg)`};
  background-repeat: no-repeat;
  background-position: bottom;
  background-color: #c4c4c4;
`;

export const LayoutEditButton = styled(Button)`
  position: absolute;
  top: 0.75rem;
  right: 1rem;

  &:hover {
    color: var(--mb-color-brand);
    background: ${() => lighten("brand", 0.6)};
  }
`;

export const ContentContainer = styled.div`
  margin-bottom: 40px;
`;

export const ChatSection = styled.div`
  width: 100%;
  margin: 0 auto;
  padding-bottom: 15rem; /* Ensures there is space at the bottom of the screen */
  position: relative;

  ${breakpointMinMedium} {
    padding-bottom: 15rem;
  }

  ${breakpointMinLarge} {
    padding-bottom: 15rem;
  }
`;
