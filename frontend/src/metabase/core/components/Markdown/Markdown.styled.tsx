import { FC, ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import type { MarkdownProps } from "./Markdown";

export const MarkdownRoot = styled(getComponent(ReactMarkdown))<MarkdownProps>`
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
`;

function getComponent<P>(component: (props: P) => ReactElement): FC<P> {
  return component;
}
