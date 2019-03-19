import React from "react";

import ClauseStep from "./ClauseStep";

import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

export default function FilterStep({ color, query, ...props }) {
  return (
    <ClauseStep
      color={color}
      items={query.filters()}
      renderPopover={filter => (
        <FilterPopover
          query={query}
          filter={filter}
          onChangeFilter={newFilter =>
            filter
              ? filter.replace(newFilter).update()
              : query.addFilter(newFilter).update()
          }
        />
      )}
      onRemove={filter => filter.remove().update()}
    />
  );
}
