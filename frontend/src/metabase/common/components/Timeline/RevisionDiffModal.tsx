import { useState } from "react";
import { t } from "ttag";

import { Box, Modal, Text } from "metabase/ui";
import type { Revision, RevisionDiff } from "metabase-types/api";
import { isCardOrDashboardRevisionDiff } from "metabase-types/guards";

import S from "./RevisionDiffModal.module.css";

// ---------------------------------------------------------------------------
// Diff algorithm (pure, no external libraries)
// Implements LCS-based line diff, outputs side-by-side row pairs.
// ---------------------------------------------------------------------------

interface DiffSideCell {
  lineNumber: number;
  content: string;
  type: "unchanged" | "removed" | "added";
}

interface DiffRow {
  left: DiffSideCell | null;
  right: DiffSideCell | null;
}

// ---------------------------------------------------------------------------
// SQL detection helpers
// ---------------------------------------------------------------------------

interface LegacyNativeDatasetQuery {
  type: "native";
  native: { query: string; [key: string]: unknown };
  [key: string]: unknown;
}

interface StagedNativeDatasetQuery {
  stages: [{ native: string; [key: string]: unknown }, ...unknown[]];
  [key: string]: unknown;
}

/** Returns true when a value is a legacy native (SQL) DatasetQuery object. */
function isLegacyNativeDatasetQuery(
  value: unknown,
): value is LegacyNativeDatasetQuery {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>)["type"] === "native" &&
    typeof (value as LegacyNativeDatasetQuery).native?.query === "string"
  );
}

/** Returns true when a value is an MBQL-5 staged native DatasetQuery object. */
function isStagedNativeDatasetQuery(
  value: unknown,
): value is StagedNativeDatasetQuery {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const stages = (value as Record<string, unknown>)["stages"];
  return (
    Array.isArray(stages) &&
    stages.length > 0 &&
    typeof (stages[0] as Record<string, unknown>)["native"] === "string"
  );
}

/** Returns the raw SQL string from either DatasetQuery format, or null. */
function extractSql(value: unknown): string | null {
  if (isLegacyNativeDatasetQuery(value)) {
    return value.native.query;
  }
  if (isStagedNativeDatasetQuery(value)) {
    return (value.stages[0] as Record<string, unknown>)["native"] as string;
  }
  return null;
}

/**
 * Converts a revision field value to an array of display lines.
 *
 * Native DatasetQuery objects (both legacy and MBQL-5 stages format) have
 * their SQL extracted and split on real newlines so the diff shows readable
 * SQL rather than a JSON blob with escaped `\n` characters.
 * All other objects fall back to JSON.
 */
function valueToLines(value: unknown): string[] {
  if (value === null || value === undefined) {
    return ["(empty)"];
  }
  const sql = extractSql(value);
  if (sql !== null) {
    // Split on real newlines for readable line diffs.
    // JSON.stringify would escape `\n` → `\\n`, making multi-line SQL unreadable.
    return sql.length === 0 ? ["(empty)"] : sql.split("\n");
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2).split("\n");
  }
  return String(value).split("\n");
}

type EditOp =
  | { type: "unchanged"; content: string }
  | { type: "removed"; content: string }
  | { type: "added"; content: string };

/** Build an edit script from two line arrays using LCS backtracking. */
function buildEditScript(
  beforeLines: string[],
  afterLines: string[],
): EditOp[] {
  const m = beforeLines.length;
  const n = afterLines.length;

  // dp[i][j] = length of LCS of beforeLines[0..i-1] and afterLines[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        beforeLines[i - 1] === afterLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const ops: EditOp[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
      ops.unshift({ type: "unchanged", content: beforeLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: "added", content: afterLines[j - 1] });
      j--;
    } else {
      ops.unshift({ type: "removed", content: beforeLines[i - 1] });
      i--;
    }
  }

  return ops;
}

/**
 * Converts an edit script into side-by-side row pairs suitable for rendering.
 * Consecutive removed/added blocks are paired up horizontally.
 */
