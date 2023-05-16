/* eslint-disable react/display-name */
import React from "react";
import { ClickActionPopoverProps } from "metabase/modes/types";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Filter from "metabase-lib/queries/structured/Filter";

export const getColumnFilterDrillPopover =
  ({
    query,
    initialFilter,
  }: {
    query: StructuredQuery;
    initialFilter?: Filter;
  }) =>
  ({ onChangeCardAndRun, onResize, onClose }: ClickActionPopoverProps) =>
    (
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
