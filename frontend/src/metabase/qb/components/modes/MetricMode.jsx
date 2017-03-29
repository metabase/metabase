/* @flow weak */

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import PivotByCategoryAction from "../actions/PivotByCategoryAction";
import PivotByLocationAction from "../actions/PivotByLocationAction";
import PivotByTimeAction from "../actions/PivotByTimeAction";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";

export default {
    name: "metric",

    getActions() {
        return DEFAULT_ACTIONS.concat([
            PivotByCategoryAction,
            PivotByLocationAction,
            PivotByTimeAction
        ]);
    },

    getDrills() {
        return DEFAULT_DRILLS.concat([
            PivotByCategoryDrill,
            PivotByLocationDrill,
            PivotByTimeDrill
        ]);
    }
};