function toSideBySideRows(ops: EditOp[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let leftLineNum = 1;
  let rightLineNum = 1;
  let idx = 0;

  while (idx < ops.length) {
    const op = ops[idx];

    if (op.type === "unchanged") {
      rows.push({
        left: {
          lineNumber: leftLineNum++,
          content: op.content,
          type: "unchanged",
        },
        right: {
          lineNumber: rightLineNum++,
          content: op.content,
          type: "unchanged",
        },
      });
      idx++;
    } else {
      // Collect all adjacent removes then adds and pair them side-by-side
      const removed: string[] = [];
      const added: string[] = [];

      while (idx < ops.length && ops[idx].type === "removed") {
        removed.push(ops[idx].content);
        idx++;
      }
      while (idx < ops.length && ops[idx].type === "added") {
        added.push(ops[idx].content);
        idx++;
      }

      const maxLen = Math.max(removed.length, added.length);
      for (let k = 0; k < maxLen; k++) {
        rows.push({
          left:
            k < removed.length
              ? {
                  lineNumber: leftLineNum++,
                  content: removed[k],
                  type: "removed",
                }
              : null,
          right:
            k < added.length
              ? { lineNumber: rightLineNum++, content: added[k], type: "added" }
              : null,
        });
      }
    }
  }

  return rows;
}

function computeLineDiff(
  beforeLines: string[],
  afterLines: string[],
): DiffRow[] {
  return toSideBySideRows(buildEditScript(beforeLines, afterLines));
}

// ---------------------------------------------------------------------------
// Diff normalizer: converts either RevisionDiff variant into flat key/value pairs
// ---------------------------------------------------------------------------

interface NormalizedFieldDiff {
  key: string;
  beforeValue: unknown;
  afterValue: unknown;
}

function normalizeRevisionDiff(diff: RevisionDiff): NormalizedFieldDiff[] {
  if (isCardOrDashboardRevisionDiff(diff)) {
    const allKeys = Array.from(
      new Set([...Object.keys(diff.before), ...Object.keys(diff.after)]),
    );
    return allKeys.map((key) => ({
      key,
      beforeValue: diff.before[key],
      afterValue: diff.after[key],
    }));
  }
  // SegmentRevisionDiff: { name?: FieldDiff, description?: FieldDiff, definition?: FieldDiff }
  return Object.entries(diff).map(([key, fieldDiff]) => ({
    key,
    beforeValue: (fieldDiff as { before?: unknown } | undefined)?.before,
    afterValue: (fieldDiff as { after?: unknown } | undefined)?.after,
  }));
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function formatFieldName(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Returns the human-readable section header for a diff field, taking the
 * actual value into account so that native SQL queries are labelled
 * "SQL Query" rather than the raw key name ("Definition").
 */
function fieldDisplayName(
  key: string,
  beforeValue: unknown,
  afterValue: unknown,
): string {
  if (extractSql(beforeValue) !== null || extractSql(afterValue) !== null) {
    return t`SQL Query`;
  }
  return formatFieldName(key);
}

function rowClassName(
  type: "unchanged" | "removed" | "added" | "empty",
): string {
  if (type === "removed") {
    return `${S.diffRow} ${S.removedRow}`;
  }
  if (type === "added") {
    return `${S.diffRow} ${S.addedRow}`;
  }
  if (type === "empty") {
    return `${S.diffRow} ${S.emptyRow}`;
  }
  return `${S.diffRow} ${S.unchangedRow}`;
}

function lineSign(type: "unchanged" | "removed" | "added"): string {
  if (type === "removed") {
    return "-";
  }
  if (type === "added") {
    return "+";
  }
  return " ";
}

interface DiffPanelProps {
  rows: DiffRow[];
  side: "left" | "right";
}

function DiffPanel({ rows, side }: DiffPanelProps) {
  const isLeft = side === "left";
  return (
    <div className={S.panel}>
      <div
        className={`${S.panelHeader} ${isLeft ? S.panelHeaderBefore : S.panelHeaderAfter}`}
      >
        {isLeft ? t`Before` : t`After`}
      </div>
      <div className={S.panelContent}>
        {rows.map((row, idx) => {
          const cell = isLeft ? row.left : row.right;

          if (!cell) {
            return <div key={idx} className={rowClassName("empty")} />;
          }

          const { lineNumber, content, type } = cell;

          return (
            <div key={idx} className={rowClassName(type)}>
              <span className={S.lineNum}>{lineNumber}</span>
              <span className={S.lineSign}>{lineSign(type)}</span>
              <span className={S.lineContent}>{content}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface FieldDiffSectionProps {
  fieldKey: string;
  beforeValue: unknown;
  afterValue: unknown;
}

function FieldDiffSection({
  fieldKey,
  beforeValue,
  afterValue,
}: FieldDiffSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const beforeLines = valueToLines(beforeValue);
  const afterLines = valueToLines(afterValue);
  const rows = computeLineDiff(beforeLines, afterLines);

  const hasChanges = rows.some(
    (row) => row.left?.type === "removed" || row.right?.type === "added",
  );

  if (!hasChanges) {
    return null;
  }

  return (
    <div className={S.fieldSection}>
      <button
        className={S.fieldLabel}
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
      >
        <span>{fieldDisplayName(fieldKey, beforeValue, afterValue)}</span>
        <span
          className={`${S.chevron} ${isOpen ? S.chevronOpen : ""}`}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <div className={S.sideBySide}>
          <DiffPanel rows={rows} side="left" />
          <div className={S.panelDivider} />
          <DiffPanel rows={rows} side="right" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

interface RevisionDiffModalProps {
  revision: Revision;
  onClose: () => void;
}

export function RevisionDiffModal({
  revision,
  onClose,
}: RevisionDiffModalProps) {
  const { diff, user, timestamp, description } = revision;

  const date = new Date(timestamp).toLocaleString();

  const modalTitle = (
    <div>
      <Text fw={700} size="sm">
        {t`Changes by ${user.common_name}`}
      </Text>
      <Text size="xs" c="text-secondary">
        {description} &middot; {date}
      </Text>
    </div>
  );

  if (!diff) {
    return (
      <Modal opened onClose={onClose} title={modalTitle} size="lg">
        <Box p="md" className={S.noChanges}>
          <Text c="text-secondary">{t`No detailed diff available for this revision.`}</Text>
        </Box>
      </Modal>
    );
  }

  const normalizedFields = normalizeRevisionDiff(diff);

  return (
    <Modal
      opened
      onClose={onClose}
      title={modalTitle}
      size={1050}
      styles={{ body: { padding: 0 } }}
    >
      <Box className={S.modalBody}>
        {normalizedFields.length === 0 ? (
          <Box p="md" className={S.noChanges}>
            <Text c="text-secondary">{t`No field-level changes to display.`}</Text>
          </Box>
        ) : (
          normalizedFields.map(({ key, beforeValue, afterValue }) => (
            <FieldDiffSection
              key={key}
              fieldKey={key}
              beforeValue={beforeValue}
              afterValue={afterValue}
            />
          ))
        )}
      </Box>
    </Modal>
  );
}
