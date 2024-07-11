import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import {
  breakpointMinSmall,
  breakpointMinLarge,
  breakpointMinMedium,
  space,
  breakpointMaxSmall,
} from "metabase/styled-components/theme";

export const Root = styled.div<{
  hasScroll: boolean;
  isBordered?: boolean;
}>`
  display: flex;
  flex-direction: column;
  overflow: auto;

  ${props =>
    props.hasScroll &&
    css`
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    `}

  ${props =>
    props.isBordered &&
    css`
      border: 1px solid ${color("border")};
      border-radius: 8px;
      box-shadow: 0 2px 2px ${color("shadow")};
    `}
`;

export const ContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  position: relative;
`;

export const Header = styled.header`
  display: flex;
  flex-direction: column;
`;

export const TitleAndDescriptionContainer = styled(FullWidthContainer)`
  margin-top: 0.5rem;

  ${breakpointMinSmall} {
    margin-top: 1rem;
  }

  ${breakpointMinLarge} {
    margin-top: 1.5rem;
  }
`;

export const DashboardTabsContainer = styled(FullWidthContainer)`
  ${breakpointMaxSmall} {
    padding-left: 0;
    padding-right: 0;
  }
`;

export const Separator = styled.div`
  border-bottom: 1px solid ${color("border")};
`;

export const Body = styled.main`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  width: 100%;
  position: relative;
`;

export const ActionButtonsContainer = styled.div`
  color: ${color("text-medium")};
  margin-left: auto;
`;

export type FooterVariant = "default" | "large";

const footerVariantStyles = {
  default: css`
    border-top: 1px solid ${color("border")};
  `,
  large: css`
    justify-content: center;
    align-items: center;
    margin-bottom: 2rem;

    ${ActionButtonsContainer} {
      display: none;
    }
  `,
};

function getParameterPanelBackgroundColor(theme?: string) {
  if (theme === "night") {
    return color("bg-black");
  }
  if (theme === "transparent") {
    return "transparent";
  }
  return color("white");
}

function getParameterPanelBorderColor(theme?: string) {
  if (theme === "night") {
    return color("bg-dark");
  }
  if (theme === "transparent") {
    return "transparent";
  }
  return color("border");
}

export const ParametersWidgetContainer = styled(FullWidthContainer)<{
  embedFrameTheme?: string;
  hasScroll: boolean;
  isSticky: boolean;
}>`
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};

  ${props =>
    props.hasScroll &&
    css`
      border-bottom: 1px solid
        ${getParameterPanelBorderColor(props.embedFrameTheme)};
    `}

  ${props =>
    props.isSticky &&
    css`
      position: sticky;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 3;
      background-color: ${getParameterPanelBackgroundColor(
        props.embedFrameTheme,
      )};
    `}
`;

export const Footer = styled.footer<{ variant: FooterVariant }>`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  ${props => footerVariantStyles[props.variant]}
  padding: 0.5rem;

  ${breakpointMinMedium} {
    padding: 1rem;
  }

  ${breakpointMinLarge} {
    padding: 1.5rem;
  }
`;
