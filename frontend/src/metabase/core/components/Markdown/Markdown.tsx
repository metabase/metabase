import React from "react";
import remarkGfm from "remark-gfm";
import { MarkdownRoot } from "./Markdown.styled";

const REMARK_PLUGINS = [remarkGfm];

export interface MarkdownProps {
  className?: string;
  children?: string;
}

const Markdown = ({ className, children = "" }: MarkdownProps): JSX.Element => {
  return (
    <MarkdownRoot className={className} remarkPlugins={REMARK_PLUGINS}>
      {children}
    </MarkdownRoot>
  );
};

export default Markdown;
