import { useMemo } from "react";
import { t } from "ttag";

import { Box } from "metabase/ui";
import { isEmpty } from "metabase/utils/validate";
import * as Lib from "metabase-lib";

import type {
  SummaryFormulaClause,
  SummaryFormulaInput,
} from "../SummaryFormulaBar";
import S from "../SummarySidebar.module.css";
import type {
  SummaryDimensionItem,
  SummaryDragItem,
  SummaryField,
  SummaryFieldSection,
  SummaryQueryChangeOptions,
  SummaryValueItem,
  SummaryWellId,
} from "../types";
import { canDropOnWell, getWellFieldSections } from "../utils";

import { DimensionChip } from "./DimensionChip";
import {
  DraftFormulaChip,
  type DraftFormulaChipProps,
} from "./DraftFormulaChip";
import { PivotDropZone } from "./PivotDropZone";
import { PivotToggle } from "./PivotToggle";
import { SummaryWell, type WellDropState } from "./SummaryWell";
import { SummaryWellInput } from "./SummaryWellInput";
import { ValueChip } from "./ValueChip";

type SummaryWellsProps = {
  query: Lib.Query;
  stageIndex: number;
  sections: SummaryFieldSection[];
  formulaInputs?: Partial<Record<SummaryWellId, SummaryFormulaInput>>;
  draftFormula?:
    | (DraftFormulaChipProps & { wellId: SummaryWellId; draftKey: number })
    | null;
  editingFormulaClause?: SummaryFormulaClause;
  draggedItem: SummaryDragItem | null;
  canPivot: boolean;
  isPivotMode: boolean;
  valueItems: SummaryValueItem[];
  columnItems: SummaryDimensionItem[];
  rowItems: SummaryDimensionItem[];
  onPivotToggle: () => void;
  onPick: (wellId: SummaryWellId, field: SummaryField) => void;
  onChange: (nextQuery: Lib.Query, options?: SummaryQueryChangeOptions) => void;
};

export function SummaryWells({
  query,
  stageIndex,
  sections,
  formulaInputs,
  draftFormula,
  editingFormulaClause,
  draggedItem,
  canPivot,
  isPivotMode,
  valueItems,
  columnItems,
  rowItems,
  onPivotToggle,
  onPick,
  onChange,
}: SummaryWellsProps) {
  const isEditing = (clause?: SummaryFormulaClause) =>
    !isEmpty(clause) &&
    !isEmpty(editingFormulaClause) &&
    Lib.isSameClause(clause, editingFormulaClause);
  const valueSections = useMemo(
    () => getWellFieldSections(sections, "values"),
    [sections],
  );
  const dimensionSections = useMemo(
    () => getWellFieldSections(sections, "columns"),
    [sections],
  );

  const handleRemove = (clause: Lib.AggregationClause | Lib.BreakoutClause) =>
    onChange(Lib.removeClause(query, stageIndex, clause));

  const dropStates = useMemo(() => {
    if (draggedItem == null) {
      return null;
    }
    const getDropState = (wellId: SummaryWellId): WellDropState =>
      canDropOnWell(query, stageIndex, draggedItem, wellId)
        ? "accepts"
        : "rejects";
    return {
      values: getDropState("values"),
      columns: getDropState("columns"),
      rows: getDropState("rows"),
    };
  }, [query, stageIndex, draggedItem]);

  return (
    <Box className={S.wells} data-testid="summary-wells">
      <SummaryWell
        wellId="values"
        title={isPivotMode ? t`Values` : t`Summarize by`}
        dropState={dropStates?.values ?? null}
      >
        <SummaryWellInput
          wellId="values"
          formulaInput={formulaInputs?.values}
          sections={valueSections}
          hasItems={valueItems.length > 0}
          autoFocus
          onPick={(field) => onPick("values", field)}
          onRemoveLast={() => {
            const lastItem = valueItems.at(-1);
            if (lastItem) {
              handleRemove(lastItem.clause);
            }
          }}
        >
          {valueItems.map((item) => (
            <ValueChip
              key={item.key}
              query={query}
              stageIndex={stageIndex}
              item={item}
              isEditing={isEditing(item.clause)}
              formulaInput={formulaInputs?.values}
              onChange={onChange}
              onRemove={() => handleRemove(item.clause)}
            />
          ))}
          {draftFormula?.wellId === "values" && (
            <DraftFormulaChip key={draftFormula.draftKey} {...draftFormula} />
          )}
        </SummaryWellInput>
      </SummaryWell>
      <SummaryWell
        wellId="columns"
        title={isPivotMode ? t`Columns` : t`Group by`}
        dropState={dropStates?.columns ?? null}
        action={
          canPivot && (
            <PivotToggle isPivotMode={isPivotMode} onToggle={onPivotToggle} />
          )
        }
      >
        <SummaryWellInput
          wellId="columns"
          formulaInput={formulaInputs?.columns}
          sections={dimensionSections}
          hasItems={columnItems.length > 0}
          onPick={(field) => onPick("columns", field)}
          onRemoveLast={() => {
            const lastItem = columnItems.at(-1);
            if (lastItem) {
              handleRemove(lastItem.clause);
            }
          }}
        >
          {columnItems.map((item) => (
            <DimensionChip
              key={item.key}
              query={query}
              stageIndex={stageIndex}
              wellId="columns"
              item={item}
              isEditing={isEditing(item.expression)}
              formulaInput={formulaInputs?.columns}
              onChange={onChange}
              onRemove={() => handleRemove(item.clause)}
            />
          ))}
          {draftFormula?.wellId === "columns" && (
            <DraftFormulaChip key={draftFormula.draftKey} {...draftFormula} />
          )}
        </SummaryWellInput>
      </SummaryWell>
      {isPivotMode && (
        <SummaryWell
          wellId="rows"
          title={t`Rows`}
          dropState={dropStates?.rows ?? null}
        >
          <SummaryWellInput
            wellId="rows"
            formulaInput={formulaInputs?.rows}
            sections={dimensionSections}
            hasItems={rowItems.length > 0}
            onPick={(field) => onPick("rows", field)}
            onRemoveLast={() => {
              const lastItem = rowItems.at(-1);
              if (lastItem) {
                handleRemove(lastItem.clause);
              }
            }}
          >
            {rowItems.map((item) => (
              <DimensionChip
                key={item.key}
                query={query}
                stageIndex={stageIndex}
                wellId="rows"
                item={item}
                isEditing={isEditing(item.expression)}
                formulaInput={formulaInputs?.rows}
                onChange={onChange}
                onRemove={() => handleRemove(item.clause)}
              />
            ))}
            {draftFormula?.wellId === "rows" && (
              <DraftFormulaChip key={draftFormula.draftKey} {...draftFormula} />
            )}
          </SummaryWellInput>
        </SummaryWell>
      )}
      {canPivot && !isPivotMode && (
        <PivotDropZone canDrop={dropStates?.rows === "accepts"} />
      )}
    </Box>
  );
}
