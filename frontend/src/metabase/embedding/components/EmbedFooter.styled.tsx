// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import {
  breakpointMinLarge,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const ActionButtonsContainer = styled.div`
  color: var(--mb-color-text-secondary);
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

export const Footer = styled.footer<{ variant: FooterVariant }>`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  ${(props) => footerVariantStyles[props.variant]}
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
