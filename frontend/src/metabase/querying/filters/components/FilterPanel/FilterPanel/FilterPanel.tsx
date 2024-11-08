import {
  type UseSelectedFiltersProps,
  useSelectedFilters,
} from "metabase/querying/filters/components/FilterPanel";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";

import { FilterPanelPopover } from "../FilterPanelPopover";

import { FilterPanelRoot } from "./FilterPanel.styled";

export function FilterPanel({
  question,
  updateQuestion,
}: UseSelectedFiltersProps) {
  const items = useSelectedFilters({ question, updateQuestion });

  if (items.length === 0) {
    return null;
  }

  return (
    <FilterPanelRoot
      align="center"
      wrap="wrap"
      gap="sm"
      px="xl"
      py="sm"
      data-testid="qb-filters-panel"
    >
      {items.map(
        (
          {
            filter,
            stageIndex,
            query,
            handleChange,
            handleRemove,
            longDisplayName,
          },
          itemIndex,
        ) => (
          <FilterPanelPopover
            key={itemIndex}
            query={query}
            stageIndex={stageIndex}
            filter={filter}
            longDisplayName={longDisplayName}
            handleChange={handleChange}
            handleRemove={handleRemove}
          />
        ),
      )}
    </FilterPanelRoot>
  );
}

type RenderCheckOpts = {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
  isObjectDetail: boolean;
};

export const shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
}: RenderCheckOpts) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    !isNative &&
    isEditable &&
    !isObjectDetail &&
    !question.isArchived()
  );
};
