import { t } from "ttag";

import { FilterPopover } from "metabase/query_builder/components/filters/FilterPopover";
import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../types";
import ClauseStep from "./ClauseStep";

function FilterStep({
  query,
  topLevelQuery,
  step: { stageIndex },
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
      renderName={(item, index) => {
        const v2Filter = Lib.filters(topLevelQuery, stageIndex)[index];
        if (!v2Filter) {
          return "UNKNOWN";
        }
        return Lib.displayInfo(topLevelQuery, stageIndex, v2Filter).displayName;
      }}
      readOnly={readOnly}
      renderPopover={filter => (
        <FilterPopover
          query={query}
          filter={filter}
          onChangeFilter={newFilter =>
            filter
              ? updateQuery(filter.replace(newFilter))
              : updateQuery(query.filter(newFilter))
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
