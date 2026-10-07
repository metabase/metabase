import cx from "classnames";
import type {
  AnchorHTMLAttributes,
  CSSProperties,
  ComponentPropsWithRef,
  TableHTMLAttributes,
} from "react";
import { useMemo } from "react";
import ReactMarkdown, {
  type Components,
  type ExtraProps,
  defaultUrlTransform,
} from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ColorName } from "metabase/ui/colors/types";
import { color } from "metabase/ui/utils/colors";
import { DATA_IMAGE_URI_PATTERN } from "metabase/viz-core";

import S from "./Markdown.module.css";

const REMARK_PLUGINS = [remarkGfm];

const MarkdownLink = (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a {...props} target="_blank" rel="noopener noreferrer" />
);

const MarkdownTable = ({
  node,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & ExtraProps) => (
  <div className={S.tableScroll}>
    <table {...props} />
  </div>
);

const HEADINGS_AS_PARAGRAPHS: Components = {
  h1: "p",
  h2: "p",
  h3: "p",
  h4: "p",
  h5: "p",
  h6: "p",
};

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
  compact?: boolean;
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
  compact = false,
  c,
  lineClamp,
  components,
  ...rest
}: MarkdownProps): JSX.Element => {
  const customizedComponents = useMemo(
    () => ({
      a: MarkdownLink,
      table: MarkdownTable,
      ...(disallowHeading && HEADINGS_AS_PARAGRAPHS),
      ...components,
    }),
    [components, disallowHeading],
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
      data-compact={compact || undefined}
      data-custom-code={!!components?.code || undefined}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={urlTransform}
        components={customizedComponents}
        {...rest}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};
