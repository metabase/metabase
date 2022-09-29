/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import { TYPE, isa } from "metabase/lib/types";

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

  const { dimension } = clicked;
  const initialFilter = dimension.defaultFilterForDimension();

  return [
    {
      name: "filter-column",
      section: "summarize",
      title: t`Filter by this column`,
      buttonType: "horizontal",
      icon: "filter",
      // eslint-disable-next-line react/display-name
      popover: ({ onChangeCardAndRun, onResize, onClose }) => (
        <FilterPopover
          query={query}
          filter={initialFilter}
          onClose={onClose}
          onResize={onResize}
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
