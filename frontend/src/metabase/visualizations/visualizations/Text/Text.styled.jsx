import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const EditModeContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0.4rem;
  width: 100%;
  pointer-events: auto;
  border-radius: 8px;

  .DashCard:hover &,
  .DashCard:focus-within & {
    padding: calc(0.4rem - 1px);
    border: 1px solid ${color("brand")};
  }

  .DashCard.resizing & {
    border: 1px solid ${color("brand")};
  }

  ${({ isPreviewing, isEmpty }) =>
    (!isPreviewing || isEmpty) &&
    css`
      padding: calc(0.4rem - 1px);
    `} // adjust for border on preview/no entered content
  ${({ isEmpty }) =>
    isEmpty &&
    css`
      border: 1px solid ${color("brand")};
      color: ${color("text-light")};
    `}
`;

export const ReactMarkdownStyleWrapper = styled.div`
  height: 100%;
  width: 100%;

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

  .text-card-markdown h1:first-child,
  .text-card-markdown h2:first-child,
  .text-card-markdown h3:first-child,
  .text-card-markdown h4:first-child,
  .text-card-markdown h5:first-child,
  .text-card-markdown h6:first-child,
  .text-card-markdown p:first-child,
  .text-card-markdown ul:first-child,
  .text-card-markdown ol:first-child,
  .text-card-markdown table:first-child {
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
    font-weight: 900;
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
    color: var(--color-brand);
  }
  .text-card-markdown a:hover {
    text-decoration: underline;
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
    border-bottom: 1px solid color-mod(var(--color-border) alpha(-70%));
  }
  .text-card-markdown tr:nth-child(even) {
    background-color: color-mod(var(--color-bg-black) alpha(-98%));
  }
  .text-card-markdown th,
  .text-card-markdown td {
    padding: 0.75em;
    border: 1px solid color-mod(var(--color-border) alpha(-70%));
  }

  .text-card-markdown code {
    font-family: Monaco, monospace;
    font-size: 12.64px;
    line-height: 20px;
    padding: 0 0.25em;
    background-color: var(--color-bg-light);
    border-radius: var(--default-border-radius);
  }

  .text-card-markdown pre code {
    padding: 1em;
    display: block;
    margin-right: 1.5em;
  }

  .text-card-markdown blockquote {
    color: var(--color-text-medium);
    border-left: 5px solid var(--color-border);
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

export const TextInput = styled.textarea`
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
`;

export const DisplayContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0.4rem;
  width: 100%;

  ${({ isSingleRow }) =>
    isSingleRow &&
    css`
      @media screen and (min-width: 1280px) {
        font-size: 0.85em;
      }
    `}
`;
