import { t } from "ttag";
import type { DrillMLv2 } from "metabase/visualizations/types/click-actions";
import { getColumnFilterDrillPopover } from "metabase/visualizations/click-actions/components/ColumnFilterDrillPopover";
import type * as Lib from "metabase-lib";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Filter from "metabase-lib/queries/structured/Filter";

export const ColumnFilterDrill: DrillMLv2<Lib.ColumnFilterDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  question,
  clicked,
}) => {
  const query = question.query() as StructuredQuery;

  if (!drill || !query) {
    return [];
  }

  const { initialOp } = drillDisplayInfo;

  // TODO: refactor this after Filters will be added to MLv2
  const initialFilter =
    initialOp?.short && clicked?.column?.field_ref
      ? new Filter([initialOp.short, clicked.column.field_ref], null, query)
      : clicked?.dimension?.defaultFilterForDimension();

  const popoverProps = {
    initialFilter,
    query,
  };

  return [
    {
      name: "filter-column",
      section: "summarize",
      title: t`Filter by this column`,
      buttonType: "horizontal",
      icon: "filter",
      popover: getColumnFilterDrillPopover(popoverProps),
    },
  ];
};
