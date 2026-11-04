import { useId, useMemo, useState } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import type { ContentTranslationFunction } from "metabase/content-translation/types";
import { ActionIcon, Box, Button, Flex, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { UpdateQueryHookProps } from "../../../../hooks/types";
import { useDefaultQueryAggregation } from "../../../../hooks/use-default-query-aggregation";

import { SummaryFieldList } from "./SummaryFieldList";
import S from "./SummarySidebar.module.css";
import { SummaryWells } from "./SummaryWells";
import type { SummaryField, SummaryFieldSection, SummaryWellId } from "./types";
import {
  addField,
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

/**
 * The summary sidebar: Summarize by and Group by wells on the left, and on the right a drawer
 * with the fields to build them from, which slides out of the panel when hidden. A bare query
 * starts from Count of rows, which runs once something joins it, or once it's picked itself.
 */
export function SummarySidebar({
  query: initialQuery,
  onQueryChange,
  stageIndex,
}: SummarySidebarProps) {
  const tc = useTranslateContent();
  const { query, hasDefaultAggregation, onUpdateQuery, onAggregationChange } =
    useDefaultQueryAggregation({
      query: initialQuery,
      onQueryChange,
      stageIndex,
    });
  const sections = useMemo(
    () => translateSections(getFieldSections(query, stageIndex), tc),
    [query, stageIndex, tc],
  );
  const hasItems =
    Lib.aggregations(query, stageIndex).length > 0 ||
    Lib.breakouts(query, stageIndex).length > 0;

  const handleChange = (nextQuery: Lib.Query, wellId: SummaryWellId) => {
    if (wellId === "values") {
      onAggregationChange(nextQuery);
    } else {
      onUpdateQuery(nextQuery);
    }
  };

  const handleAdd = (wellId: SummaryWellId, field: SummaryField) => {
    const nextQuery = addField(query, stageIndex, wellId, field);
    // picking Count of rows while the starting count waits is how it gets run; any other
    // pick that changes nothing, like a metric that's already there, shouldn't rerun the question
    const isStartingCountPicked =
      field.kind === "count" && hasDefaultAggregation;
    if (nextQuery !== query || isStartingCountPicked) {
      handleChange(nextQuery, wellId);
    }
  };

  const handleFieldSelect = (field: SummaryField) => {
    const wellId = getFieldWellId(field);
    handleChange(
      replaceWellWithField(query, stageIndex, wellId, field),
      wellId,
    );
  };

  const handleClearAll = () =>
    onAggregationChange(
      clearWell(clearWell(query, stageIndex, "columns"), stageIndex, "values"),
    );

  const [isFieldListOpen, setIsFieldListOpen] = useState(true);
  const fieldListDrawerId = useId();
  const fieldListToggleLabel = isFieldListOpen
    ? t`Hide fields`
    : t`Show fields`;

  return (
    <Box className={S.sidebar} data-testid="summary-sidebar">
      <Box className={S.wellsColumn}>
        <SummaryWells
          query={query}
          stageIndex={stageIndex}
          sections={sections}
          onPick={handleAdd}
          onChange={handleChange}
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
