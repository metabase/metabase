import { useId, useMemo, useState } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import type { ContentTranslationFunction } from "metabase/content-translation/types";
import { ActionIcon, Box, Button, Flex, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { UpdateQueryHookProps } from "../../../../hooks/types";

import { SummaryFieldList } from "./SummaryFieldList";
import { useSummaryFormulaBar } from "./SummaryFormulaBar";
import S from "./SummarySidebar.module.css";
import { SummaryWells } from "./SummaryWells";
import type { SummaryField, SummaryFieldSection, SummaryWellId } from "./types";
import {
  addField,
  areQueriesEqual,
  clearWell,
  getFieldSections,
  replaceWellWithField,
} from "./utils";

type SummarySidebarProps = UpdateQueryHookProps;

function translateSections(
  sections: SummaryFieldSection[],
  tc: ContentTranslationFunction,
): SummaryFieldSection[] {
  return sections.map((section) => ({
    ...section,
    name: tc(section.name),
    items: section.items.map((item) => ({ ...item, name: tc(item.name) })),
  }));
}

function getFieldWellId(field: SummaryField): SummaryWellId {
  return field.kind === "column" ? "columns" : "values";
}

export function SummarySidebar({
  query,
  onQueryChange,
  stageIndex,
}: SummarySidebarProps) {
  const tc = useTranslateContent();
  const sections = useMemo(
    () => translateSections(getFieldSections(query, stageIndex), tc),
    [query, stageIndex, tc],
  );
  const hasItems =
    Lib.aggregations(query, stageIndex).length > 0 ||
    Lib.breakouts(query, stageIndex).length > 0;

  const handleWellAdd = (nextQuery: Lib.Query, wellId: SummaryWellId) => {
    const isGroupingWithoutValues =
      wellId === "columns" &&
      Lib.aggregations(nextQuery, stageIndex).length === 0;
    const nextSummary = isGroupingWithoutValues
      ? Lib.aggregateByCount(nextQuery, stageIndex)
      : nextQuery;
    if (!areQueriesEqual(query, nextSummary)) {
      onQueryChange(nextSummary);
    }
  };

  const { bar, formulaInputs } = useSummaryFormulaBar({
    query,
    stageIndex,
    onAdd: handleWellAdd,
  });

  const handleAdd = (wellId: SummaryWellId, field: SummaryField) =>
    handleWellAdd(addField(query, stageIndex, wellId, field), wellId);

  const handleFieldSelect = (field: SummaryField) => {
    const wellId = getFieldWellId(field);
    handleWellAdd(
      replaceWellWithField(query, stageIndex, wellId, field),
      wellId,
    );
  };

  const handleClearAll = () =>
    onQueryChange(
      clearWell(clearWell(query, stageIndex, "columns"), stageIndex, "values"),
    );

  const [isFieldListOpen, setIsFieldListOpen] = useState(true);
  const fieldListDrawerId = useId();
  const fieldListToggleLabel = isFieldListOpen
    ? t`Hide fields`
    : t`Show fields`;

  return (
    <Box className={S.sidebar} data-testid="summary-sidebar">
      {bar}
      <Box className={S.wellsColumn}>
        <SummaryWells
          query={query}
          stageIndex={stageIndex}
          sections={sections}
          formulaInputs={formulaInputs}
          onPick={handleAdd}
          onChange={onQueryChange}
        />
        <Flex className={S.wellsFooter} align="center" justify="space-between">
          <Button
            variant="subtle"
            size="compact-sm"
            disabled={!hasItems}
            onClick={handleClearAll}
          >
            {t`Clear all`}
          </Button>
          <Tooltip label={fieldListToggleLabel}>
            <ActionIcon
              variant="subtle"
              aria-label={fieldListToggleLabel}
              aria-expanded={isFieldListOpen}
              aria-controls={fieldListDrawerId}
              onClick={() => setIsFieldListOpen(!isFieldListOpen)}
            >
              <Icon
                name={isFieldListOpen ? "sidebar_open" : "sidebar_closed"}
              />
            </ActionIcon>
          </Tooltip>
        </Flex>
      </Box>
      <Box
        id={fieldListDrawerId}
        className={S.fieldListDrawer}
        data-open={isFieldListOpen || undefined}
        data-testid="summary-field-list-drawer"
      >
        <SummaryFieldList
          sections={sections}
          onSelect={handleFieldSelect}
          onAdd={(field) => handleAdd(getFieldWellId(field), field)}
        />
      </Box>
    </Box>
  );
}
