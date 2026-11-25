import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import * as Lib from "metabase-lib";

import { ErrorText } from "./Errors";
import S from "./SqlHint.module.css";
import { getSqlFixes, looksLikeSql } from "./sql-hints";
import type { GenerateExpressionResult } from "./use-generate-expression";

const CONVERT_PROMPT =
  "The current expression is SQL, or uses syntax from SQL or another language. Convert it to a custom expression with the same result. " +
  "Use the columns from the column list. When a part cannot be converted, return a message that says which part and why.";

/**
 * A note for the error bar, instead of the error, when the expression uses
 * syntax from SQL or another language: one line on the syntax of custom
 * expressions, and "Fix with AI", which proposes a conversion as a diff.
 * `isFixing` is true while the AI works on it.
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
}) {
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
  // Syntax from another language that we know how to fix, like `==`.
  const hasForeignSyntax = useMemo(
    () => isActive && getSqlFixes(source, columnNames).length > 0,
    [isActive, source, columnNames],
  );

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

  if (!isActive || (!isSql && !hasForeignSyntax)) {
    return { hint: null, isFixing: false };
  }

  // The AI couldn't convert this text: its reason replaces "Fix with AI".
  const refusalMessage =
    refusal?.source === source ? refusal.message : undefined;

  const hint = (
    <>
      <ErrorText
        text={
          isSql
            ? t`Custom expressions use their own syntax: \`[Column]\` for columns, and functions like \`isNull([Column])\`.`
            : t`Some parts use syntax from other languages, which custom expressions don't support.`
        }
      />{" "}
      {isConverting ? (
        <span className={S.fixing}>{t`Fixing with AI…`}</span>
      ) : refusalMessage != null ? (
        <ErrorText text={refusalMessage} />
      ) : (
        <button type="button" className={S.fixWithAi} onClick={handleConvert}>
          {t`Fix with AI`}
        </button>
      )}
    </>
  );
  return { hint, isFixing: isConverting };
}
