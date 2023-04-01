import React from "react";
import { t } from "ttag";

import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

import type { NotebookStepUiComponentProps } from "../types";
import ClauseStep from "./ClauseStep";

function FilterStep({
  query,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepUiComponentProps) {
  return (
    <ClauseStep
      color={color}
      initialAddText={t`Add filters to narrow your answer`}
      items={query.filters()}
      renderName={item => item.displayName()}
      readOnly={readOnly}
      renderPopover={({ item: filter, closePopover }) => (
        <FilterPopover
          query={query}
          filter={filter}
          onChangeFilter={newFilter => {
            if (filter) {
              updateQuery(filter.replace(newFilter));
            } else {
              updateQuery(query.filter(newFilter));
            }
            closePopover();
          }}
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={filter => updateQuery(filter.remove())}
    />
  );
}

export default FilterStep;
