/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import { columnFilterDrill } from "metabase-lib/queries/drills/column-filter-drill";

export default function ColumnFilterDrill({ question, clicked }) {
  const drill = columnFilterDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { query, initialFilter } = drill;

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
            const nextCard = filter.add().rootQuery().question().card();
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
