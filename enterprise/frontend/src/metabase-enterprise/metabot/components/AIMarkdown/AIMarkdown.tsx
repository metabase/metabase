// TODO: consolidate this component w/ AIAnalysisContent

import cx from "classnames";
import { memo } from "react";

import Link from "metabase/common/components/Link/Link";
import Markdown, {
  type MarkdownProps,
} from "metabase/common/components/Markdown";

import S from "./AIMarkdown.module.css";

const components = {
  a: ({
    href,
    children,
    node,
    ...rest
  }: {
    href?: string;
    children?: any;
    node?: any;
    [key: string]: any;
  }) => {
    if (href && href.startsWith("/")) {
      return (
        <Link to={href} variant="brand">
          {children}
        </Link>
      );
    }

    // For external links, set target and rel explicitly
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
};

export const AIMarkdown = memo(({ className, ...props }: MarkdownProps) => (
  <Markdown
    className={cx(S.aiMarkdown, className)}
    components={components}
    {...props}
  />
));
AIMarkdown.displayName = "AIMarkdown";
