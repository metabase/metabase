/* @flow weak */

import Q from "metabase/lib/query"; // legacy query lib
import { isDate, isAddress, isCategory } from "metabase/lib/schema_metadata";
import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";
import Utils from "metabase/lib/utils";

import SegmentMode from "../components/modes/SegmentMode";
import MetricMode from "../components/modes/MetricMode";
import TimeseriesMode from "../components/modes/TimeseriesMode";
import GeoMode from "../components/modes/GeoMode";
import PivotMode from "../components/modes/PivotMode";
import NativeMode from "../components/modes/NativeMode";
import DefaultMode from "../components/modes/DefaultMode";

import type { Card as CardObject } from "metabase/meta/types/Card";
import type { TableMetadata } from "metabase/meta/types/Metadata";
import type {
    QueryMode,
    ClickAction,
    ClickActionProps,
    ClickObject
} from "metabase/meta/types/Visualization";

export function getMode(
    card: CardObject,
    tableMetadata: ?TableMetadata
): ?QueryMode {
    if (!card) {
        return null;
    }

    if (Card.isNative(card)) {
        return NativeMode;
    }

    const query = Card.getQuery(card);
    if (Card.isStructured(card) && query) {
        if (!tableMetadata) {
            return null;
        }

        const aggregations = Query.getAggregations(query);
        const breakouts = Query.getBreakouts(query);

        if (aggregations.length === 0 && breakouts.length === 0) {
            return SegmentMode;
        }
        if (aggregations.length > 0 && breakouts.length === 0) {
            return MetricMode;
        }
        if (aggregations.length > 0 && breakouts.length > 0) {
            let breakoutFields = breakouts.map(
                breakout =>
                    (Q.getFieldTarget(breakout, tableMetadata) || {}).field
            );
            if (
                (breakoutFields.length === 1 && isDate(breakoutFields[0])) ||
                (breakoutFields.length === 2 &&
                    isDate(breakoutFields[0]) &&
                    isCategory(breakoutFields[1]))
            ) {
                return TimeseriesMode;
            }
            if (breakoutFields.length === 1 && isAddress(breakoutFields[0])) {
                return GeoMode;
            }
            if (
                (breakoutFields.length === 1 &&
                    isCategory(breakoutFields[0])) ||
                (breakoutFields.length === 2 &&
                    isCategory(breakoutFields[0]) &&
                    isCategory(breakoutFields[1]))
            ) {
                return PivotMode;
            }
        }
    }

    return DefaultMode;
}

export const getModeActions = (
    mode: ?QueryMode,
    card: ?CardObject,
    tableMetadata: ?TableMetadata
): ClickAction[] => {
    if (mode && card && tableMetadata) {
        // FIXME: copy card because it may be frozen and action may mutate it :-/
        card = Utils.copy(card);
        const props: ClickActionProps = { card, tableMetadata };
        // flatten array of arrays
        return [].concat(
            ...mode.actions.map(actionCreator => actionCreator(props))
        );
    }
    return [];
};

export const getModeDrills = (
    mode: ?QueryMode,
    card: ?CardObject,
    tableMetadata: ?TableMetadata,
    clicked: ?ClickObject
): ClickAction[] => {
    if (mode && card && tableMetadata && clicked) {
        // FIXME: copy card because it may be frozen and action may mutate it :-/
        card = Utils.copy(card);
        const props: ClickActionProps = { card, tableMetadata, clicked };
        // flatten array of arrays
        return [].concat(
            ...mode.drills.map(actionCreator => actionCreator(props))
        );
    }
    return [];
};
