import type { AnchorHTMLAttributes, ComponentPropsWithRef } from "react";
import { useMemo } from "react";
import type ReactMarkdown from "react-markdown";
import { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ColorName } from "metabase/lib/colors/types";

import { MarkdownRoot } from "./Markdown.styled";

const REMARK_PLUGINS = [remarkGfm];

const MarkdownLink = (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a {...props} target="_blank" rel="noopener noreferrer" />
);

function urlTransform(url: string): string {
  if (url.startsWith("metabase://")) {
    return url;
  }
  return defaultUrlTransform(url);
}

export interface MarkdownProps
  extends ComponentPropsWithRef<typeof ReactMarkdown> {
  className?: string;
  dark?: boolean;
  disallowHeading?: boolean;
  unstyleLinks?: boolean;
  children: string;
  lineClamp?: number;
  c?: ColorName;
  components?: Record<string, any>;
}

export const Markdown = ({
  className,
  children = "",
  dark,
  disallowHeading = false,
  unstyleLinks = false,
  c,
  components,
  ...rest
}: MarkdownProps): JSX.Element => {
  const additionalOptions = {
    ...(disallowHeading && {
      disallowedElements: ["h1", "h2", "h3", "h4", "h5", "h6"],
      unwrapDisallowed: true,
    }),
  };

  const customizedComponents = useMemo(
    () => ({ a: MarkdownLink, ...components }),
    [components],
  );

  return (
    <MarkdownRoot
      className={className}
      dark={dark}
      remarkPlugins={REMARK_PLUGINS}
      urlTransform={urlTransform}
      unstyleLinks={unstyleLinks}
      c={c}
      components={customizedComponents}
      {...additionalOptions}
      {...rest}
    >
      {children}
    </MarkdownRoot>
  );
};
