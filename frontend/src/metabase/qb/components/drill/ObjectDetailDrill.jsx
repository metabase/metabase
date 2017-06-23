/* @flow */

import { drillRecord } from "metabase/qb/lib/actions";

import { isFK, isPK } from "metabase/lib/types";

import * as Table from "metabase/lib/query/table";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ClickAction[] => {
    if (
        !clicked ||
        !clicked.column ||
        clicked.value === undefined ||
        !(isFK(clicked.column.special_type) ||
            isPK(clicked.column.special_type))
    ) {
        return [];
    }

    const value = clicked.value;

    let field = Table.getField(tableMetadata, clicked.column.id);
    let table = tableMetadata;
    if (field.target) {
        table = field.target.table;
        field = field.target;
    }

    if (!field || !table) {
        return [];
    }

    return [
        {
            name: "object-detail",
            section: "details",
            title: "View details",
            default: true,
            card: () =>
                drillRecord(tableMetadata.db_id, table.id, field.id, value)
        }
    ];
};
