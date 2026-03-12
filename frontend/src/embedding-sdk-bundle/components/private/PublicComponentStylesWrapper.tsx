// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import styled from "@emotion/styled";
import cx from "classnames";
import type React from "react";
import { forwardRef } from "react";

import { saveDomImageStyles } from "metabase/visualizations/lib/image-exports";

import S from "./PublicComponentStylesWrapper.style.css";

/**
 * Injects CSS variables and styles to the SDK components underneath them.
 * This is to ensure that the SDK components are styled correctly,
 * even when rendered under a React portal.
 */
const PublicComponentStylesWrapperInner = styled.div`
  font-size: ${({ theme }) => theme.other.fontSize};
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
      className={cx("mb-wrapper", S.publicComponentWrapper, props.className)}
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
