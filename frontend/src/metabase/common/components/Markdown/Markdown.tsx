import cx from "classnames";
import type {
  AnchorHTMLAttributes,
  CSSProperties,
  ComponentPropsWithRef,
} from "react";
import { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ColorName } from "metabase/ui/colors/types";
import { color } from "metabase/ui/utils/colors";
import { DATA_IMAGE_URI_PATTERN } from "metabase/visualizations/lib/utils";

import S from "./Markdown.module.css";

const REMARK_PLUGINS = [remarkGfm];

const MarkdownLink = (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a {...props} target="_blank" rel="noopener noreferrer" />
);

type MarkdownCssVariables = CSSProperties & {
  "--markdown-color"?: string;
  "--markdown-line-clamp"?: number;
};

function urlTransform(url: string): string {
  if (url.startsWith("metabase://")) {
    return url;
  }
  if (DATA_IMAGE_URI_PATTERN.test(url)) {
    return url;
  }
  return defaultUrlTransform(url);
}

export interface MarkdownProps extends ComponentPropsWithRef<
  typeof ReactMarkdown
> {
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
  lineClamp,
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

  const style: MarkdownCssVariables = {
    "--markdown-color": c ? color(c) : undefined,
    "--markdown-line-clamp": lineClamp,
  };

  return (
    <div
      className={cx(S.markdownRoot, { [S.lineClamp]: lineClamp }, className)}
      style={style}
      data-dark={dark || undefined}
      data-unstyle-links={unstyleLinks || undefined}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={urlTransform}
        components={customizedComponents}
        {...additionalOptions}
        {...rest}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};
