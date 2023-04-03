import React from "react";
import Icon from "metabase/components/Icon";

import type {
  Field as IField,
  OrderBy as IOrderBy,
} from "metabase-types/types/Query";
import type DimensionOptions from "metabase-lib/DimensionOptions";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type OrderBy from "metabase-lib/queries/structured/OrderBy";

import type { NotebookStepUiComponentProps } from "../types";
import ClauseStep from "./ClauseStep";
import { SortFieldList } from "./SortStep.styled";

function SortStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  readOnly,
}: NotebookStepUiComponentProps) {
  return (
    <ClauseStep
      color={color}
      items={query.sorts()}
      readOnly={readOnly}
      renderName={(sort, index) => (
        <span
          className="flex align-center"
          onClick={e => {
            e.stopPropagation();
            updateQuery(
              query.updateSort(index, [
                sort[0] === "asc" ? "desc" : "asc",
                sort[1],
              ]),
            );
          }}
        >
          <Icon
            name={sort[0] === "asc" ? "arrow_up" : "arrow_down"}
            className="text-white mr1"
          />
          <span>{sort.dimension().displayName()}</span>
        </span>
      )}
      renderPopover={(sort, index) => (
        <SortPopover
          query={query}
          sort={sort}
          onChangeSort={newSort =>
            sort && typeof index === "number"
              ? updateQuery(query.updateSort(index, newSort))
              : updateQuery(query.sort(newSort))
          }
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={(sort, index) => updateQuery(query.removeSort(index))}
    />
  );
}

interface SortPopoverProps {
  sort?: OrderBy;
  query: StructuredQuery;
  sortOptions?: DimensionOptions;
  maxHeight?: number;
  alwaysExpanded?: boolean;
  onChangeSort: (clause: IOrderBy) => void;
  onClose?: () => void;
}

const SortPopover = ({
  sort: sortProp,
  onChangeSort,
  onClose,
  query,
  sortOptions,
  maxHeight,
  alwaysExpanded,
}: SortPopoverProps) => {
  const sort = sortProp || ["asc", null];
  const table = query.table();

  // FieldList requires table
  if (!table) {
    return null;
  }

  return (
    <SortFieldList
      maxHeight={maxHeight}
      field={sort && sort[1]}
      fieldOptions={sortOptions || query.sortOptions(sort && sort[1])}
      onFieldChange={(field: IField) => {
        onChangeSort([sort[0], field]);
        onClose?.();
      }}
      table={table}
      enableSubDimensions={false}
      useOriginalDimension={true}
      alwaysExpanded={alwaysExpanded}
    />
  );
};

export default SortStep;
