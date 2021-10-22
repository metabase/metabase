/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

import ClauseStep from "./ClauseStep";

export default function FilterStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  ...props
}) {
  return (
    <ClauseStep
      color={color}
      initialAddText={t`Add filters to narrow your answer`}
      items={query.filters()}
      renderPopover={filter => (
        <FilterPopover
          query={query}
          filter={filter}
          onChangeFilter={newFilter =>
            filter
              ? filter.replace(newFilter).update(updateQuery)
              : query.filter(newFilter).update(updateQuery)
          }
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={filter => filter.remove().update(updateQuery)}
    />
  );
}
