/* @flow */

import { getFieldRefFromColumn } from "metabase/qb/lib/actions";
import { isNumeric } from "metabase/lib/schema_metadata";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

const AGGREGATIONS = {
    sum: {
        section: "sum",
        title: "Sum"
    },
    avg: {
        section: "averages",
        title: "Avg"
    },
    min: {
        section: "averages",
        title: "Min"
    },
    max: {
        section: "averages",
        title: "Max"
    },
    distinct: {
        section: "averages",
        title: "Distincts"
    }
};

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
    if (
        !clicked ||
        !clicked.column ||
        clicked.value !== undefined ||
        clicked.column.source !== "fields" ||
        !isNumeric(clicked.column)
    ) {
        return [];
    }
    const { column } = clicked;

    // $FlowFixMe
    return Object.entries(AGGREGATIONS).map(([aggregation, action]: [string, {
        section: string,
        title: string
    }]) => ({
        name: action.title.toLowerCase(),
        ...action,
        question: () =>
            question.summarize([aggregation, getFieldRefFromColumn(column)])
    }));
};
