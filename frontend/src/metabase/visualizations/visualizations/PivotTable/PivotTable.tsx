import { Suspense, lazy } from "react";
import { t } from "ttag";

import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";
import TableSkeleton from "metabase/visualizations/components/skeletons/TableSkeleton";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  VisualizationDefinition,
  VisualizationProps,
} from "metabase/visualizations/types";

import { _columnSettings as columnSettings, settings } from "./settings";
import { checkRenderable, isSensible } from "./utils";

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

const PivotViz: VisualizationDefinition = {
  getUiName: () => t`Pivot Table`,
  identifier: "pivot",
  iconName: "pivot_table",
  minSize: getMinSize("pivot"),
  defaultSize: getDefaultSize("pivot"),
  canSavePng: false,
  isSensible,
  checkRenderable,
  settings,
  columnSettings,
  isLiveResizable: () => false,
};

export const PivotTable = Object.assign(
  connect(mapStateToProps)(PivotTableComponent),
  PivotViz,
);
