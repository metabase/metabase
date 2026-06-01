// TODO: consolidate this component w/ AIAnalysisContent

import cx from "classnames";
import { type ComponentPropsWithoutRef, memo, useMemo } from "react";

import {
  Markdown,
  type MarkdownProps,
} from "metabase/common/components/Markdown";
import { parseMetabaseProtocolLink } from "metabase/metabot/utils/links";
import { b64url_to_utf8 } from "metabase/utils/encoding";

import type { DataPointMentionTarget } from "../MetabotChat/data-point-mentions";

import S from "./AIMarkdown.module.css";
import { InternalLink } from "./components/InternalLink";
import { MarkdownSmartLink } from "./components/MarkdownSmartLink";

type AIMarkdownProps = MarkdownProps & {
  onInternalLinkClick?: (link: string) => void;
  singleNewlinesAreParagraphs?: boolean;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
};

const parseDataPointLink = (
  href: string | undefined,
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>,
) => {
  const numericMatch = href?.match(/^metabase:\/\/data-point\/(\d+)$/);
  if (numericMatch) {
    return { id: Number(numericMatch[1]), model: "data-point" as const };
  }

  const targetMatch = href?.match(/^metabase:\/\/data-point\/([^/?#]+)$/);
  if (!targetMatch) {
    return null;
  }

  const dataPointId = targetMatch[1];
  const target = dataPointTargets?.[dataPointId];
  if (target) {
    return { id: dataPointId, model: "data-point" as const, target };
  }

  try {
    return {
      model: "data-point" as const,
      target: JSON.parse(b64url_to_utf8(targetMatch[1])),
    };
  } catch {
    return null;
  }
};

const splitMessageLinesAsParagraphs = (message: string) =>
  message.replaceAll(/\r?\n|\r/g, "\n\n");

const getComponents = ({
  onInternalLinkClick,
  dataPointTargets,
}: Pick<AIMarkdownProps, "onInternalLinkClick" | "dataPointTargets">) => ({
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
    const parsed =
      parseDataPointLink(node.properties.href, dataPointTargets) ??
      parseMetabaseProtocolLink(node.properties.href);
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
  table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className={S.tableWrapper}>
      <div className={S.tableContainer}>
        <table {...props}>{children}</table>
      </div>
    </div>
  ),
});

export const AIMarkdown = memo(
  ({
    className,
    onInternalLinkClick,
    dataPointTargets,
    children,
    singleNewlinesAreParagraphs = false,
    ...props
  }: AIMarkdownProps) => {
    const components = useMemo(
      () => getComponents({ onInternalLinkClick, dataPointTargets }),
      [onInternalLinkClick, dataPointTargets],
    );

    const normalizedChildren = useMemo(
      () =>
        singleNewlinesAreParagraphs
          ? splitMessageLinesAsParagraphs(children)
          : children,
      [children, singleNewlinesAreParagraphs],
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
