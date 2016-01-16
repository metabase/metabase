import { AngularResourceProxy } from "./redux";

import { addValidOperatorsToFields } from "metabase/lib/schema_metadata";

import _ from "underscore";

const Metabase = new AngularResourceProxy("Metabase", ["table_query_metadata", "table_fks"]);

export function isQueryable(table) {
    return table.visibility_type == null;
}

export async function loadTable(tableId) {
    let [table, foreignKeys] = await * [
        Metabase.table_query_metadata({ tableId }),
        Metabase.table_fks({ tableId })
    ];

    await augmentTable(table);

    return {
        table,
        foreignKeys
    };
}

export async function augmentTable(table) {
    table = populateQueryOptions(table);
    table = await loadForeignKeyTables(table);
    return table;
}

async function loadForeignKeyTables(table) {
    // Load joinable tables
    await * table.fields.filter((f) => f.target != null).map(async (field) => {
        let targetTable = await Metabase.table_query_metadata({ tableId: field.target.table_id });
        field.target.table = populateQueryOptions(targetTable);
    });
    return table;
}

function populateQueryOptions(table) {
    table = addValidOperatorsToFields(table);

    table.fields_lookup = {};

    _.each(table.fields, function(field) {
        table.fields_lookup[field.id] = field;
        field.operators_lookup = {};
        _.each(field.valid_operators, function(operator) {
            field.operators_lookup[operator.name] = operator;
        });
    });

    return table;
};
