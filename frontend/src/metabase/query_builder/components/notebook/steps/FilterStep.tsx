import { t } from "ttag";

import { FilterPopover } from "metabase/query_builder/components/filters/FilterPopover";

import type { NotebookStepUiComponentProps } from "../types";
import ClauseStep from "./ClauseStep";

function FilterStep({
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { query: legacyQuery } = step;
  return (
    <ClauseStep
      color={color}
      initialAddText={t`Add filters to narrow your answer`}
      items={legacyQuery.filters()}
      renderName={item => item.displayName()}
      readOnly={readOnly}
      renderPopover={filter => (
        <FilterPopover
          query={legacyQuery}
          filter={filter}
          onChangeFilter={newFilter =>
            filter
              ? updateQuery(filter.replace(newFilter))
              : updateQuery(legacyQuery.filter(newFilter))
          }
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={filter => updateQuery(filter.remove())}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FilterStep;
