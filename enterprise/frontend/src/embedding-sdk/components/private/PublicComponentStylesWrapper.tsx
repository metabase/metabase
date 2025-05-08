import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type React from "react";
import { forwardRef } from "react";

import { saveDomImageStyles } from "metabase/visualizations/lib/image-exports";

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

  font-size: ${({ theme }) => theme.other.fontSize};

  font-weight: 400;
  color: var(--mb-color-text-dark);
  font-family: var(--mb-default-font-family);

  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  transition: var(--transition-theme-change);

  ${saveDomImageStyles}
`;

export const PublicComponentStylesWrapper = forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(function PublicComponentStylesWrapper(props, ref) {
  return (
    <PublicComponentStylesWrapperInner
      {...props}
      ref={ref}
      dir="ltr"
      // eslint-disable-next-line react/prop-types -- className is in div props :shrugs:
      className={`mb-wrapper ${props.className}`}
      // Mantine's cssVariablesSelector expects data-mantine-color-scheme to be set on the target element
      data-mantine-color-scheme="light"
    />
  );
});

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
// note: if we move this to  css.module, remember to add :global to .mb-wrapper
export const SCOPED_CSS_RESET = css`
  :where(.mb-wrapper) *:where(button) {
    border: 0;
    background-color: transparent;
  }

  // fonts.styled.ts has a reset for list padding and margin in the main app, so we need to do it here
  :where(.mb-wrapper) *:where(ul) {
    padding: 0;
    margin: 0;
  }

  :where(.mb-wrapper) *:where(svg) {
    display: inline;
  }
`;
