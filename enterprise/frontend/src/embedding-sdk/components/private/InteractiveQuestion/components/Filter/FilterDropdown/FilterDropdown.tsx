import { useMemo, useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import type { SDKFilterItem } from "embedding-sdk/components/private/InteractiveQuestion/components/Filter/hooks/use-filter-data";
import {
  MultiStepPopover,
  type MultiStepState,
} from "embedding-sdk/components/private/util/MultiStepPopover";
import type { UpdateQueryHookProps } from "metabase/query_builder/hooks";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import type { FilterColumnPickerProps } from "metabase/querying/filters/components/FilterPicker/FilterColumnPicker";
import type * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../../../context";
import { ToolbarButton } from "../../util/ToolbarButton";
import { FilterPicker } from "../FilterPicker/FilterPicker";

import { FilterBadgeList } from "./FilterBadgeList";

type FilterProps = Pick<FilterColumnPickerProps, "withColumnItemIcon">;

const FilterDropdownInner = ({
  query,
  withColumnItemIcon,
}: UpdateQueryHookProps & FilterProps) => {
  const filters = useMemo(() => getFilterItems(query), [query]);

  const [step, setStep] = useState<MultiStepState<"list" | "picker">>(null);

  const [selectedFilter, setSelectedFilter] = useState<
    SDKFilterItem | undefined
  >();

  const onSelectFilter = (item?: SDKFilterItem) => {
    setSelectedFilter(item);
    setStep("picker");
  };

  const label = match(filters.length)
    .with(0, () => t`Filter`)
    .with(1, () => t`1 filter`)
    .otherwise(value => jt`${value} filters`);

  const onRemoveItem = (item: SDKFilterItem) => {
    item.onRemoveFilter();
    if (filters.length === 1) {
      setStep(null);
    }
  };

  return (
    <MultiStepPopover currentStep={step} onClose={() => setStep(null)}>
      <MultiStepPopover.Target>
        <ToolbarButton
          label={label}
          icon="filter"
          isHighlighted={filters.length > 0}
          onClick={() =>
            setStep(
              step === null ? (filters.length === 0 ? "picker" : "list") : null,
            )
          }
        />
      </MultiStepPopover.Target>

      <MultiStepPopover.Step value="list">
        <FilterBadgeList
          onAddItem={onSelectFilter}
          onSelectItem={onSelectFilter}
          onRemoveItem={onRemoveItem}
        />
      </MultiStepPopover.Step>

      <MultiStepPopover.Step value="picker">
        <FilterPicker
          filterItem={selectedFilter}
          withIcon={withColumnItemIcon}
          onClose={() => setStep("list")}
          onBack={() => setStep("list")}
        />
      </MultiStepPopover.Step>
    </MultiStepPopover>
  );
};

export const FilterDropdown = ({ withColumnItemIcon }: FilterProps) => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  const onQueryChange = (query: Lib.Query) => {
    updateQuestion(question.setQuery(query), { run: true });
  };

  return (
    <FilterDropdownInner
      query={question.query()}
      stageIndex={-1}
      onQueryChange={onQueryChange}
      withColumnItemIcon={withColumnItemIcon}
    />
  );
};
