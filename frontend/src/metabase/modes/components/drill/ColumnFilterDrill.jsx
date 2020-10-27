/* @flow */

import React from "react";
import { t } from "ttag";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";

import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

import type {
  ClickAction,
  ClickActionProps,
  ClickActionPopoverProps,
} from "metabase-types/types/Visualization";

export default function QuickFilterDrill({
  question,
  clicked,
}: ClickActionProps): ClickAction[] {
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
  const initialFilter = new Filter([], null, query).setDimension(
    column.field_ref,
    { useDefaultOperator: true },
  );

  return [
    {
      name: "filter-column",
      section: "filter",
      title: t`Filter`,
      // eslint-disable-next-line react/display-name
      popover: ({ onChangeCardAndRun, onClose }: ClickActionPopoverProps) => (
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
        />
      ),
    },
  ];
}
