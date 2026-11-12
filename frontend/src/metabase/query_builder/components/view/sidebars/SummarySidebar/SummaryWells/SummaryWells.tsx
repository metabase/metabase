import { useMemo } from "react";
import { t } from "ttag";

import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { SummaryGeneratedExpression } from "metabase-types/api";

import type { SummaryFormulaInput } from "../SummaryFormulaBar";
import S from "../SummarySidebar.module.css";
import type {
  SummaryDragItem,
  SummaryField,
  SummaryFieldSection,
  SummaryQueryChangeOptions,
  SummaryWellId,
} from "../types";
import {
  canDropOnWell,
  getDimensionItems,
  getValueItems,
  getWellFieldSections,
} from "../utils";

import { DimensionChip } from "./DimensionChip";
import {
  DraftFormulaChip,
  type DraftFormulaChipProps,
} from "./DraftFormulaChip";
import { SummaryWell, type WellDropState } from "./SummaryWell";
import { SummaryWellInput } from "./SummaryWellInput";
import { ValueChip } from "./ValueChip";

const NO_GENERATED_EXPRESSIONS: SummaryGeneratedExpression[] = [];

type SummaryWellsProps = {
  query: Lib.Query;
  stageIndex: number;
  sections: SummaryFieldSection[];
  generatedExpressions?: SummaryGeneratedExpression[];
  formulaInputs?: Partial<Record<SummaryWellId, SummaryFormulaInput>>;
  draftFormula?: (DraftFormulaChipProps & { wellId: SummaryWellId }) | null;
  draggedItem: SummaryDragItem | null;
  onPick: (wellId: SummaryWellId, field: SummaryField) => void;
  onChange: (nextQuery: Lib.Query, options?: SummaryQueryChangeOptions) => void;
};

export function SummaryWells({
  query,
  stageIndex,
  sections,
  generatedExpressions = NO_GENERATED_EXPRESSIONS,
  formulaInputs,
  draftFormula,
  draggedItem,
  onPick,
  onChange,
}: SummaryWellsProps) {
  const valueItems = useMemo(
    () => getValueItems(query, stageIndex),
    [query, stageIndex],
  );
  const dimensionItems = useMemo(
    () => getDimensionItems(query, stageIndex),
    [query, stageIndex],
  );
  const valueSections = useMemo(
    () => getWellFieldSections(sections, "values"),
    [sections],
  );
  const columnSections = useMemo(
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
    return { values: getDropState("values"), columns: getDropState("columns") };
  }, [query, stageIndex, draggedItem]);

  return (
    <Box className={S.wells} data-testid="summary-wells">
      <SummaryWell
        wellId="values"
        title={t`Summarize by`}
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
              onChange={onChange}
              onRemove={() => handleRemove(item.clause)}
            />
          ))}
          {draftFormula?.wellId === "values" && (
            <DraftFormulaChip {...draftFormula} />
          )}
        </SummaryWellInput>
      </SummaryWell>
      <SummaryWell
        wellId="columns"
        title={t`Group by`}
        dropState={dropStates?.columns ?? null}
      >
        <SummaryWellInput
          wellId="columns"
          formulaInput={formulaInputs?.columns}
          sections={columnSections}
          hasItems={dimensionItems.length > 0}
          onPick={(field) => onPick("columns", field)}
          onRemoveLast={() => {
            const lastItem = dimensionItems.at(-1);
            if (lastItem) {
              handleRemove(lastItem.clause);
            }
          }}
        >
          {dimensionItems.map((item) => (
            <DimensionChip
              key={item.key}
              query={query}
              stageIndex={stageIndex}
              item={item}
              generatedExpressions={generatedExpressions}
              onChange={onChange}
              onRemove={() => handleRemove(item.clause)}
            />
          ))}
          {draftFormula?.wellId === "columns" && (
            <DraftFormulaChip {...draftFormula} />
          )}
        </SummaryWellInput>
      </SummaryWell>
    </Box>
  );
}
