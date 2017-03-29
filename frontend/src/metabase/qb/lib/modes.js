import Q, { AggregationClause, NamedClause } from "metabase/lib/query"; // legacy query lib
import {
    isDate,
    isAddress,
    isCategory,
    getAggregator
} from "metabase/lib/schema_metadata";
import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";
import { format } from "metabase/lib/expressions/formatter";

import _ from "underscore";

import SegmentMode from "../components/modes/SegmentMode";
import MetricMode from "../components/modes/MetricMode";
import TimeseriesMode from "../components/modes/TimeseriesMode";
import GeoMode from "../components/modes/GeoMode";
import PivotMode from "../components/modes/PivotMode";
import NativeMode from "../components/modes/NativeMode";
import DefaultMode from "../components/modes/DefaultMode";

type QueryBuilderMode = {
    name: string
};

export function getMode(card, tableMetadata): QueryBuilderMode {
    if (!card) {
        return null;
    }

    if (Card.isNative(card)) {
        return NativeMode;
    }
    if (Card.isStructured(card)) {
        if (!tableMetadata) {
            return null;
        }

        const query = Card.getQuery(card);
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

function getAggregationName(aggregation, tableMetadata, customFields) {
    if (NamedClause.isNamed(aggregation)) {
        return NamedClause.getName(aggregation);
    } else if (AggregationClause.isCustom(aggregation)) {
        return format(aggregation, { tableMetadata, customFields });
    } else if (AggregationClause.isMetric(aggregation)) {
        const metricId = AggregationClause.getMetric(aggregation);
        const selectedMetric = _.findWhere(tableMetadata.metrics, {
            id: metricId
        });
        if (selectedMetric) {
            return selectedMetric.name;
        }
    } else {
        const fieldId = AggregationClause.getField(aggregation);
        const selectedAggregation = getAggregator(
            AggregationClause.getOperator(aggregation)
        );
        if (
            selectedAggregation &&
            _.findWhere(tableMetadata.aggregation_options, {
                short: selectedAggregation.short
            })
        ) {
            return selectedAggregation.name.replace(" of ...", "") +
                (fieldId ? " of FIXME" : "");
        }
    }
    return null;
}

export function getMetrics(card, tableMetadata) {
    if (tableMetadata && Card.isStructured(card)) {
        const query = Card.getQuery(card);
        return Query.getAggregations(query).map(aggregation => ({
            name: getAggregationName(
                aggregation,
                tableMetadata,
                query.expression
            )
        }));
    }
    return [];
}
