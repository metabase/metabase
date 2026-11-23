import type * as Lib from "metabase-lib";

import type { GeneratedBreakout } from "../../../components/expressions/EditorF/api";

export type InlineExpressionEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
  reportTimezone?: string;
  readOnly?: boolean;

  /** Absent while the pill is a draft */
  clause?: Lib.Expressionable;
  /** Absent while the pill is a draft */
  name?: string;
  /** True when a commit with a name can rename the column without asking. */
  hasDefaultName: boolean;

  /** `forceName` renames the column even when the user named it. */
  onCommit: (
    clause: Lib.ExpressionClause,
    name?: string,
    options?: { forceName?: boolean },
  ) => void;
  initialSource?: string;
  /** A function to start with, from the list of the picker. */
  initialExpressionClause?: Lib.DefinedClauseName | null;
  /** The current group-by columns of an aggregation, for the AI. */
  breakouts?: string[];
  /** Called with the group-by columns of an accepted AI suggestion. */
  onAcceptBreakouts?: (breakouts: GeneratedBreakout[]) => void;
  onSourceChange?: (source: string, isValid: boolean) => void;

  onDone: () => void;
  onDiscard: () => void;
};
