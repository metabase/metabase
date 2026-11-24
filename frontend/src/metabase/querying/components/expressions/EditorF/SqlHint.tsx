import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { Icon, Loader } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./SqlHint.module.css";
import {
  type SqlFix,
  applyAllSqlFixes,
  applySqlFixes,
  getSqlFixes,
  looksLikeSql,
} from "./sql-hints";
import type { GenerateExpressionResult } from "./use-generate-expression";

const MAX_SHOWN_FIXES = 3;

const CONVERT_PROMPT =
  "The current expression is SQL, or uses SQL syntax. Convert it to a custom expression with the same result. " +
  "Use the columns from the column list. When a part cannot be converted, return a message that says which part and why.";

/**
 * A note for the error bar when the expression looks like SQL: what language
 * custom expressions use, fixes for SQL constructions, and a conversion with
 * the AI.
 */
export function useSqlHint({
  hasError,
  source,
  query,
  stageIndex,
  availableColumns,
  isEnabled,
  generate,
  proposeSource,
  applySource,
}: {
  hasError: boolean;
  source: string;
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  isEnabled: boolean;
  generate: (request: {
    prompt: string;
    source: string;
  }) => Promise<GenerateExpressionResult | null>;
  proposeSource: (source: string, name?: string) => void;
  /** Writes the text at once, without a diff. */
  applySource: (source: string) => void;
}) {
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    "questions/query-builder/expressions",
  );
  const [isConverting, setIsConverting] = useState(false);
  const [refusal, setRefusal] = useState<{ source: string; message: string }>();

  const columnNames = useMemo(
    () =>
      availableColumns.map(
        (column) => Lib.displayInfo(query, stageIndex, column).longDisplayName,
      ),
    [query, stageIndex, availableColumns],
  );

  const isActive = isEnabled && hasError;
  const isSql = useMemo(
    () => isActive && looksLikeSql(source),
    [isActive, source],
  );
  const fixes = useMemo(
    () => (isActive ? getSqlFixes(source, columnNames) : []),
    [isActive, source, columnNames],
  );
  // All fixes, round after round: a fix of a CASE leaves fixes in its parts
  // for the next round.
  const allFixed = useMemo(
    () => (fixes.length > 0 ? applyAllSqlFixes(source, columnNames) : source),
    [fixes, source, columnNames],
  );
  const hasMoreFixes =
    fixes.length > 1 || allFixed !== applySqlFixes(source, fixes);

  const handleConvert = useCallback(async () => {
    setIsConverting(true);
    const result = await generate({ prompt: CONVERT_PROMPT, source });
    setIsConverting(false);
    if (result == null) {
      return;
    }
    if ("message" in result) {
      setRefusal({ source, message: result.message });
    } else {
      proposeSource(result.expression, result.name);
    }
  }, [generate, source, proposeSource]);

  if (!isActive || (!isSql && fixes.length === 0)) {
    return null;
  }

  return (
    <>
      <span className={S.title}>{t`Looks like SQL`}</span>
      <div className={S.body}>
        <span>
          {isSql
            ? t`Custom expressions use their own syntax: [Column] for columns, and functions like isNull([Column]).`
            : t`Some parts use SQL syntax, which custom expressions do not support.`}
          {showMetabaseLinks && (
            <>
              {" "}
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                className={S.link}
              >{t`Learn the syntax`}</a>
            </>
          )}
        </span>
        {fixes.slice(0, MAX_SHOWN_FIXES).map((fix, index) => (
          <FixRow
            key={index}
            fix={fix}
            onApply={() => applySource(applySqlFixes(source, [fix]))}
          />
        ))}
        <div className={S.actions}>
          {hasMoreFixes && (
            <button
              type="button"
              className={S.action}
              onClick={() => applySource(allFixed)}
            >{t`Apply all fixes`}</button>
          )}
          <button
            type="button"
            className={S.action}
            disabled={isConverting}
            onClick={handleConvert}
          >
            {isConverting ? (
              <Loader size={12} />
            ) : (
              <Icon name="metabot" size={12} />
            )}
            {t`Convert with AI`}
          </button>
        </div>
        {refusal?.source === source && (
          <span className={S.refusal}>{refusal.message}</span>
        )}
      </div>
    </>
  );
}

function FixRow({ fix, onApply }: { fix: SqlFix; onApply: () => void }) {
  return (
    <div className={S.fix}>
      <code className={S.code}>{fix.original}</code>
      <Icon name="arrow_right" size={12} className={S.arrow} />
      <code className={S.code}>{fix.replacement}</code>
      <button type="button" className={S.action} onClick={onApply}>
        {t`Apply`}
      </button>
    </div>
  );
}
