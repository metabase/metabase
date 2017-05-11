/* @flow */

import React from "react";

import { TYPE, isa, isFK, isPK } from "metabase/lib/types";
import { singularize, pluralize, stripId } from "metabase/lib/formatting";

import { filter } from "metabase/qb/lib/actions";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

function getFiltersForColumn(column) {
    if (
        isa(column.base_type, TYPE.Number) ||
        isa(column.base_type, TYPE.DateTime)
    ) {
        return [
            { name: "<", operator: "<" },
            { name: "=", operator: "=" },
            { name: "≠", operator: "!=" },
            { name: ">", operator: ">" }
        ];
    } else {
        return [{ name: "=", operator: "=" }, { name: "≠", operator: "!=" }];
    }
}

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ClickAction[] => {
    if (
        !clicked ||
        !clicked.column ||
        clicked.column.id == null ||
        clicked.value == undefined
    ) {
        return [];
    }

    const { value, column } = clicked;

    if (isPK(column.special_type)) {
        return [];
    } else if (isFK(column.special_type)) {
        return [
            {
                name: "view-fks",
                section: "filter",
                title: (
                    <span>
                        View this
                        {" "}
                        {singularize(stripId(column.display_name))}
                        's
                        {" "}
                        {pluralize(tableMetadata.display_name)}
                    </span>
                ),
                card: () => filter(card, "=", column, value)
            }
        ];
    }

    let operators = getFiltersForColumn(column) || [];
    return operators.map(({ name, operator }) => ({
        name: operator,
        section: "filter",
        title: <span className="h2">{name}</span>,
        card: () => filter(card, operator, column, value)
    }));
};
