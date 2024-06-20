import styled from "@emotion/styled";

import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";

/**
 * Injects CSS variables and styles to the SDK components underneath them.
 * This is to ensure that the SDK components are styled correctly,
 * even when rendered under a React portal.
 */
export const PublicComponentStylesWrapper = styled.div`
  width: 100%;
  ${({ theme }) => getMetabaseCssVariables(theme)}

  :where(svg) {
    display: inline;
  }
`;
