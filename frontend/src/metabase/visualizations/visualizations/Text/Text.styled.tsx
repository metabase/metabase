import { css } from "@emotion/react";
import styled from "@emotion/styled";

import DashboardS from "metabase/css/dashboard.module.css";
import { color } from "metabase/lib/colors";
import {
  breakpointMinExtraLarge,
  breakpointMaxExtraLarge,
} from "metabase/styled-components/theme";

const DEFAULT_CONTAINER_PADDING_SIZE = "0.75rem";
const SMALL_CONTAINER_PADDING_SIZE = "0.3rem";

interface TextCardWrapperProps {
  isSingleRow: boolean;
  isMobile: boolean;
}
const TextCardWrapper = styled.div<TextCardWrapperProps>`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: ${DEFAULT_CONTAINER_PADDING_SIZE};
  width: 100%;

  /* adjust styles for single row text cards on desktop resolutions to prevent
  clipping of text cards (https://github.com/metabase/metabase/issues/31613) */
  ${({ isSingleRow, isMobile }) =>
    isSingleRow &&
    !isMobile &&
    css`
      padding: ${SMALL_CONTAINER_PADDING_SIZE} ${DEFAULT_CONTAINER_PADDING_SIZE};
      font-size: 0.8em;

      ${breakpointMinExtraLarge} {
        padding: ${DEFAULT_CONTAINER_PADDING_SIZE};
        font-size: 1em;
      }
    `}
`;

const BORDER_ADJUSTED_DEFAULT_PADDING = css`
  padding: calc(${DEFAULT_CONTAINER_PADDING_SIZE} - 1px);
`;
const BORDER_ADJUSTED_SMALL_PADDING = css`
  padding: calc(${SMALL_CONTAINER_PADDING_SIZE} - 1px)
    calc(${DEFAULT_CONTAINER_PADDING_SIZE} - 1px);
`;
interface EditModeProps {
  isPreviewing: boolean;
  isEmpty: boolean;
  isSingleRow: boolean;
  isMobile: boolean;
}
export const EditModeContainer = styled(TextCardWrapper)<EditModeProps>`
  border-radius: 8px;
  pointer-events: all;

  * {
    pointer-events: all;
  }

  .${DashboardS.DashCard}:hover &,
  .${DashboardS.DashCard}:focus-within & {
    border: 1px solid ${color("brand")};
  }

  .${DashboardS.DashCard}.resizing & {
    border: 1px solid ${color("brand")};
  }

  ${({ isEmpty }) =>
    isEmpty &&
    css`
      border: 1px solid ${color("brand")};
      color: ${color("text-light")};
    `}

  ${({ isSingleRow, isPreviewing, isEmpty, isMobile }) => {
    const borderActive = !isPreviewing || isEmpty;

    // adjust styles for single row text cards on desktop resolutions
    // to prevent clipping of text cards (https://github.com/metabase/metabase/issues/31613)
    if (isSingleRow && !isMobile) {
      return css`
        .${DashboardS.DashCard}:hover &,
        .${DashboardS.DashCard}:focus-within & {
          ${BORDER_ADJUSTED_SMALL_PADDING}/* adjust for border on preview/no entered content */
        }

        ${borderActive &&
        css`
          ${BORDER_ADJUSTED_SMALL_PADDING}
        `}

        ${breakpointMinExtraLarge} {
          .${DashboardS.DashCard}:hover &,
          .${DashboardS.DashCard}:focus-within & {
            ${BORDER_ADJUSTED_DEFAULT_PADDING}
          }

          ${borderActive &&
          css`
            ${BORDER_ADJUSTED_DEFAULT_PADDING}
          `}
        }
      `;
    }

    return css`
      .${DashboardS.DashCard}:hover &,
      .${DashboardS.DashCard}:focus-within & {
        ${BORDER_ADJUSTED_DEFAULT_PADDING}
      }

      ${borderActive &&
      css`
        ${BORDER_ADJUSTED_DEFAULT_PADDING}
      `}
    `;
  }}
`;

interface DisplayContainerProps {
  isSingleRow: boolean;
  isMobile: boolean;
}
export const DisplayContainer = styled(
  TextCardWrapper,
)<DisplayContainerProps>``;

