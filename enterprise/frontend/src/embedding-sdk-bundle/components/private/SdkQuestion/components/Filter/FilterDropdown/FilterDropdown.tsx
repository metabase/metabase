import { useMemo, useState } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import type { SDKFilterItem } from "embedding-sdk-bundle/components/private/SdkQuestion/components/Filter/hooks/use-filter-data";
import {
  MultiStepPopover,
  type MultiStepState,
} from "embedding-sdk-bundle/components/private/util/MultiStepPopover";
import type { UpdateQueryHookProps } from "metabase/query_builder/hooks";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import type { PopoverProps } from "metabase/ui";

import { useSdkQuestionContext } from "../../../context";
import { ToolbarButton } from "../../util/ToolbarButton";
import { FilterBadgeList } from "../FilterBadgeList";
import { FilterPicker } from "../FilterPicker/FilterPicker";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type FilterDropdownProps = {
  /**
   * Whether to show the icon for the column item
   */
  withColumnItemIcon?: boolean;
};

const FilterDropdownInner = ({
  query,
  withColumnItemIcon,
  ...popoverProps
}: Pick<UpdateQueryHookProps, "query"> &
  FilterDropdownProps &
  Omit<PopoverProps, "children" | "onClose" | "opened">) => {
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
    .otherwise(
      (value) =>
        c("{0} refers to a number greater than 1 (i.e. 2 filters, 10 filters)")
          .t`${value} filters`,
    );

  const onRemoveItem = (item: SDKFilterItem) => {
    item.onRemoveFilter();
    if (filters.length === 1) {
      setStep(null);
    }
  };

  return (
    <MultiStepPopover
      currentStep={step}
      onClose={() => setStep(null)}
      {...popoverProps}
    >
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

/**
 * A dropdown button for the Filter component.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const FilterDropdown = ({ withColumnItemIcon }: FilterDropdownProps) => {
  const { question } = useSdkQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <FilterDropdownInner
      query={question.query()}
      withColumnItemIcon={withColumnItemIcon}
    />
  );
};
