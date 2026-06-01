// TODO: consolidate this component w/ AIAnalysisContent

import cx from "classnames";
import { type ComponentPropsWithoutRef, memo, useMemo } from "react";

import {
  Markdown,
  type MarkdownProps,
} from "metabase/common/components/Markdown";
import { parseMetabaseProtocolLink } from "metabase/metabot/utils/links";
import { b64url_to_utf8 } from "metabase/utils/encoding";

import type {
  DataPointMentionTarget,
  DataSelection,
} from "../MetabotChat/data-point-mentions";

import S from "./AIMarkdown.module.css";
import { InternalLink } from "./components/InternalLink";
import { MarkdownSmartLink } from "./components/MarkdownSmartLink";

type AIMarkdownProps = MarkdownProps & {
  onInternalLinkClick?: (link: string) => void;
  singleNewlinesAreParagraphs?: boolean;
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
  dataSelections?: Record<string, DataSelection | undefined>;
};

// Apply a URL-supplied column index to a target, overriding which column the
// data point highlights. This lets a single per-row data point id link any cell
// in the row — a name, category, date, etc. — not just the value column.
const applyColumnIndex = (
  target: DataPointMentionTarget | undefined,
  columnIndex: number | undefined,
): DataPointMentionTarget | undefined =>
  target && columnIndex != null
    ? { ...target, value_column_index: columnIndex }
    : target;

const parseDataPointLink = (
  href: string | undefined,
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>,
) => {
  // Numeric range-mention ids never carry a column segment.
  const numericMatch = href?.match(/^metabase:\/\/data-point\/(\d+)$/);
  if (numericMatch) {
    return { id: Number(numericMatch[1]), model: "data-point" as const };
  }

  // Row data points: metabase://data-point/{id} or metabase://data-point/{id}/{columnIndex}.
  const targetMatch = href?.match(
    /^metabase:\/\/data-point\/([^/?#]+)(?:\/(\d+))?$/,
  );
  if (!targetMatch) {
    return null;
  }

  const dataPointId = targetMatch[1];
  const columnIndex =
    targetMatch[2] != null ? Number(targetMatch[2]) : undefined;

  const target = dataPointTargets?.[dataPointId];
  if (target) {
    return {
      id: dataPointId,
      model: "data-point" as const,
      target: applyColumnIndex(target, columnIndex),
    };
  }

  try {
    return {
      model: "data-point" as const,
      target: applyColumnIndex(
        JSON.parse(b64url_to_utf8(dataPointId)),
        columnIndex,
      ),
    };
  } catch {
    return null;
  }
};

const parseDataSelectionLink = (
  href: string | undefined,
  dataSelections?: Record<string, DataSelection | undefined>,
) => {
  const match = href?.match(/^metabase:\/\/data-selection\/([^/?#]+)$/);
  if (!match) {
    return null;
  }

  const selectionId = match[1];
  const selection = dataSelections?.[selectionId];
  if (selection?.targets) {
    return {
      id: selectionId,
      model: "data-selection" as const,
      targets: selection.targets,
    };
  }

  try {
    return {
      id: selectionId,
      model: "data-selection" as const,
      targets: JSON.parse(b64url_to_utf8(selectionId)),
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
  dataSelections,
}: Pick<
  AIMarkdownProps,
  "onInternalLinkClick" | "dataPointTargets" | "dataSelections"
>) => ({
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
      parseDataSelectionLink(node.properties.href, dataSelections) ??
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
    dataSelections,
    children,
    singleNewlinesAreParagraphs = false,
    ...props
  }: AIMarkdownProps) => {
    const components = useMemo(
      () =>
        getComponents({
          onInternalLinkClick,
          dataPointTargets,
          dataSelections,
        }),
      [onInternalLinkClick, dataPointTargets, dataSelections],
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
