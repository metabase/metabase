import styled from "@emotion/styled";

import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

/**
 * Injects CSS variables and styles to the SDK components underneath them.
 * This is to ensure that the SDK components are styled correctly,
 * even when rendered under a React portal.
 */
export const PublicComponentStylesWrapper = styled.div`
  // Try to reset as much as possible to avoid css leaking from host app to our components
  all: initial;
  text-decoration: none;

  // # Basic css reset
  // We can't apply a global css reset as it would leak into the host app
  // but we can't also apply our entire css reset scoped to this container,
  // as it would be of higher specificity than some of our styles.
  // We'll have to hand pick the css resets that we neeed

  button {
    border: 0;
    background-color: transparent;
  }
  // end of RESET

  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  width: 100%;
  height: 100%;

  position: relative;

  font-size: ${({ theme }) => theme.other.fontSize};

  font-weight: 400;
  color: var(--mb-color-text-dark);
  font-family: var(--mb-default-font-family), sans-serif;

  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  ${aceEditorStyles}
  ${saveDomImageStyles}

  :where(svg) {
    display: inline;
  }
`;
