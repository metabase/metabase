import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { FixedWidthContainer } from "metabase/dashboard/components/Dashboard/DashboardComponents";
import type { DisplayTheme } from "metabase/public/lib/types";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import {
  breakpointMaxSmall,
  breakpointMinLarge,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";

export const Root = styled.div<{
  hasScroll: boolean;
  hasVisibleOverflowWhenPriting?: boolean;
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
      border: 1px solid var(--mb-color-border);
      border-radius: 8px;
      box-shadow: 0 2px 2px var(--mb-color-shadow);
    `}

  ${props =>
    // Prevents https://github.com/metabase/metabase/issues/40660
    // when printing an embedded dashboard
    props.hasVisibleOverflowWhenPriting &&
    css`
      @media print {
        overflow: visible;
      }
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
  border-bottom: 1px solid var(--mb-color-border);
`;

export const Body = styled.main`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  width: 100%;
  position: relative;
`;

export const ActionButtonsContainer = styled.div`
  color: var(--mb-color-text-medium);
  margin-left: auto;
`;

export type FooterVariant = "default" | "large";

const footerVariantStyles = {
  default: css`
    border-top: 1px solid var(--mb-color-border);
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

function getParameterPanelBackgroundColor(theme: DisplayTheme | undefined) {
  if (theme === "night") {
    return `color-mix(in srgb, var(--mb-color-bg-black), var(--mb-color-bg-dashboard) 15%)`;
  }

  if (theme === "transparent") {
    return `color-mix(in srgb, var(--mb-color-bg-white), transparent 15%)`;
  }

  return `color-mix(in srgb, var(--mb-color-bg-white), var(--mb-color-bg-dashboard) 15%)`;
}

function getParameterPanelBorderColor(theme?: DisplayTheme) {
  if (theme === "transparent") {
    return "transparent";
  }
  return "var(--mb-color-border)";
}

export const ParametersWidgetContainer = styled(FullWidthContainer)<{
  embedFrameTheme?: DisplayTheme;
  allowSticky: boolean;
  isSticky: boolean;
}>`
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};

  ${({ allowSticky }) =>
    allowSticky &&
    css`
      position: sticky;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 3;
      /* this is for proper transitions from the \`transparent\` value to other values if set */
      border-bottom: 1px solid transparent;
    `}

  ${({ embedFrameTheme, isSticky }) =>
    isSticky &&
    css`
      background-color: ${getParameterPanelBackgroundColor(embedFrameTheme)};
      border-bottom-color: ${getParameterPanelBorderColor(embedFrameTheme)};
    `}
`;

export const Footer = styled.footer<{ variant: FooterVariant }>`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  ${props => footerVariantStyles[props.variant]}
  height: calc(50 / 16 * 1rem);
  padding: 0 1em;

  ${breakpointMinSmall} {
    height: calc(65 / 16 * 1rem);
    padding: 0 1.5rem;
  }

  ${breakpointMinLarge} {
    height: calc(80 / 16 * 1rem);
    padding: 0 2rem;
  }
`;

export const TitleAndButtonsContainer = styled(FixedWidthContainer)`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;
