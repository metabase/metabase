/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import { TYPE, isa } from "metabase/lib/types";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

const INVALID_TYPES = [TYPE.Structured];

export default function ColumnFilterDrill({ question, clicked }) {
  const query = question.query();
  if (
    !question.isStructured() ||
    !query.isEditable() ||
    !clicked ||
    !clicked.column ||
    INVALID_TYPES.some(type => isa(clicked.column.base_type, type)) ||
    clicked.column.field_ref == null ||
    clicked.value !== undefined
  ) {
    return [];
  }

  const { column } = clicked;

  // if our field ref doesn't match our column id, we have a remapped column
  // and need to use the field id instead of the ref
  const fieldRef =
    column.id !== undefined && column.id !== column.field_ref[1]
      ? ["field", column.id, null]
      : column.field_ref;

  const initialFilter = new Filter([], null, query).setDimension(fieldRef, {
    useDefaultOperator: true,
  });

  return [
    {
      name: "filter-column",
      section: "summarize",
      title: t`Filter by this column`,
      buttonType: "horizontal",
      icon: "filter",
      // eslint-disable-next-line react/display-name
      popover: ({ onChangeCardAndRun, onClose }) => (
        <FilterPopover
          query={query}
          filter={initialFilter}
          onClose={onClose}
          onChangeFilter={filter => {
            const nextCard = query.filter(filter).question().card();
            onChangeCardAndRun({ nextCard });
            onClose();
          }}
          showFieldPicker={false}
          isNew={true}
        />
      ),
    },
  ];
}
