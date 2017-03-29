/* @flow weak */

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import PivotByCategoryAction from "../actions/PivotByCategoryAction";
import PivotByTimeAction from "../actions/PivotByTimeAction";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";

export default {
    name: "geo",

    getActions() {
        return DEFAULT_ACTIONS.concat([
            PivotByCategoryAction,
            PivotByTimeAction
        ]);
    },

    getDrills() {
        return DEFAULT_DRILLS.concat([PivotByCategoryDrill, PivotByTimeDrill]);
    }
};
