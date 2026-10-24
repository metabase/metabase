import cx from "classnames";

import { Box } from "metabase/ui";

import S from "./SummarySidebar.module.css";
import {
  SummaryDimensionChips,
  type SummaryLayoutProps,
  SummaryValueChips,
  SummaryWell,
  SummaryWellFormulaRow,
  useSummaryDatabase,
  useSummaryWellEditing,
} from "./SummaryWells";
import type { SummaryWellId } from "./types";

/**
 * Prototype variant C: Group by and Values stacked under the columns they're dragged down from.
 * Pivoting opens Columns between them, and renames Group by to Rows.
 */
export function SummaryStack({
  base,
  definition,
  itemLabels,
  draggedItem,
  valueFormats,
  onChange,
  onChangeValueFormat,
}: SummaryLayoutProps) {
  const database = useSummaryDatabase(base);
  const { isPivot } = definition;
  const editing = useSummaryWellEditing(definition, onChange, {
    isColumnsVisible: isPivot,
  });
  const wellProps = {
    base,
    database,
    definition,
    isPivot,
    draggedItem,
    formulaWellId: editing.formulaWellId,
    onChange,
    onRemove: editing.handleRemove,
    onStartFormula: editing.handleStartFormula,
  };
  const chipProps = {
    base,
    database,
    definition,
    itemLabels,
    editingItemId: editing.editingItemId,
    onChange,
    onEditFormula: editing.handleEditFormula,
    onRemove: editing.handleRemove,
  };
  const formulaRowFor = (wellId: SummaryWellId) =>
    editing.formulaWellId === wellId && (
      <SummaryWellFormulaRow
        base={base}
        database={database}
        definition={definition}
        editing={editing}
        caption={null}
        onChange={onChange}
      />
    );

  return (
    <Box className={cx(S.wells, S.wellsAtBottom)} data-testid="summary-wells">
      <Box className={cx(S.frame, S.frameList)}>
        <SummaryWell {...wellProps} wellId="rows">
          <SummaryDimensionChips {...chipProps} wellId="rows" />
        </SummaryWell>
        {formulaRowFor("rows")}
        <Box className={cx(S.collapse, { [S.collapseIsOpen]: isPivot })}>
          <Box className={S.collapseContent}>
            <SummaryWell
              {...wellProps}
              wellId="columns"
              className={S.frameListDivided}
              isDisabled={!isPivot}
            >
              <SummaryDimensionChips {...chipProps} wellId="columns" />
            </SummaryWell>
          </Box>
        </Box>
        {formulaRowFor("columns")}
        <SummaryWell {...wellProps} wellId="values">
          <SummaryValueChips
            {...chipProps}
            valueFormats={valueFormats}
            onChangeValueFormat={onChangeValueFormat}
          />
        </SummaryWell>
        {formulaRowFor("values")}
      </Box>
    </Box>
  );
}
