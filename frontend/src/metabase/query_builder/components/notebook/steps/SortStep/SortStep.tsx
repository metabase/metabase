import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import type {
  Field as IField,
  OrderBy as IOrderBy,
} from "metabase-types/types/Query";
import type DimensionOptions from "metabase-lib/DimensionOptions";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type OrderBy from "metabase-lib/queries/structured/OrderBy";

import type { NotebookStepUiComponentProps } from "../../types";
import ClauseStep from "../ClauseStep";
import { SortDirectionButton, SortFieldList } from "./SortStep.styled";

function SortStep({
  query,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const handleUpdateSort = (sort: IOrderBy, index: number) => {
    updateQuery(query.updateSort(index, sort));
  };

  const handleAddSort = (sort: IOrderBy) => {
    updateQuery(query.sort(sort));
  };

  const handleRemoveSort = (sort: OrderBy, index: number) => {
    return updateQuery(query.removeSort(index));
  };

  return (
    <ClauseStep
      color={color}
      items={query.sorts()}
      readOnly={readOnly}
      isLastOpened={isLastOpened}
      renderName={(sort, index) => (
        <SortDisplayName
          sort={sort}
          index={index}
          onChange={handleUpdateSort}
        />
      )}
      renderPopover={(sort, index) => (
        <SortPopover
          query={query}
          sort={sort}
          onChangeSort={newSort => {
            const isUpdate = sort && typeof index === "number";
            return isUpdate
              ? handleUpdateSort(newSort, index)
              : handleAddSort(newSort);
          }}
        />
      )}
      onRemove={handleRemoveSort}
    />
  );
}

interface SortDisplayNameProps {
  sort: OrderBy;
  index: number;
  onChange: (newSort: IOrderBy, index: number) => void;
}

function SortDisplayName({ sort, index, onChange }: SortDisplayNameProps) {
  const [direction, fieldRef] = sort;

  const displayName = sort.dimension().displayName();
  const icon = direction === "asc" ? "arrow_up" : "arrow_down";

  const handleToggleDirection = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    const nextDirection = direction === "asc" ? "desc" : "asc";
    const nextSortClause: IOrderBy = [nextDirection, fieldRef];
    onChange(nextSortClause, index);
  };

  return (
    <SortDirectionButton
      aria-label={t`Change direction`}
      onClick={handleToggleDirection}
    >
      <Icon name={icon} />
      <span>{displayName}</span>
    </SortDirectionButton>
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
  const [direction, field] = sort;
  const table = query.table();

  const handleChangeField = (nextField: IField) => {
    onChangeSort([direction, nextField]);
    onClose?.();
  };

  // FieldList requires table
  if (!table) {
    return null;
  }

  const fieldOptions = sortOptions || query.sortOptions(field);

  return (
    <SortFieldList
      maxHeight={maxHeight}
      field={field}
      fieldOptions={fieldOptions}
      onFieldChange={handleChangeField}
      table={table}
      enableSubDimensions={false}
      useOriginalDimension={true}
      alwaysExpanded={alwaysExpanded}
    />
  );
};

export default SortStep;
