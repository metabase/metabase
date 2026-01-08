// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";

export const rootStyle = css`
  font-family: var(--mb-default-font-family), sans-serif;
  font-weight: 400;
  font-style: normal;
  color: var(--mb-color-text-primary);
  margin: 0;
  height: 100%; /* ensure the entire page will fill the window */
  display: flex;
  flex-direction: column;
  background-color: var(--mb-color-background-secondary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
`;

export const baseStyle = css`
  html {
    height: 100%; /* ensure the entire page will fill the window */
    width: 100%;
  }

  @media print and (orientation: portrait) {
    html {
      width: 8.5in;
    }
  }

  @media print and (orientation: landscape) {
    html {
      width: 11in;
    }
  }

  /*
  override default padding and margin on lists
  in most cases we won't be using list-style so
  the padding isn't necessary
*/
  ul,
  ol {
    padding: 0;
    margin: 0;
    list-style-type: none;
  }

  // Mobile Safari sets the opacity of disabled inputs to 0.4 which we don't want
  // https://github.com/metabase/metabase/issues/49170
  @supports (-webkit-touch-callout: none) {
    input:disabled {
      opacity: 1;
    }
  }
`;
