import cx from "classnames";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetDatabaseQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  EXPRESSION_DEBUGGER_DISPLAY_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import { diagnoseAndCompile, format } from "metabase/querying/expressions";
import { ActionIcon, Flex, Icon, Loader, Slider, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database, RowValue } from "metabase-types/api";

import { AnimatedStepCode, LEAVE_DURATION } from "./AnimatedStepCode";
import S from "./ExpressionDebugger.module.css";
import {
  type EvalNode,
  type Segment,
  type Step,
  getSteps,
  getValueNodes,
  parseEvalTree,
  renderStep,
} from "./steps";

type ExpressionDebuggerProps = {
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  availableColumns: Lib.ColumnMetadata[];
  clause: Lib.ExpressionClause;
  /** The text of `clause`, until the formatted text is ready. */
  source: string;
  /** The primary key of the row to evaluate the expression on. */
  rowKey: RowValue;
  onClose: () => void;
};

/**
 * The evaluation of the expression on one row, step by step: first the values
 * of the columns, then each operation, with real values from the database.
 */
export function ExpressionDebugger({
  query,
  stageIndex,
  expressionIndex,
  availableColumns,
  clause,
  source: originalSource,
  rowKey,
  onClose,
}: ExpressionDebuggerProps) {
  // The steps show the expression formatted like the format button does, also
  // when the user wrote it on one line.
  const source = useFormattedSource({
    query,
    stageIndex,
    availableColumns,
    clause,
    source: originalSource,
  });
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  const [display] = usePrototypeSetting(EXPRESSION_DEBUGGER_DISPLAY_SETTING);
  const root = useMemo(
    () => (source != null ? parseEvalTree(source) : null),
    [source],
  );

  // Each valid edit saves the expression, which gives a new `query`. Build the
  // query only for a new text or row, so that it does not run again.
  const latestRef = useRef({
    query,
    stageIndex,
    expressionIndex,
    availableColumns,
  });
  latestRef.current = { query, stageIndex, expressionIndex, availableColumns };
  const debugQuery = useMemo(() => {
    if (root == null || database == null || source == null) {
      return null;
    }
    return getDebugQuery({
      ...latestRef.current,
      database,
      source,
      root,
      rowKey,
    });
  }, [root, database, source, rowKey]);

  const { data, error, isFetching } = useGetAdhocQueryQuery(
    debugQuery ? Lib.toJsQuery(debugQuery.query) : skipToken,
  );

  const values = useMemo(() => {
    const row = data?.data?.rows?.[0];
    const cols = data?.data?.cols;
    if (row == null || cols == null || debugQuery == null) {
      return null;
    }
    const values = new Map<number, RowValue>();
    for (const [id, name] of debugQuery.names) {
      const index = cols.findIndex((col) => col.display_name === name);
      if (index >= 0) {
        values.set(id, row[index]);
      }
    }
    return values;
  }, [data, debugQuery]);

  const steps = useMemo(
    () => (root && values ? getSteps(root, values) : null),
    [root, values],
  );

  const errorMessage =
    error != null || data?.error != null
      ? getErrorMessage(error ?? data?.error, t`Could not evaluate the row`)
      : data != null && data.data?.rows?.length === 0
        ? t`The row is not there any more.`
        : null;

  return (
    <div className={S.debugger} data-testid="expression-debugger">
      <Flex align="center" gap="xs" mb="sm">
        <Text fw="bold" fz="sm">
          {t`Evaluation of row ${String(rowKey)}`}
        </Text>
        {isFetching && <Loader size="xs" ml="xs" />}
        <ActionIcon
          ml="auto"
          aria-label={t`Close evaluation`}
          onClick={onClose}
        >
          <Icon name="close" />
        </ActionIcon>
      </Flex>
      {errorMessage != null ? (
        <Text c="feedback-negative" fz="sm">
          {errorMessage}
        </Text>
      ) : source == null ? (
        <Loader size="sm" />
      ) : root == null ? (
        <Text c="text-secondary" fz="sm">
          {t`This expression can't be evaluated step by step.`}
        </Text>
      ) : steps == null || values == null ? (
        <Loader size="sm" />
      ) : display === "list" ? (
        <ol className={S.steps}>
          {steps.map((step, index) => (
            <li key={index} className={S.step}>
              <span className={S.stepNumber}>{getStepLabel(steps, index)}</span>
              <StepCode
                source={source}
                root={root}
                step={step}
                values={values}
              />
            </li>
          ))}
        </ol>
      ) : (
        <Stepper source={source} root={root} steps={steps} values={values} />
      )}
    </div>
  );
}

