import styled from "@emotion/styled";

import { rootStyle } from "metabase/css/core/base.styled";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

/**
 * Injects CSS variables and styles to the SDK components underneath them.
 * This is to ensure that the SDK components are styled correctly,
 * even when rendered under a React portal.
 */
export const PublicComponentStylesWrapper = styled.div`
  // RESET
  // try to reset as much as possible to avoid css leaking from host app to our components
  all: initial;
  text-decoration: none;

  // TODO: place here the css resets we need, for example button border etc
  // end of RESET

  // TODO: rootStyle contains css that target html and body and other global tags
  // we should scope them to this container
  ${rootStyle}

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
