/* @flow */

import React from "react";

import TimeseriesGroupingWidget
    from "metabase/qb/components/TimeseriesGroupingWidget";
import TimeseriesFilterWidget
    from "metabase/qb/components/TimeseriesFilterWidget";

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import PivotByCategoryAction from "../actions/PivotByCategoryAction";
import PivotByLocationAction from "../actions/PivotByLocationAction";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";

import TimeseriesPivotDrill from "../drill/TimeseriesPivotDrill";

import type { QueryMode } from "metabase/meta/types/Visualization";
import type {
    Card as CardObject,
    DatasetQuery
} from "metabase/meta/types/Card";
import type { TableMetadata } from "metabase/meta/types/Metadata";

type Props = {
    lastRunCard: CardObject,
    tableMetadata: TableMetadata,
    setDatasetQuery: (datasetQuery: DatasetQuery) => void,
    runQuery: () => void
};

export const TimeseriesModeFooter = (props: Props) => {
    return (
        <div className="flex layout-centered">
            <span className="mr1">View</span>
            <TimeseriesFilterWidget {...props} card={props.lastRunCard} />
            <span className="mx1">by</span>
            <TimeseriesGroupingWidget {...props} card={props.lastRunCard} />
        </div>
    );
};

const TimeseriesMode: QueryMode = {
    name: "timeseries",
    actions: [...DEFAULT_ACTIONS, PivotByCategoryAction, PivotByLocationAction],
    drills: [
        ...DEFAULT_DRILLS,
        TimeseriesPivotDrill,
        PivotByCategoryDrill,
        PivotByLocationDrill
    ],
    ModeFooter: TimeseriesModeFooter
};

export default TimeseriesMode;
