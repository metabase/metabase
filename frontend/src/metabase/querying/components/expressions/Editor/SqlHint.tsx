import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import {
  EXPRESSION_SQL_FIXES_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import { Box, Button, Code, Flex, Icon, Loader, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { GenerateExpressionResult } from "../GenerateExpressionPrompt/use-generate-expression";

import S from "./Errors/Errors.module.css";
import {
  type SqlFix,
  applyAllSqlFixes,
  applySqlFixes,
  getSqlFixes,
  looksLikeSql,
} from "./sql-hints";

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
  const [hasFixes] = usePrototypeSetting(EXPRESSION_SQL_FIXES_SETTING);
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
    () => (isActive && hasFixes ? getSqlFixes(source, columnNames) : []),
    [isActive, hasFixes, source, columnNames],
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
    <Flex direction="column" gap="xs" w="100%" className={S.sqlHint}>
      <Flex gap="sm" align="flex-start">
        <Icon name="warning" className={cx(S.icon, S.noteIcon)} />
        <Text lh="1.4">
          {isSql
            ? t`This looks like SQL. Custom expressions use their own formula language, like a spreadsheet: [Column] for columns and functions like isNull([Column]).`
            : t`Some parts look like SQL, which custom expressions do not use.`}{" "}
          {showMetabaseLinks && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className={S.link}
            >{t`Learn the syntax`}</a>
          )}
        </Text>
      </Flex>
      {fixes.slice(0, MAX_SHOWN_FIXES).map((fix, index) => (
        <FixRow
          key={index}
          fix={fix}
          onApply={() => applySource(applySqlFixes(source, [fix]))}
        />
      ))}
      <Flex gap="sm" pl="lg">
        {hasMoreFixes && (
          <Button
            size="compact-sm"
            variant="default"
            onClick={() => applySource(allFixed)}
          >{t`Apply all fixes`}</Button>
        )}
        <Button
          size="compact-sm"
          variant="subtle"
          leftSection={
            isConverting ? <Loader size="xs" /> : <Icon name="metabot" />
          }
          disabled={isConverting}
          onClick={handleConvert}
        >{t`Convert with AI`}</Button>
      </Flex>
      {refusal?.source === source && (
        <Text fz="sm" c="text-secondary" pl="lg">
          {refusal.message}
        </Text>
      )}
    </Flex>
  );
}

function FixRow({ fix, onApply }: { fix: SqlFix; onApply: () => void }) {
  return (
    <Flex gap="sm" align="center" pl="lg" wrap="wrap">
      <Code className={S.code}>{fix.original}</Code>
      <Icon name="arrow_right" size={12} />
      <Code className={S.code}>{fix.replacement}</Code>
      <Box>
        <Button size="compact-sm" variant="subtle" onClick={onApply}>
          {t`Apply`}
        </Button>
      </Box>
    </Flex>
  );
}
