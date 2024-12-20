import type { UpdateQueryHookProps } from "metabase/query_builder/hooks";
import {
  FilterPicker as InnerFilterPicker,
  type FilterPickerProps as InnerFilterPickerProps,
} from "metabase/querying/filters/components/FilterPicker";
import { Box } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../../../context";
import type { SDKFilterItem } from "../hooks/use-filter-data";
import { useFilterHandlers } from "../hooks/use-filter-handlers";

type Props = {
  className?: string;
  filterItem?: SDKFilterItem;
  withIcon?: boolean;
} & Pick<InnerFilterPickerProps, "onClose" | "onBack">;

const FilterPickerInner = ({
  className,
  filterItem,
  withIcon = false,
  onClose,
  onBack,
  query,
  stageIndex,
  onQueryChange,
}: Props & UpdateQueryHookProps) => {
  const { onAddFilter } = useFilterHandlers({
    query,
    stageIndex,
    onQueryChange,
  });
  return (
    <Box className={className}>
      <InnerFilterPicker
        query={query}
        stageIndex={stageIndex}
        onClose={onClose}
        onBack={onBack}
        onSelect={filter =>
          filterItem ? filterItem?.onUpdateFilter(filter) : onAddFilter(filter)
        }
        filter={filterItem?.filter}
        filterIndex={filterItem?.filterIndex}
        withCustomExpression={false}
        withColumnGroupIcon={false}
        withColumnItemIcon={withIcon}
      />
    </Box>
  );
};

export const FilterPicker = ({
  filterItem,
  className,
  withIcon,
  onClose,
  onBack,
}: Props) => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  const onQueryChange = (query: Lib.Query) => {
    if (query) {
      updateQuestion(question.setQuery(query), { run: true });
    }
  };

  const query = question.query();
  const stageIndex = -1;

  return (
    <FilterPickerInner
      filterItem={filterItem}
      className={className}
      withIcon={withIcon}
      onClose={onClose}
      onBack={onBack}
      query={query}
      stageIndex={stageIndex}
      onQueryChange={onQueryChange}
    />
  );
};
