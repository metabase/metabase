import styled from "@emotion/styled";
import type { Theme } from "@emotion/react";
import { css } from "@emotion/react";
import { color } from "metabase/ui/utils/colors";
import {
  breakpointMinLarge,
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const Root = styled.div<{
  hasScroll: boolean;
  isBordered?: boolean;
}>`
  display: flex;
  flex-direction: column;

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
      border: 1px solid ${props.theme.fn.themeColor("border")};
      border-radius: 8px;
      box-shadow: 0 2px 2px ${props.theme.fn.themeColor("shadow")};
    `}
`;

export const ContentContainer = styled.div<{ hasScroll: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  position: relative;

  overflow-y: ${props => props.hasScroll && "auto"};
`;

export const Header = styled.header`
  display: flex;
  flex-direction: column;
`;

export const TitleAndDescriptionContainer = styled.div`
  padding: 0.5rem 0.5rem 0 0.5rem;

  ${breakpointMinSmall} {
    padding: 1rem 1rem 0 1rem;
  }

  ${breakpointMinLarge} {
    padding: 1.5rem 1.5rem 0 1.5rem;
  }
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
  default: (theme: Theme) => css`
    border-top: 1px solid ${theme.fn.themeColor("border")};
  `,
  large: () => css`
    justify-content: center;
    align-items: center;
    margin-bottom: 2rem;

    ${ActionButtonsContainer} {
      display: none;
    }
  `,
};

export const ParametersWidgetContainer = styled.div`
  display: flex;
  align-items: flex-start;

  padding: 0.5rem;

  ${breakpointMinSmall} {
    padding: 0.5rem 1rem 1rem 1rem;
  }

  ${breakpointMinLarge} {
    padding: 0.5rem 1.5rem 1.5rem 1.5rem;
  }
`;

export const Footer = styled.footer<{ variant: FooterVariant }>`
  display: flex;
  flex-shrink: 0;
  align-items: center;

  ${props => footerVariantStyles[props.variant](props.theme)}

  padding: 0.5rem;

  ${breakpointMinMedium} {
    padding: 1rem;
  }

  ${breakpointMinLarge} {
    padding: 1.5rem;
  }
`;
