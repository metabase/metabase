import cx from "classnames";
import { Fragment } from "react";
import { t } from "ttag";

import { Box, Text } from "metabase/ui";

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
import type { SummaryDefinition, SummaryWellId } from "./types";

type SentenceClause = {
  wellId: SummaryWellId;
  word: string;
  emptyPlaceholder: string;
};

/**
 * Prototype variant B: the summary reads as a sentence, "Show [values] by [groupings] split by [groupings]".
 * Splitting needs no mode to switch on: filling "split by" splits the values, and emptying it stops.
 */
export function SummarySentence({
  base,
  definition,
  itemLabels,
  draggedItem,
  valueFormats,
  onChange,
  onChangeValueFormat,
}: SummaryLayoutProps) {
  const database = useSummaryDatabase(base);
  const editing = useSummaryWellEditing(definition, onChange, {
    isColumnsVisible: true,
  });

  const clauses: SentenceClause[] = [
    {
      wellId: "values",
      word: t`Show`,
      emptyPlaceholder: t`What to calculate, like a sum`,
    },
    {
      wellId: "rows",
      word: t`by`,
      emptyPlaceholder: t`A column to group by`,
    },
    {
      wellId: "columns",
      word: t`split by`,
      emptyPlaceholder: t`Optional: a column to compare`,
    },
  ];
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

  return (
    <Box className={S.wells} data-testid="summary-wells">
      <Box className={cx(S.frame, S.frameList)}>
        {clauses.map(({ wellId, word, emptyPlaceholder }) => (
          <Fragment key={wellId}>
            <SummaryWell
              base={base}
              database={database}
              wellId={wellId}
              className={S.sentenceClause}
              caption={<Text className={S.sentenceWord}>{word}</Text>}
              emptyPlaceholder={emptyPlaceholder}
              definition={definition}
              isPivot={definition.isPivot}
              draggedItem={draggedItem}
              formulaWellId={editing.formulaWellId}
              onChange={onChange}
              onRemove={editing.handleRemove}
              onStartFormula={editing.handleStartFormula}
            >
              {wellId === "values" ? (
                <SummaryValueChips
                  {...chipProps}
                  valueFormats={valueFormats}
                  onChangeValueFormat={onChangeValueFormat}
                />
              ) : (
                <SummaryDimensionChips {...chipProps} wellId={wellId} />
              )}
            </SummaryWell>
            {editing.formulaWellId === wellId && (
              <SummaryWellFormulaRow
                base={base}
                database={database}
                definition={definition}
                editing={editing}
                caption={<Text className={S.sentenceWord}>{word}</Text>}
                onChange={onChange}
              />
            )}
          </Fragment>
        ))}
      </Box>
      <Text className={S.wellsHint}>{getSentenceHint(definition)}</Text>
    </Box>
  );
}

function getSentenceHint({ rows, columns, values }: SummaryDefinition) {
  if (rows.length === 0 && values.length === 0) {
    return t`Drag columns from below into the sentence, or type in it.`;
  }
  if (columns.length > 0) {
    return t`Split values show as a chart when one fits, or as a pivot table.`;
  }
  return t`Use “split by” to compare each group across another column.`;
}
