import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type React from "react";

import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

/**
 * Injects CSS variables and styles to the SDK components underneath them.
 * This is to ensure that the SDK components are styled correctly,
 * even when rendered under a React portal.
 */
const PublicComponentStylesWrapperInner = styled.div`
  // Try to reset as much as possible to avoid css leaking from host app to our components
  all: initial;
  text-decoration: none;

  font-style: normal;

  width: 100%;
  height: 100%;

  position: relative;

  font-size: ${({ theme }) => theme.other.fontSize};

  font-weight: 400;
  color: var(--mb-color-text-dark);
  font-family: var(--mb-default-font-family);

  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  ${saveDomImageStyles}

  :where(svg) {
    display: inline;
  }
`;

export const PublicComponentStylesWrapper = (
  props: React.ComponentProps<"div">,
) => {
  return (
    <PublicComponentStylesWrapperInner
      {...props}
      // eslint-disable-next-line react/prop-types -- className is in div props :shrugs:
      className={`mb-wrapper ${props.className}`}
    />
  );
};
/**
 * We can't apply a global css reset as it would leak into the host app but we
 * can't also apply our entire css reset scoped to this container, as it would
 * be of higher specificity than some of our styles.
 *
 * The reason why this works is two things combined:
 * - `*:where(button)` doesn't increase specificity, so the resulting specificity is (0,1,0)
 * - this global css is loaded in the provider, before our other styles
 * - -> our other code with specificity (0,1,0) will override this as they're loaded after
 */
export const SCOPED_CSS_RESET = css`
  ${PublicComponentStylesWrapperInner} *:where(button) {
    border: 0;
    background-color: transparent;
  }

  // fonts.styled.ts has a reset for list padding and margin in the main app, so we need to do it here
  ${PublicComponentStylesWrapperInner} *:where(ul) {
    padding: 0;
    margin: 0;
  }
`;
