import type { Theme } from "@emotion/react";
import { css } from "@emotion/react";

export const getRootStyle = (theme: Theme) => css`
  font-family: var(--mb-default-font-family), sans-serif;
  font-weight: 400;
  font-style: normal;
  color: ${theme.fn.themeColor("text-dark")};
  margin: 0;
  height: 100%; /* ensure the entire page will fill the window */
  display: flex;
  flex-direction: column;
  background-color: ${theme.fn.themeColor("bg-light")};
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

  /*
  explicitly set the th text alignment to left. this is required for IE
  which follows the suggested rendering and defaults to center, whereas
  chrome and others do not
*/
  th {
    text-align: left;
  }

  /* reset button element */
  button {
    font-size: 100%;
    -webkit-appearance: none;
    border: 0;
    padding: 0;
    margin: 0;
    outline: none;
    background-color: transparent;
  }

  a {
    color: inherit;
    cursor: pointer;
    text-decoration: none;
  }

  button,
  input,
  textarea {
    font-family: var(--mb-default-font-family), "Helvetica Neue", Helvetica,
      sans-serif;
  }

  textarea {
    min-height: 110px;
  }
`;