/** The text of the expression, formatted on several lines when it is long. */
function useFormattedSource({
  query,
  stageIndex,
  availableColumns,
  clause,
  source,
}: {
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  clause: Lib.ExpressionClause;
  source: string;
}) {
  const [formatted, setFormatted] = useState<{
    clause: Lib.ExpressionClause;
    text: string;
  } | null>(null);
  const latestRef = useRef({ query, stageIndex, availableColumns, source });
  latestRef.current = { query, stageIndex, availableColumns, source };

  useEffect(() => {
    let isCancelled = false;
    const { query, stageIndex, availableColumns, source } = latestRef.current;
    format(clause, {
      query,
      stageIndex,
      availableColumns,
      printWidth: 55, // the same as the format button
    })
      .catch(() => source)
      .then((text) => {
        if (!isCancelled) {
          setFormatted({ clause, text });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [clause]);

  return formatted?.clause === clause ? formatted.text : null;
}

type StepProps = {
  source: string;
  root: EvalNode;
  values: Map<number, RowValue>;
};

/** The code of the expression at one step. */
function StepCode({ source, root, step, values }: StepProps & { step: Step }) {
  return (
    <code className={S.code}>
      {groupNext(renderStep(source, root, step, values)).map(
        (group, groupIndex) =>
          group.isNext ? (
            <span key={groupIndex} className={S.next}>
              {group.segments.map(renderSegment)}
            </span>
          ) : (
            group.segments.map(renderSegment)
          ),
      )}
    </code>
  );
}

/** One step at a time, with buttons and a slider to move between steps. */
function Stepper({
  source,
  root,
  steps,
  values,
}: StepProps & { steps: Step[] }) {
  const [index, setIndex] = useState(0);
  // The step that the code shows. It follows `index` after the text that
  // changes fades out, so that the old and the new text don't take space at
  // the same time.
  const [shownIndex, setShownIndex] = useState(0);
  const [leavingKeys, setLeavingKeys] = useState<Set<string>>(new Set());
  const [hasMoved, setHasMoved] = useState(false);
  // The code only grows, so that the controls do not jump when a step is
  // shorter.
  const [minHeight, setMinHeight] = useState(0);
  const codeRef = useRef<HTMLDivElement>(null);
  // New steps, for a new expression or row, start from the beginning and
  // show at once: a new key for the code drops its animations. The values of
  // a new row can come after the row changes, so this follows the steps.
  const [shownSteps, setShownSteps] = useState(steps);
  const [codeKey, setCodeKey] = useState(0);
  if (steps !== shownSteps) {
    setShownSteps(steps);
    setCodeKey((key) => key + 1);
    setIndex(0);
    setShownIndex(0);
    setLeavingKeys(new Set());
    setHasMoved(false);
    setMinHeight(0);
  }
  const last = steps.length - 1;
  const current = Math.min(index, last);
  const shown = Math.min(shownIndex, last);
  const getSegments = useCallback(
    (stepIndex: number) => renderStep(source, root, steps[stepIndex], values),
    [source, root, steps, values],
  );
  const segments = useMemo(() => getSegments(shown), [getSegments, shown]);

  useEffect(() => {
    if (current === shown) {
      return;
    }
    const nextKeys = new Set(getSegments(current).map(({ key }) => key));
    setLeavingKeys(
      new Set(
        segments.map(({ key }) => key).filter((key) => !nextKeys.has(key)),
      ),
    );
    const timeout = setTimeout(() => {
      setLeavingKeys(new Set());
      setHasMoved(true);
      setShownIndex(current);
    }, LEAVE_DURATION);
    return () => clearTimeout(timeout);
  }, [current, shown, segments, getSegments]);
  useLayoutEffect(() => {
    const height = codeRef.current?.scrollHeight ?? 0;
    setMinHeight((minHeight) => Math.max(minHeight, height));
  }, [segments]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setIndex(Math.max(0, current - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setIndex(Math.min(last, current + 1));
    }
  };

  return (
    // Left and right arrows move between steps.
    <div className={S.stepper} tabIndex={0} onKeyDown={handleKeyDown}>
      <div ref={codeRef} className={S.stepperCode} style={{ minHeight }}>
        <AnimatedStepCode
          key={codeKey}
          segments={segments}
          leavingKeys={leavingKeys}
          animateEnter={hasMoved}
        />
      </div>
      <Flex align="center" gap="sm">
        <ActionIcon
          aria-label={t`Previous step`}
          disabled={current === 0}
          onClick={() => setIndex(current - 1)}
        >
          <Icon name="chevronleft" />
        </ActionIcon>
        <Slider
          // About 32px for a step, so that a few steps take little space.
          w={Math.min(steps.length * 32, 320)}
          min={0}
          max={last}
          step={1}
          value={current}
          label={null}
          onChange={setIndex}
          aria-label={t`Step`}
        />
        <ActionIcon
          aria-label={t`Next step`}
          disabled={current === last}
          onClick={() => setIndex(current + 1)}
        >
          <Icon name="chevronright" />
        </ActionIcon>
        <Text className={S.stepperLabel} fz="sm" c="text-secondary">
          {current === 0
            ? getStepLabel(steps, 0)
            : t`Step ${current} of ${last}`}
        </Text>
      </Flex>
    </div>
  );
}

function getStepLabel(steps: Step[], index: number) {
  if (index > 0) {
    return String(index);
  }
  return steps[0].evaluated.size > 0 ? t`Values` : t`Code`;
}

function renderSegment(segment: Segment, index: number) {
  return (
    <span key={index}>
      {segment.columnName != null && (
        <span className={S.columnLabel}>{segment.columnName}</span>
      )}
      {renderSegmentText(segment)}
    </span>
  );
}

function renderSegmentText(segment: Segment) {
  return (
    <span
      className={cx({
        [S.value]: segment.isValue,
        [S.result]: segment.isResult,
        [S.null]: segment.isValue && segment.text === "null",
      })}
    >
      {segment.text}
    </span>
  );
}

/** Puts the text of the part that the next step evaluates in one group. */
function groupNext(segments: Segment[]) {
  const groups: { isNext: boolean; segments: Segment[] }[] = [];
  for (const segment of segments) {
    const isNext = Boolean(segment.isNext);
    const last = groups.at(-1);
    if (last != null && last.isNext === isNext) {
      last.segments.push(segment);
    } else {
      groups.push({ isNext, segments: [segment] });
    }
  }
  return groups;
}

/**
 * A query for one row with a custom column for each part of the expression,
 * so that the database gives the value of each step.
 */
function getDebugQuery({
  query,
  stageIndex,
  expressionIndex,
  availableColumns,
  database,
  source,
  root,
  rowKey,
}: {
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  availableColumns: Lib.ColumnMetadata[];
  database: Database;
  source: string;
  root: EvalNode;
  rowKey: RowValue;
}) {
  // The rows before this custom column, like the preview uses.
  const base =
    expressionIndex == null
      ? Lib.previewQuery(query, stageIndex, "expressions", null)
      : expressionIndex === 0
        ? Lib.previewQuery(query, stageIndex, "joins", null)
        : Lib.previewQuery(
            query,
            stageIndex,
            "expressions",
            expressionIndex - 1,
          );
  if (base == null || rowKey == null) {
    return null;
  }
  const primaryKey = Lib.filterableColumns(base, stageIndex).find((column) => {
    const info = Lib.displayInfo(base, stageIndex, column);
    return (
      Lib.isPrimaryKey(column) && !info.isFromJoin && !info.isImplicitlyJoinable
    );
  });
  if (
    primaryKey == null ||
    typeof rowKey === "boolean" ||
    typeof rowKey === "object"
  ) {
    return null;
  }

  let debugQuery = Lib.filter(
    base,
    stageIndex,
    Lib.expressionClause("=", [primaryKey, rowKey]),
  );
  const names = new Map<number, string>();
  for (const node of getValueNodes(root)) {
    // A part that is not an expression on its own, like a segment, has no
    // step.
    const { expressionClause, error } = diagnoseAndCompile({
      source: source.slice(node.from, node.to),
      expressionMode: "expression",
      query,
      stageIndex,
      expressionIndex,
      database,
      availableColumns,
    });
    if (error != null || expressionClause == null) {
      continue;
    }
    const name = `__step_${node.id}`;
    try {
      debugQuery = Lib.expression(
        debugQuery,
        stageIndex,
        name,
        expressionClause,
      );
      names.set(node.id, name);
    } catch {
      // The same: no step for this part.
    }
  }
  debugQuery = Lib.limit(debugQuery, stageIndex, 1);
  return { query: debugQuery, names };
}
