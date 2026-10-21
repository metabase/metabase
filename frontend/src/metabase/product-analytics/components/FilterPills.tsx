import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { useMetadataProvider } from "metabase/metadata-store";
import { FilterPanelPopover } from "metabase/querying/filters/components/FilterPanel/FilterPanelPopover";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { Flex, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import {
  type AnalysisFilters,
  type CohortFilter,
  type PeopleFilter,
  readFilterQuery,
  withFilterQuery,
} from "../filters";
import type { Grain } from "../spec/types";

import { ConditionPill } from "./events/ConditionsEditor";

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

/** The filter query and its filters, read with the table's metadata. */
const useFilterItems = (value: AnalysisFilters, table: Table | undefined) => {
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const query = useMemo(
    () => readFilterQuery(metadataProvider, value),
    [metadataProvider, value],
  );
  const items = useMemo(() => (query ? getFilterItems(query) : []), [query]);
  return { query, items };
};

/** How many pills `FilterPills` shows for the filters, without extra labels. */
export const useFilterCount = (
  value: AnalysisFilters,
  table: Table | undefined,
): number => {
  const { items } = useFilterItems(value, table);
  return value.people.length + value.cohorts.length + items.length;
};

/** A pill per filter, like the query builder's filter panel. */
export const FilterPills = ({
  value,
  table,
  extraLabels = [],
  onChange,
}: FilterPillsProps) => {
  const { query, items } = useFilterItems(value, table);

  if (
    value.cohorts.length === 0 &&
    value.people.length === 0 &&
    items.length === 0 &&
    extraLabels.length === 0
  ) {
    return null;
  }

  const removePeople = (people: PeopleFilter) =>
    onChange?.({
      ...value,
      people: value.people.filter((other) => other.key !== people.key),
    });

  const removeCohort = (cohort: CohortFilter) =>
    onChange?.({
      ...value,
      cohorts: value.cohorts.filter((other) => other !== cohort),
    });

  return (
    <Flex align="center" wrap="wrap" gap="sm" data-testid="analysis-filters">
      {value.people.map((people) => (
        <FilterPill
          key={people.key}
          readOnly={onChange === undefined}
          onRemoveClick={() => removePeople(people)}
        >
          <Icon name="segment" size={12} />
          {t`People in ${people.label}`}
        </FilterPill>
      ))}
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
        items.map(({ filter, filterIndex, stageIndex }, index) => {
          const isSegment = Lib.isSegmentFilter(query, stageIndex, filter);
          if (onChange === undefined) {
            return (
              <FilterPill key={index} readOnly>
                {isSegment && <Icon name="segment" size={12} />}
                {Lib.displayInfo(query, stageIndex, filter).displayName}
              </FilterPill>
            );
          }
          const handleChange = (newQuery: Lib.Query) =>
            onChange(withFilterQuery(value, newQuery));
          // The shared popover pill can't carry the segment icon.
          return isSegment ? (
            <ConditionPill
              key={index}
              query={query}
              filter={filter}
              filterIndex={filterIndex}
              onChange={handleChange}
            />
          ) : (
            <FilterPanelPopover
              key={index}
              query={query}
              stageIndex={stageIndex}
              filter={filter}
              filterIndex={filterIndex}
              onChange={handleChange}
            />
          );
        })}
      {extraLabels.map((label) => (
        <FilterPill key={label} readOnly>
          {label}
        </FilterPill>
      ))}
    </Flex>
  );
};
