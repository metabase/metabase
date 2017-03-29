/* @flow weak */

import React from "react";

import { TYPE, isa, isFK, isPK } from "metabase/lib/types";
import { filter } from "metabase/qb/lib/actions";

function getFiltersForColumn(column) {
    if (isFK(column.special_type) || isPK(column.special_type)) {
        return;
    }

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

export default ({ card, tableMetadata, clicked }) => {
    if (!(clicked && clicked.column && clicked.column.id != null)) {
        return;
    }

    let operators = getFiltersForColumn(clicked.column);
    if (!operators) {
        return;
    }

    return {
        title: (
            <span>
                Filter by this value
            </span>
        ),
        popover({ onChangeCardAndRun, onClose }) {
            return (
                <ul className="h1 flex align-center px1">
                    {operators.map(({ name, operator }) => <li
                            key={operator}
                            className="p2 text-brand-hover cursor-pointer"
                            onClick={() => {
                                onChangeCardAndRun(
                                    filter(
                                        card,
                                        operator,
                                        clicked.column,
                                        clicked.value
                                    )
                                );
                            }}
                        >{name}</li>)}
                </ul>
            );
        }
    };
};