export const ReactMarkdownStyleWrapper = styled.div`
  height: 100%;
  width: 100%;
  padding-left: 2px; /* adjust padding to align text input and markdown preview */
  font-size: inherit;

  .text-card-markdown {
    height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    pointer-events: all;
    width: 100%;
  }

  .cursor-text {
    cursor: text;
  }

  .text-card-markdown h1,
  .text-card-markdown h2,
  .text-card-markdown h3,
  .text-card-markdown h4,
  .text-card-markdown h5,
  .text-card-markdown h6 {
    margin: 0.375em 0 0.25em 0;
  }

  .text-card-markdown h1:first-of-type,
  .text-card-markdown h2:first-of-type,
  .text-card-markdown h3:first-of-type,
  .text-card-markdown h4:first-of-type,
  .text-card-markdown h5:first-of-type,
  .text-card-markdown h6:first-of-type,
  .text-card-markdown p:first-of-type,
  .text-card-markdown ul:first-of-type,
  .text-card-markdown ol:first-of-type,
  .text-card-markdown table:first-of-type {
    margin-top: 0.125em;
  }

  .text-card-markdown h1:last-child,
  .text-card-markdown h2:last-child,
  .text-card-markdown h3:last-child,
  .text-card-markdown h4:last-child,
  .text-card-markdown h5:last-child,
  .text-card-markdown h6:last-child,
  .text-card-markdown p:last-child,
  .text-card-markdown ul:last-child,
  .text-card-markdown ol:last-child,
  .text-card-markdown table:last-child {
    margin-bottom: 0.125em;
  }

  .text-card-markdown h1 {
    font-size: 1.831em;
  }

  .text-card-markdown h2 {
    font-size: 1.627em;
  }

  .text-card-markdown h3 {
    font-size: 1.447em;
  }

  .text-card-markdown h4 {
    font-size: 1.286em;
  }

  .text-card-markdown h5 {
    font-size: 1.143em;
  }

  .text-card-markdown p {
    font-size: 1.143em;
    line-height: 1.602em;
    padding: 0;
    margin: 0 0 0.5em 0;
  }

  .text-card-markdown ul {
    font-size: 16px;
    margin: 0;
    padding: 0.5em 1.5em;
    list-style-type: disc;
  }

  .text-card-markdown ol {
    font-size: 16px;
    margin: 0;
    padding: 0.5em 1.5em;
    list-style-type: decimal;
  }

  .text-card-markdown li {
    list-style-position: outside;
    padding: 0.25em 0 0 0;
  }

  .text-card-markdown a {
    display: inline-block;
    font-weight: bold;
    cursor: pointer;
    text-decoration: none;
    color: ${color("brand")};
  }

  .text-card-markdown a:hover {
    text-decoration: underline;
  }

  .text-card-markdown th {
    text-align: left;
  }

  .text-card-markdown table {
    /* standard table reset */
    border-collapse: collapse;
    border-spacing: 0;
    margin: 1em 0;
    width: 100%;
    font-family: Monaco, monospace;
    font-size: 12.64px;
    line-height: 0.76rem;
    text-align: left;
  }

  .text-card-markdown tr {
    border-bottom: 1px solid color-mod(${color("border")} alpha(-70%));
  }

  .text-card-markdown tr:nth-of-type(even) {
    background-color: color-mod(${color("bg-black")} alpha(-98%));
  }

  .text-card-markdown th,
  .text-card-markdown td {
    padding: 0.75em;
    border: 1px solid color-mod(${color("border")} alpha(-70%));
  }

  .text-card-markdown code {
    font-family: Monaco, monospace;
    font-size: 12.64px;
    line-height: 20px;
    padding: 0 0.25em;
    background-color: ${color("bg-light")};
    border-radius: 8px;
  }

  .text-card-markdown pre code {
    padding: 1em;
    display: block;
    margin-right: 1.5em;
  }

  .text-card-markdown blockquote {
    color: ${color("text-medium")};
    border-left: 5px solid ${color("border")};
    padding: 0 1.5em 0 17px;
    margin: 0.5em 0 0.5em 1em;
  }

  .text-card-markdown blockquote p {
    padding: 0;
    margin: 0;
  }

  .text-card-markdown img {
    max-width: 100%;
    height: auto;
  }

  .text-card-markdown hr {
    margin: 0;
  }
`;

interface TextAreaProps {
  isSingleRow: boolean;
  isMobile: boolean;
}
export const TextInput = styled.textarea<TextAreaProps>`
  width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  background-color: ${color("bg-light")};
  border: none;
  border-radius: 8px;
  box-shadow: none;
  font-size: 1.143em;
  height: inherit;
  line-height: 1.602em;
  min-height: unset;
  outline: none;
  pointer-events: all;
  resize: none;

  ${({ isSingleRow, isMobile }) =>
    isSingleRow &&
    !isMobile &&
    css`
      ${breakpointMaxExtraLarge} {
        line-height: calc(1.602em - 1px);
      }
    `}
`;
