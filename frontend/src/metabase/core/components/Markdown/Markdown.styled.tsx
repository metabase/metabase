import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { FC, ReactElement } from "react";
import ReactMarkdown from "react-markdown";

import { color } from "metabase/lib/colors";

import type { MarkdownProps } from "./Markdown";

export const MarkdownRoot = styled(getComponent(ReactMarkdown))<MarkdownProps>`
  ${props =>
    props.lineClamp &&
    css`
      display: -webkit-box;
      -webkit-line-clamp: ${props.lineClamp};
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: break-word;
      white-space: pre-line;
    `}

  p {
    margin: 0;
    line-height: 1.57em;
  }

  p:not(:last-child) {
    margin-bottom: 0.5rem;
  }

  a {
    cursor: pointer;
    text-decoration: none;
    color: ${props => (props.unstyleLinks ? color("white") : color("brand"))};
  }

  a:hover {
    text-decoration: ${props => (props.unstyleLinks ? "none" : "underline")};
  }

  img {
    max-width: 100%;
    height: auto;
  }

  hr {
    border: none;
    border-bottom: 1px solid
      ${props => (props.dark ? color("bg-dark") : color("border"))};
  }
`;

function getComponent<P>(component: (props: P) => ReactElement): FC<P> {
  return component;
}
