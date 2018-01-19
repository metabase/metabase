/* @flow weak */

import Q_DEPRECATED from "metabase/lib/query"; // legacy query lib
import {
    isDate,
    isAddress,
    isCategory,
    isPK
} from "metabase/lib/schema_metadata";
import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";

import ObjectMode from "../components/modes/ObjectMode";
import SegmentMode from "../components/modes/SegmentMode";
import MetricMode from "../components/modes/MetricMode";
import TimeseriesMode from "../components/modes/TimeseriesMode";
import GeoMode from "../components/modes/GeoMode";
import PivotMode from "../components/modes/PivotMode";
import NativeMode from "../components/modes/NativeMode";
import DefaultMode from "../components/modes/DefaultMode";

import type { Card as CardObject } from "metabase/meta/types/Card";
import type { TableMetadata } from "metabase/meta/types/Metadata";
import type { QueryMode } from "metabase/meta/types/Visualization";
import type { Dataset } from "metabase/meta/types/Dataset";

import _ from "underscore";

export function getMode(
    card: CardObject,
    tableMetadata: ?TableMetadata,
    result?: Dataset
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
        const filters = Query.getFilters(query);

        if (aggregations.length === 0 && breakouts.length === 0) {
            const isPKFilter = filter => {
                if (
                    tableMetadata && Array.isArray(filter) && filter[0] === "="
                ) {
                    const fieldId = Q_DEPRECATED.getFieldTargetId(filter[1]);
                    const field = tableMetadata.fields_lookup[fieldId];
                    if (
                        field &&
                        field.table.id === query.source_table &&
                        isPK(field) &&
                        // implicit bucketing by day effectively removes the
                        // uniqueness guarentee normally provided by primary key
                        // but if we're explicitly using the "default" unit then
                        // consider it a PK again
                        (!isDate(field) ||
                            (Q_DEPRECATED.isDatetimeField(filter[1]) &&
                                Q_DEPRECATED.getDatetimeUnit(filter[1]) ===
                                    "default"))
                    ) {
                        return true;
                    }
                }
                return false;
            };
            // if we know row count isn't 1 don't show ObjectMode
            if (
                _.any(filters, isPKFilter) &&
                (!result || result.row_count === 1)
            ) {
                return ObjectMode;
            } else {
                return SegmentMode;
            }
        }
        if (aggregations.length > 0 && breakouts.length === 0) {
            return MetricMode;
        }
        if (aggregations.length > 0 && breakouts.length > 0) {
            let breakoutFields = breakouts.map(
                breakout =>
                    (Q_DEPRECATED.getFieldTarget(breakout, tableMetadata) || {
                    }).field
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
