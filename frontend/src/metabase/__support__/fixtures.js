/* eslint-disable flowtype/require-valid-file-annotation */

import { TYPE } from "metabase/lib/types";
import Question from "metabase-lib/lib/Question";
import { getMetadata } from "metabase/selectors/metadata";
import { assocIn } from "icepick";

export const DATABASE_ID = 100;
export const ANOTHER_DATABASE_ID = 101;

export const MAIN_TABLE_ID = 110;
export const FOREIGN_TABLE_ID = 120;

export const MAIN_FLOAT_FIELD_ID = 111;
export const MAIN_CATEGORY_FIELD_ID = 112;
export const MAIN_DATE_FIELD_ID = 113;
export const MAIN_PK_FIELD_ID = 114;
export const MAIN_FK_FIELD_ID = 115;

export const MAIN_METRIC_ID = 116;

export const FOREIGN_PK_FIELD_ID = 121;
export const FOREIGN_TEXT_FIELD_ID = 122;

export const state = {
    metadata: {
        databases: {
            [DATABASE_ID]: {
                id: DATABASE_ID,
                name: "Mock Database",
                engine: "bigquery",
                tables: [MAIN_TABLE_ID, FOREIGN_TABLE_ID]
            },
            [ANOTHER_DATABASE_ID]: {
                id: ANOTHER_DATABASE_ID,
                name: "Mock Empty Database",
                engine: "bigquery",
                tables: []
            }

        },
        tables: {
            [MAIN_TABLE_ID]: {
                id: MAIN_TABLE_ID,
                db_id: 100,
                display_name: "Mock Table",
                fields: [
                    MAIN_FLOAT_FIELD_ID,
                    MAIN_CATEGORY_FIELD_ID,
                    MAIN_DATE_FIELD_ID,
                    MAIN_PK_FIELD_ID,
                    MAIN_FK_FIELD_ID
                ],
                metrics: [MAIN_METRIC_ID]
            },
            [FOREIGN_TABLE_ID]: {
                id: FOREIGN_TABLE_ID,
                db_id: 100,
                display_name: "Mock Foreign Table",
                fields: [
                    FOREIGN_PK_FIELD_ID,
                    FOREIGN_TEXT_FIELD_ID
                ]
            }
        },
        fields: {
            [MAIN_FLOAT_FIELD_ID]: {
                id: MAIN_FLOAT_FIELD_ID,
                table_id: MAIN_TABLE_ID,
                display_name: "Mock Float Field",
                base_type: TYPE.Float
            },
            [MAIN_CATEGORY_FIELD_ID]: {
                id: MAIN_CATEGORY_FIELD_ID,
                table_id: MAIN_TABLE_ID,
                display_name: "Mock Category Field",
                base_type: TYPE.Text,
                special_type: TYPE.Category
            },
            [MAIN_DATE_FIELD_ID]: {
                id: MAIN_DATE_FIELD_ID,
                table_id: MAIN_TABLE_ID,
                display_name: "Mock Date Field",
                base_type: TYPE.DateTime
            },
            [MAIN_PK_FIELD_ID]: {
                id: MAIN_PK_FIELD_ID,
                table_id: MAIN_TABLE_ID,
                display_name: "Mock PK Field",
                base_type: TYPE.Integer,
                special_type: TYPE.PK
            },
            [MAIN_FK_FIELD_ID]: {
                id: MAIN_FK_FIELD_ID,
                table_id: MAIN_TABLE_ID,
                display_name: "Mock FK Field",
                base_type: TYPE.Integer,
                special_type: TYPE.FK,
                fk_target_field_id: FOREIGN_PK_FIELD_ID
            },
            [FOREIGN_PK_FIELD_ID]: {
                id: FOREIGN_PK_FIELD_ID,
                table_id: FOREIGN_TABLE_ID,
                display_name: "Mock Foreign PK Field",
                base_type: TYPE.Integer,
                special_type: TYPE.PK
            },
            [FOREIGN_TEXT_FIELD_ID]: {
                id: FOREIGN_TEXT_FIELD_ID,
                table_id: FOREIGN_TABLE_ID,
                display_name: "Mock Foreign Text Field",
                base_type: TYPE.Text
            }
        },
        metrics: {
            [MAIN_METRIC_ID]: {
                id: MAIN_METRIC_ID,
                table_id: MAIN_TABLE_ID,
                name: "Mock Metric"
            }
        },
        segments: {}
    }
};

export const metadata = getMetadata(state);

export const card = {
    dataset_query: {
        type: "query",
        database: DATABASE_ID,
        query: {
            source_table: MAIN_TABLE_ID
        }
    }
};

export const clickedFloatHeader = {
    column: {
        ...metadata.fields[MAIN_FLOAT_FIELD_ID],
        source: "fields"
    }
};

export const clickedCategoryHeader = {
    column: {
        ...metadata.fields[MAIN_CATEGORY_FIELD_ID],
        source: "fields"
    }
};

export const clickedFloatValue = {
    column: {
        ...metadata.fields[MAIN_CATEGORY_FIELD_ID],
        source: "fields"
    },
    value: 1234
};

export const clickedPKValue = {
    column: {
        ...metadata.fields[MAIN_PK_FIELD_ID],
        source: "fields"
    },
    value: 42
};

export const clickedFKValue = {
    column: {
        ...metadata.fields[MAIN_FK_FIELD_ID],
        source: "fields"
    },
    value: 43
};

export const tableMetadata = metadata.tables[MAIN_TABLE_ID];

export function makeQuestion(fn = (card, state) => ({ card, state })) {
    const result = fn(card, state);
    return new Question(getMetadata(result.state), result.card);
}

export const question = makeQuestion();
export const questionNoFields = makeQuestion((card, state) => ({
    card,
    state: assocIn(state, ["metadata", "tables", MAIN_TABLE_ID, "fields"], [])
}));

export const NUM_TABLES = Object.keys(state.metadata.tables).length
export const NUM_DBS = Object.keys(state.metadata.databases).length
export const NUM_FIELDS = Object.keys(state.metadata.fields).length
export const NUM_METRICS = Object.keys(state.metadata.metrics).length
export const NUM_SEGMENTS = Object.keys(state.metadata.segments).length
