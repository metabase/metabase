import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { diagnoseAndCompile } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryExpression,
} from "../../../components/view/SummarySidebar/types";
import type { SeedFormula } from "../types";

import S from "./SeedControls.module.css";

// how long a row says "Added" after a click, so repeated clicks each get feedback
const ADDED_FEEDBACK_MS = 1200;
const ADD_ALL_KEY = "add-all";

type CompiledSeed =
  | { formula: SeedFormula; expression: SummaryExpression; error: null }
  | { formula: SeedFormula; expression: null; error: string };

function compileSeed(
  base: SummaryBase,
  database: Database,
  formula: SeedFormula,
): CompiledSeed {
  const { error, expressionClause } = diagnoseAndCompile({
    source: formula.source,
    expressionMode: "aggregation",
    query: base.query,
    stageIndex: base.stageIndex,
    database,
    availableColumns: Lib.aggregableColumns(base.query, base.stageIndex),
    availableMetrics: Lib.availableMetrics(base.query, base.stageIndex),
  });
  if (error != null || expressionClause == null) {
    return {
      formula,
      expression: null,
      error: error?.message ?? t`This formula doesn't compile.`,
    };
  }
  return {
    formula,
    expression: { name: formula.name, clause: expressionClause },
    error: null,
  };
}

type SeedControlsProps = {
  /** The query the summary is built on; formulas compile against it. */
  base: SummaryBase;
  formulas: readonly SeedFormula[];
  onSeed: (expressions: SummaryExpression[]) => void;
};

/**
 * Hardcoded custom aggregations for the current data source, floating in the bottom-left corner in
 * the variant switcher's style. The button opens a list; every click on a formula adds it to the
 * summary's values and leaves the list open, and a click outside (or Esc) closes it. Formulas that
 * don't compile against the source are disabled, with the error as their hint.
 */
export function SeedControls({ base, formulas, onSeed }: SeedControlsProps) {
  const databaseId = Lib.databaseID(base.query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const seeds = useMemo(
    () =>
      database != null
        ? formulas.map((formula) => compileSeed(base, database, formula))
        : [],
    [base, database, formulas],
  );
  const expressions = seeds.flatMap((seed) =>
    seed.expression != null ? [seed.expression] : [],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [addedKey, setAddedKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const addedTimeoutRef = useRef<number | undefined>();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => () => window.clearTimeout(addedTimeoutRef.current), []);

  const handleAdd = (key: string, added: SummaryExpression[]) => {
    onSeed(added);
    setAddedKey(key);
    window.clearTimeout(addedTimeoutRef.current);
    addedTimeoutRef.current = window.setTimeout(
      () => setAddedKey(null),
      ADDED_FEEDBACK_MS,
    );
  };

  return (
    <div ref={rootRef} className={S["seed-picker"]}>
      <div
        className={S["seed-picker-popover"]}
        role="menu"
        aria-label={t`Example formulas`}
        aria-hidden={!isOpen}
        data-open={isOpen ? "" : undefined}
        data-testid="prototype-examples"
      >
        {formulas.length === 0 ? (
          <p className={S["seed-picker-empty"]}>
            {t`No examples for this data. They cover the Sample Database tables.`}
          </p>
        ) : (
          <ul className={S["seed-picker-list"]}>
            {seeds.map(({ formula, expression, error }) => (
              <li key={formula.name}>
                <button
                  type="button"
                  role="menuitem"
                  className={S["seed-picker-option"]}
                  title={error ?? formula.description}
                  disabled={expression == null}
                  tabIndex={isOpen ? 0 : -1}
                  data-added={addedKey === formula.name ? "" : undefined}
                  onClick={() =>
                    expression != null && handleAdd(formula.name, [expression])
                  }
                >
                  <span className={S["seed-picker-option-name"]}>
                    {formula.name}
                    <span className={S["seed-picker-added"]} aria-hidden>
                      {t`Added`}
                    </span>
                  </span>
                  <span className={S["seed-picker-option-source"]}>
                    {error ?? formula.source}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {expressions.length > 1 && (
          <>
            <div className={S["seed-picker-divider"]} />
            <button
              type="button"
              role="menuitem"
              className={S["seed-picker-option"]}
              tabIndex={isOpen ? 0 : -1}
              data-added={addedKey === ADD_ALL_KEY ? "" : undefined}
              onClick={() => handleAdd(ADD_ALL_KEY, expressions)}
            >
              <span className={S["seed-picker-option-name"]}>
                {t`Add all`}
                <span className={S["seed-picker-added"]} aria-hidden>
                  {t`Added`}
                </span>
              </span>
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        className={S["seed-picker-trigger"]}
        data-testid="prototype-examples-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-open={isOpen ? "" : undefined}
        onClick={() => setIsOpen(!isOpen)}
      >
        {t`Examples`}
        <span className={S["seed-picker-count"]}>{expressions.length}</span>
      </button>
    </div>
  );
}
