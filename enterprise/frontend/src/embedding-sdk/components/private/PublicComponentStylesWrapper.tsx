import styled from "@emotion/styled";

import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

/**
 * Injects CSS variables and styles to the SDK components underneath them.
 * This is to ensure that the SDK components are styled correctly,
 * even when rendered under a React portal.
 */
export const PublicComponentStylesWrapper = styled.div`
  width: 100%;
  font-weight: 400;
  color: var(--mb-color-text-dark);
  font-family: var(--mb-default-font-family), sans-serif;

  ${({ theme }) => getMetabaseCssVariables(theme)}

  ${aceEditorStyles}
  ${saveDomImageStyles}

  :where(svg) {
    display: inline;
  }
`;
