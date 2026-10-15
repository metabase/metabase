import { useMemo } from "react";
import { msgid, ngettext } from "ttag";

import { useMetadataProvider } from "metabase/metadata-store";
import { FilterPanelPopover } from "metabase/querying/filters/components/FilterPanel/FilterPanelPopover";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { Flex, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import {
  type AnalysisFilters,
  type CohortFilter,
  readFilterQuery,
  withFilterQuery,
} from "../filters";
import type { Grain } from "../spec/types";

export const getCountLabel = (grain: Grain, count: number): string => {
  const formatted = count.toLocaleString();
  switch (grain) {
    case "person":
      return ngettext(msgid`${formatted} person`, `${formatted} people`, count);
    case "session":
      return ngettext(
        msgid`${formatted} session`,
        `${formatted} sessions`,
        count,
      );
    case "event":
      return ngettext(msgid`${formatted} event`, `${formatted} events`, count);
  }
};

type FilterPillsProps = {
  value: AnalysisFilters;
  table: Table | undefined;
  /** Read-only pills shown after the filters, e.g. the date range. */
  extraLabels?: string[];
  /** Omit for pills that can't be changed. */
  onChange?: (value: AnalysisFilters) => void;
};

/** A pill per filter, like the query builder's filter panel. */
export const FilterPills = ({
  value,
  table,
  extraLabels = [],
  onChange,
}: FilterPillsProps) => {
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const query = useMemo(
    () => readFilterQuery(metadataProvider, value),
    [metadataProvider, value],
  );
  const items = useMemo(() => (query ? getFilterItems(query) : []), [query]);

  if (
    value.cohorts.length === 0 &&
    items.length === 0 &&
    extraLabels.length === 0
  ) {
    return null;
  }

  const removeCohort = (cohort: CohortFilter) =>
    onChange?.({
      ...value,
      cohorts: value.cohorts.filter((other) => other !== cohort),
    });

  return (
    <Flex align="center" wrap="wrap" gap="sm" data-testid="analysis-filters">
      {value.cohorts.map((cohort, index) => (
        <Tooltip
          key={index}
          label={getCountLabel(cohort.grain, cohort.ids.length)}
          disabled={cohort.ids.length === 0}
        >
          <FilterPill
            readOnly={onChange === undefined}
            onRemoveClick={() => removeCohort(cohort)}
          >
            {cohort.label}
          </FilterPill>
        </Tooltip>
      ))}
      {query &&
        items.map(({ filter, filterIndex, stageIndex }, index) =>
          onChange ? (
            <FilterPanelPopover
              key={index}
              query={query}
              stageIndex={stageIndex}
              filter={filter}
              filterIndex={filterIndex}
              onChange={(newQuery) =>
                onChange(withFilterQuery(value, newQuery))
              }
            />
          ) : (
            <FilterPill key={index} readOnly>
              {Lib.displayInfo(query, stageIndex, filter).displayName}
            </FilterPill>
          ),
        )}
      {extraLabels.map((label) => (
        <FilterPill key={label} readOnly>
          {label}
        </FilterPill>
      ))}
    </Flex>
  );
};
