// TODO: consolidate this component w/ AIAnalysisContent

import cx from "classnames";
import { memo, useMemo } from "react";

import {
  Markdown,
  type MarkdownProps,
} from "metabase/common/components/Markdown";
import { parseMetabaseProtocolLink } from "metabase/metabot/utils/links";

import S from "./AIMarkdown.module.css";
import { InternalLink } from "./components/InternalLink";
import { MarkdownSmartLink } from "./components/MarkdownSmartLink";

type AIMarkdownProps = MarkdownProps & {
  onInternalLinkClick?: (link: string) => void;
};

const splitMessageLinesAsParagraphs = (message: string) =>
  message.replaceAll(/\r?\n|\r/g, "\n\n");

const getComponents = ({
  onInternalLinkClick,
}: Pick<AIMarkdownProps, "onInternalLinkClick">) => ({
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
    const parsed = parseMetabaseProtocolLink(node.properties.href);
    if (parsed) {
      return (
        <MarkdownSmartLink
          onInternalLinkClick={onInternalLinkClick}
          name={String(node.children?.[0]?.value ?? "")}
          {...parsed}
        />
      );
    }

    if (href?.startsWith("/")) {
      return (
        <InternalLink onInternalLinkClick={onInternalLinkClick} href={href}>
          {children}
        </InternalLink>
      );
    }

    // For external links, set target and rel explicitly
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
});

export const AIMarkdown = memo(
  ({ className, onInternalLinkClick, children, ...props }: AIMarkdownProps) => {
    const components = useMemo(
      () => getComponents({ onInternalLinkClick }),
      [onInternalLinkClick],
    );

    const normalizedChildren = useMemo(
      () => splitMessageLinesAsParagraphs(children),
      [children],
    );

    return (
      <Markdown
        className={cx(S.aiMarkdown, className)}
        components={components}
        {...props}
      >
        {normalizedChildren}
      </Markdown>
    );
  },
);

AIMarkdown.displayName = "AIMarkdown";
