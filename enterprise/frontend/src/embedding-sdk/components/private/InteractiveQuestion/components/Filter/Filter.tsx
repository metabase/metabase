import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { match } from "ts-pattern";

import S from "embedding-sdk/components/private/InteractiveQuestion/components/Picker.module.css";
import { MultiStepPopover } from "embedding-sdk/components/private/util/MultiStepPopover";
import type { UpdateQueryHookProps } from "metabase/query_builder/hooks";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import type { FilterColumnPickerProps } from "metabase/querying/filters/components/FilterPicker/FilterColumnPicker";
import * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../../context";
import { BadgeList } from "../util/BadgeList";
import { ToolbarButton } from "../util/ToolbarButton";

const useFilterHandlers = ({
  query,
  stageIndex,
  onQueryChange,
}: UpdateQueryHookProps) => {
  const getFilterName = (filter: Lib.FilterClause) => {
    return Lib.displayInfo(query, stageIndex, filter).longDisplayName;
  };

  const onAddFilter = (filter: Lib.Filterable) => {
    const nextQuery = Lib.filter(query, stageIndex, filter);
    onQueryChange(nextQuery);
  };

  const onRemoveFilter = (filterClause: Lib.FilterClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, filterClause);
    onQueryChange(nextQuery);
  };

  const onUpdateFilter = (
    currentFilterClause: Lib.FilterClause,
    nextFilterClause: Lib.Filterable,
  ) => {
    const nextQuery = Lib.replaceClause(
      query,
      stageIndex,
      currentFilterClause,
      nextFilterClause,
    );
    onQueryChange(nextQuery);
  };

  return {
    getFilterName,
    onAddFilter,
    onRemoveFilter,
    onUpdateFilter,
  };
};

const FilterInner = ({
  query,
  onQueryChange,
  stageIndex,
  withColumnItemIcon,
  withColumnGroupIcon,
  withCustomExpression,
}: UpdateQueryHookProps &
  Pick<
    FilterColumnPickerProps,
    "withColumnItemIcon" | "withColumnGroupIcon" | "withCustomExpression"
  >) => {
  const { getFilterName, onAddFilter, onRemoveFilter, onUpdateFilter } =
    useFilterHandlers({ query, onQueryChange, stageIndex });

  const filters = useMemo(() => getFilterItems(query), [query]);

  const [step, setStep] = useState<"list" | "picker">("list");

  const [opened, { close, toggle }] = useDisclosure(false, {
    onOpen: () => {
      setStep(filters.length === 0 ? "picker" : "list");
    },
  });

  const [selectedFilter, setSelectedFilter] = useState<{
    filter?: Lib.FilterClause;
    filterIndex?: number;
  }>({});

  const onSelectFilter = (nextFilter: Lib.Filterable) => {
    if (selectedFilter.filter) {
      onUpdateFilter(selectedFilter.filter, nextFilter);
    } else {
      onAddFilter(nextFilter);
    }
  };

  const label = match(filters.length)
    .with(0, () => "Filter")
    .with(1, () => "1 filter")
    .otherwise(value => `${value} filters`);

  return (
    <MultiStepPopover currentStep={step} opened={opened} onClose={close}>
      <MultiStepPopover.Target>
        <ToolbarButton
          label={label}
          icon="filter"
          isHighlighted={filters.length > 0}
          onClick={toggle}
        />
      </MultiStepPopover.Target>

      <MultiStepPopover.Step value="list">
        <BadgeList
          addButtonLabel="Add filter"
          items={filters.map(filterItem => ({
            name: getFilterName(filterItem.filter),
            item: filterItem,
          }))}
          onAddItem={() => {
            setSelectedFilter({
              filter: undefined,
              filterIndex: undefined,
            });
            setStep("picker");
          }}
          onSelectItem={(item, index) => {
            setSelectedFilter({
              filter: item.filter,
              filterIndex: index,
            });
            setStep("picker");
          }}
          onRemoveItem={item => {
            onRemoveFilter(item.filter);
            if (filters.length === 1) {
              close();
            }
          }}
        />
      </MultiStepPopover.Step>

      <MultiStepPopover.Step value="picker">
        <FilterPicker
          className={S.PickerContainer}
          query={query}
          stageIndex={-1}
          onSelect={onSelectFilter}
          filter={selectedFilter.filter}
          filterIndex={selectedFilter.filterIndex}
          onClose={() => setStep("list")}
          withColumnItemIcon={withColumnItemIcon}
          withColumnGroupIcon={withColumnGroupIcon}
          withCustomExpression={withCustomExpression}
        ></FilterPicker>
      </MultiStepPopover.Step>
    </MultiStepPopover>
  );
};

export const Filter = ({
  withColumnItemIcon,
  withColumnGroupIcon,
  withCustomExpression,
}: Pick<
  FilterColumnPickerProps,
  "withColumnItemIcon" | "withColumnGroupIcon" | "withCustomExpression"
>) => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  const onQueryChange = (query: Lib.Query) => {
    updateQuestion(question.setQuery(query), { run: true });
  };

  return (
    <FilterInner
      query={question.query()}
      stageIndex={-1}
      onQueryChange={onQueryChange}
      withColumnItemIcon={withColumnItemIcon}
      withColumnGroupIcon={withColumnGroupIcon}
      withCustomExpression={withCustomExpression}
    />
  );
};
