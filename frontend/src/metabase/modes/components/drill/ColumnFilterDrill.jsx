/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";

import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

export default function QuickFilterDrill({ question, clicked }) {
  const query = question.query();
  if (
    !(query instanceof StructuredQuery) ||
    !clicked ||
    !clicked.column ||
    clicked.column.field_ref == null ||
    clicked.value !== undefined
  ) {
    return [];
  }

  const { column } = clicked;
  const initialFilter = new Filter(
    [],
    null,
    query,
  ).setDimension(column.field_ref, { useDefaultOperator: true });

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
            const nextCard = query
              .filter(filter)
              .question()
              .card();
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
