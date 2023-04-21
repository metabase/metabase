import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import {
  breakpointMinSmall,
  breakpointMinLarge,
  breakpointMinMedium,
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
      border: 1px solid ${color("border")};
      border-radius: 8px;
      box-shadow: 0 2px 2px ${color("shadow")};
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
  padding: 0.5rem;

  ${breakpointMinSmall} {
    padding: 1rem;
  }

  ${breakpointMinLarge} {
    padding: 1.5rem;
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

export const ParametersWidgetContainer = styled.div`
  display: flex;
  align-items: flex-start;
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
