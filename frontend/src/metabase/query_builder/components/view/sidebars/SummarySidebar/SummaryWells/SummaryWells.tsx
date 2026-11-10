import { useMemo } from "react";
import { t } from "ttag";

import { Box, Ellipsified } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "../SummarySidebar.module.css";
import type {
  SummaryDragItem,
  SummaryField,
  SummaryFieldSection,
  SummaryWellId,
} from "../types";
import {
  canDropOnWell,
  changeDimensionBucket,
  getDimensionItems,
  getValueItems,
  getWellFieldSections,
} from "../utils";

import { DimensionBucketMenu } from "./DimensionBucketMenu";
import { SummaryWell, type WellDropState } from "./SummaryWell";
import { SummaryWellInput } from "./SummaryWellInput";
import { ValueChip } from "./ValueChip";
import { WellChip } from "./WellChip";

type SummaryWellsProps = {
  query: Lib.Query;
  stageIndex: number;
  sections: SummaryFieldSection[];
  draggedItem: SummaryDragItem | null;
  onPick: (wellId: SummaryWellId, field: SummaryField) => void;
  onChange: (nextQuery: Lib.Query) => void;
};

export function SummaryWells({
  query,
  stageIndex,
  sections,
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
        </SummaryWellInput>
      </SummaryWell>
      <SummaryWell
        wellId="columns"
        title={t`Group by`}
        dropState={dropStates?.columns ?? null}
      >
        <SummaryWellInput
          wellId="columns"
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
            <WellChip
              key={item.key}
              drag={{ kind: "dimension", item }}
              onRemove={() => handleRemove(item.clause)}
            >
              {item.bucketOptions.length > 0 ? (
                <DimensionBucketMenu
                  item={item}
                  onSelect={(option) =>
                    onChange(
                      changeDimensionBucket(query, stageIndex, item, option),
                    )
                  }
                />
              ) : (
                <Ellipsified fw="inherit">{item.label}</Ellipsified>
              )}
            </WellChip>
          ))}
        </SummaryWellInput>
      </SummaryWell>
    </Box>
  );
}
