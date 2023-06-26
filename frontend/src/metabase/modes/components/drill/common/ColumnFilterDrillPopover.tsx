/* eslint-disable react/display-name */
import { ClickActionPopoverProps } from "metabase/modes/types";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import type { Card } from "metabase-types/api";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Filter from "metabase-lib/queries/structured/Filter";

export const getColumnFilterDrillPopover =
  ({
    query,
    initialFilter,
    addFilter = (filter: Filter) => filter.add().rootQuery().question().card(),
  }: {
    query: StructuredQuery;
    initialFilter?: Filter;
    addFilter?: (filter: Filter) => Card;
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
          const nextCard = addFilter(filter);
          onChangeCardAndRun({ nextCard });
          onClose();
        }}
      />
    );
