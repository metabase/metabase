import React from "react";

import Icon from "metabase/components/Icon";

import ClauseStep from "./ClauseStep";

export default function SortStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  ...props
}) {
  return (
    <ClauseStep
      color={color}
      items={query.sorts()}
      renderName={(sort, index) => (
        <span
          className="flex align-center"
          onClick={e => {
            e.stopPropagation();
            query
              .updateSort(index, [sort[0] === "asc" ? "desc" : "asc", sort[1]])
              .update(updateQuery);
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
            sort
              ? query.updateSort(index, newSort).update(updateQuery)
              : query.sort(newSort).update(updateQuery)
          }
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={(sort, index) => query.removeSort(index).update(updateQuery)}
    />
  );
}

import FieldList from "metabase/query_builder/components/FieldList";

import type { OrderBy } from "metabase-types/types/Query";
import type { FieldOptions } from "metabase-types/types/Metadata";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type Props = {
  sort?: OrderBy,
  onChangeSort: (sort: OrderBy) => void,
  query: StructuredQuery,
  sortOptions?: FieldOptions,
  onClose?: () => void,
  maxHeight?: number,
  alwaysExpanded?: boolean,
};

const SortPopover = ({
  sort = ["asc", null],
  onChangeSort,
  query,
  sortOptions,
  onClose,
  maxHeight,
  alwaysExpanded,
}: Props) => {
  const table = query.table();
  // FieldList requires table
  if (!table) {
    return null;
  }
  return (
    <FieldList
      className="text-green"
      maxHeight={maxHeight}
      field={sort && sort[1]}
      fieldOptions={sortOptions || query.sortOptions(sort && sort[1])}
      onFieldChange={field => {
        onChangeSort([sort[0], field]);
        if (onClose) {
          onClose();
        }
      }}
      table={table}
      enableSubDimensions={false}
      useOriginalDimension={true}
      alwaysExpanded={alwaysExpanded}
    />
  );
};
