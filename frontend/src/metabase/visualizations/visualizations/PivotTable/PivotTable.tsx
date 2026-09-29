import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";

import { PivotTableView } from "./PivotTableInner";
import { PIVOT_TABLE_DEFINITION } from "./definition";

const mapStateToProps = (state: State) => ({});

export const PivotTable = Object.assign(
  connect(mapStateToProps)(PivotTableView),
  PIVOT_TABLE_DEFINITION,
);
