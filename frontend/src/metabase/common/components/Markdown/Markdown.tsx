import type { ComponentPropsWithRef } from "react";
import type ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MarkdownRoot } from "./Markdown.styled";

const REMARK_PLUGINS = [remarkGfm];

export interface MarkdownProps
  extends ComponentPropsWithRef<typeof ReactMarkdown> {
  className?: string;
  dark?: boolean;
  disallowHeading?: boolean;
  unstyleLinks?: boolean;
  children: string;
  lineClamp?: number;
}

const Markdown = ({
  className,
  children = "",
  dark,
  disallowHeading = false,
  unstyleLinks = false,
  ...rest
}: MarkdownProps): JSX.Element => {
  const additionalOptions = {
    ...(disallowHeading && {
      disallowedElements: ["h1", "h2", "h3", "h4", "h5", "h6"],
      unwrapDisallowed: true,
    }),
  };

  return (
    <MarkdownRoot
      className={className}
      dark={dark}
      remarkPlugins={REMARK_PLUGINS}
      linkTarget={"_blank"}
      unstyleLinks={unstyleLinks}
      {...additionalOptions}
      {...rest}
    >
      {children}
    </MarkdownRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Markdown;
