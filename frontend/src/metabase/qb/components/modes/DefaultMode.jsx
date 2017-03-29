/* @flow weak */

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

export default {
    name: "default",

    getActions() {
        return DEFAULT_ACTIONS;
    },

    getDrills() {
        return DEFAULT_DRILLS;
    }
};
