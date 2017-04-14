import { combineEpics } from "redux-observable";

import dashboardEpic from "metabase/dashboard/epics";

export default combineEpics(
    dashboardEpic
);
