import React from "react";
import { t } from "ttag";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import type { ClickActionPopoverProps, Drill } from "metabase/modes/types";
import { columnFilterDrill } from "metabase-lib/queries/drills/column-filter-drill";

const ColumnFilterDrill: Drill = ({ question, clicked }) => {
  const drill = columnFilterDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { query, initialFilter } = drill;

  const ColumnFilterDrillPopover = ({
    onChangeCardAndRun,
    onResize,
    onClose,
  }: ClickActionPopoverProps) => (
    <FilterPopover
      isNew
      query={query}
      filter={initialFilter}
      showFieldPicker={false}
      onClose={onClose}
      onResize={onResize}
      onChangeFilter={filter => {
        const nextCard = filter.add().rootQuery().question().card();
        onChangeCardAndRun({ nextCard });
        onClose();
      }}
    />
  );

  return [
    {
      name: "filter-column",
      section: "summarize",
      title: t`Filter by this column`,
      buttonType: "horizontal",
      icon: "filter",
      popover: ColumnFilterDrillPopover,
    },
  ];
};

export default ColumnFilterDrill;
