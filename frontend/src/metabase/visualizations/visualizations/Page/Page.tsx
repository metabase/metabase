import cx from "classnames";
import { useState } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { isEmpty } from "metabase/lib/validate";
import type { VisualizationProps } from "metabase/visualizations/types";

import S from "./Page.module.css";
import { substituteColumnsInTemplate } from "./utils";

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS: Options["rehypePlugins"] = [
  [rehypeExternalLinks, { rel: ["noreferrer"], target: "_blank" }],
];

export function Page({
  data,
  settings,
  className,
}: Pick<VisualizationProps, "data" | "settings" | "className">) {
  const template: string = settings["page.template"] ?? "";
  const { cols, rows } = data;

  const [currentRowIndex, setCurrentRowIndex] = useState(0);

  const safeRowIndex = Math.min(currentRowIndex, rows.length - 1);
  const currentRow = rows[safeRowIndex] ?? [];

  const hasTemplate = !isEmpty(template);

  const content = hasTemplate
    ? substituteColumnsInTemplate(template, cols, currentRow, settings)
    : "";

  const hasPagination = rows.length > 1;

  return (
    <div className={cx(S.container, className)}>
      <div className={S.markdownWrapper}>
        {hasTemplate ? (
          <ReactMarkdown
            className={cx(CS.full, "text-card-markdown")}
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
          >
            {content}
          </ReactMarkdown>
        ) : (
          <span className={cx(CS.textMedium, S.placeholder)}>
            {t`Add a template in the visualization settings using {{Column Name}}`}
          </span>
        )}
      </div>

      {hasPagination && (
        <div className={S.pagination}>
          <button
            className={S.paginationButton}
            disabled={safeRowIndex === 0}
            onClick={() => setCurrentRowIndex(i => Math.max(0, i - 1))}
            aria-label={t`Previous row`}
          >
            ‹
          </button>
          <span className={S.paginationLabel}>
            {safeRowIndex + 1} / {rows.length}
          </span>
          <button
            className={S.paginationButton}
            disabled={safeRowIndex >= rows.length - 1}
            onClick={() =>
              setCurrentRowIndex(i => Math.min(rows.length - 1, i + 1))
            }
            aria-label={t`Next row`}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
