import { Suspense, lazy } from "react";

import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import TableSkeleton from "metabase/visualizations/components/skeletons/TableSkeleton";
import type { VisualizationProps } from "metabase/visualizations/types";

import { PIVOT_TABLE_DEFINITION } from "./definition";

const mapStateToProps = (state: State) => ({
  fontFamily: getSetting(state, "application-font"),
});

// react-virtualized (and the grid renderer that uses it) is loaded lazily so it
// stays out of the initial bundle for the majority of users who never open a
// pivot table.
const PivotTableView = lazy(() =>
  import(/* webpackChunkName: "pivot-table-view" */ "./PivotTableInner").then(
    (module) => ({ default: module.PivotTableView }),
  ),
);

function PivotTableComponent(
  props: VisualizationProps & { className?: string },
) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <PivotTableView {...props} />
    </Suspense>
  );
}

export const PivotTable = Object.assign(
  connect(mapStateToProps)(PivotTableComponent),
  PIVOT_TABLE_DEFINITION,
);
