import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const REMARK_PLUGINS = [remarkGfm];

export interface MarkdownProps {
  className?: string;
  children?: string;
}

const Markdown = ({ className, children = "" }: MarkdownProps): JSX.Element => {
  return (
    <ReactMarkdown className={className} remarkPlugins={REMARK_PLUGINS}>
      {children}
    </ReactMarkdown>
  );
};

export default Markdown;
