import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { DraggableField } from "./SummaryFieldList";
import { SummaryFormulaEditor } from "./SummaryFormulaEditor";
import S from "./SummarySidebar.module.css";
import { canWriteWellFormula } from "./SummaryWellInput";
import { useSummaryDatabase } from "./SummaryWells";
import type { SummaryBase, SummaryExpression } from "./types";
import { findExpressionColumn, getItemKey } from "./utils";

/** The helper column being written: a new one, or the one at `index`. */
type HelperColumnDraft = { type: "new" } | { type: "edit"; index: number };

type SummaryHelperColumnsProps = {
  /** The base with the helper columns added, so each can be found, and used by the next. */
  base: SummaryBase;
  helperColumns: SummaryExpression[];
  onAdd: (expression: SummaryExpression) => void;
  onUpdate: (index: number, expression: SummaryExpression) => void;
  onRemove: (index: number) => void;
};

/**
 * Prototype variant C: spreadsheet-style helper columns, calculated from the other columns and
 * listed with them, so they can be grouped by or summarized like any column.
 */
export function SummaryHelperColumns({
  base,
  helperColumns,
  onAdd,
  onUpdate,
  onRemove,
}: SummaryHelperColumnsProps) {
  const database = useSummaryDatabase(base);
  const [draft, setDraft] = useState<HelperColumnDraft | null>(null);
  const columns = useHelperColumnMetadata(base, helperColumns);

  if (!canWriteWellFormula(database, "rows")) {
    return null;
  }

  const handleSubmit = (expression: SummaryExpression) => {
    if (draft?.type === "edit") {
      onUpdate(draft.index, expression);
    } else {
      onAdd(expression);
    }
    setDraft(null);
  };

  const editedColumn =
    draft?.type === "edit" ? helperColumns[draft.index] : null;

  return (
    <Box mb="sm" data-testid="summary-helper-columns">
      <Flex align="center" justify="space-between">
        <Text className={S.fieldGroupName}>{t`Helper columns`}</Text>
        {helperColumns.length > 0 && (
          <Tooltip label={t`Add a helper column`}>
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={t`Add a helper column`}
              onClick={() => setDraft({ type: "new" })}
            >
              <Icon name="add" size={12} />
            </ActionIcon>
          </Tooltip>
        )}
      </Flex>
      {helperColumns.map((helperColumn, index) => {
        const column = columns[index];
        if (
          column == null ||
          (draft?.type === "edit" && draft.index === index)
        ) {
          return null;
        }
        return (
          <DraggableField
            key={helperColumn.name}
            id={`summary-column:${getItemKey(base, column)}`}
            icon="function"
            item={{ kind: "column", column, label: helperColumn.name }}
            actions={
              <>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={t`Edit ${helperColumn.name}`}
                  onClick={() => setDraft({ type: "edit", index })}
                >
                  <Icon name="pencil" size={12} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={t`Remove ${helperColumn.name}`}
                  onClick={() => onRemove(index)}
                >
                  <Icon name="close" size={12} />
                </ActionIcon>
              </>
            }
          />
        );
      })}
      {draft != null && (
        <Box py="xs">
          <SummaryFormulaEditor
            key={draft.type === "edit" ? draft.index : "new"}
            base={base}
            database={database}
            expressionMode="expression"
            initialClause={editedColumn?.clause}
            initialName={editedColumn?.name}
            placeholder={t`Calculate from other columns, like [Total] - [Tax]`}
            submitLabel={draft.type === "edit" ? t`Update` : t`Add`}
            onSubmit={handleSubmit}
            onCancel={() => setDraft(null)}
          />
        </Box>
      )}
      {helperColumns.length === 0 && draft == null && (
        <UnstyledButton
          className={S.helperColumnsEmpty}
          onClick={() => setDraft({ type: "new" })}
        >
          <Icon name="add" size={12} />
          <Box>
            <Text fw="bold" c="inherit">{t`Add a helper column`}</Text>
            <Text size="sm" c="text-secondary">
              {t`Calculate a new column from the others, then group by it or summarize it.`}
            </Text>
          </Box>
        </UnstyledButton>
      )}
    </Box>
  );
}

/** The column each helper column adds to the base, or `null` when it can't be grouped by. */
function useHelperColumnMetadata(
  base: SummaryBase,
  helperColumns: SummaryExpression[],
): (Lib.ColumnMetadata | null)[] {
  return useMemo(() => {
    const { query, stageIndex } = base;
    const breakoutableColumns = Lib.breakoutableColumns(query, stageIndex);
    return helperColumns.map(({ name }) =>
      findExpressionColumn(query, stageIndex, breakoutableColumns, name),
    );
  }, [base, helperColumns]);
}

/** The keys of the helper columns, to leave them out of the regular column sections. */
export function useHelperColumnKeys(
  base: SummaryBase,
  helperColumns: SummaryExpression[],
): ReadonlySet<string> {
  const columns = useHelperColumnMetadata(base, helperColumns);
  return useMemo(
    () =>
      new Set(
        columns.flatMap((column) =>
          column != null ? [getItemKey(base, column)] : [],
        ),
      ),
    [base, columns],
  );
}
