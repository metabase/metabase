// Database 1 contains the stripped metadata of sample dataset as of 5/24/17
import {getMetadata} from "metabase/selectors/metadata";
// Database 2 contains an imaginary multi-schema database (like Redshift for instance)
// Database 3 contains an imaginary database which doesn't have any schemas (like MySQL)

export const normalizedMetadata = {
    "metrics": {},
    "segments": {},
    "databases": {
        "1": {
            "description": null,
            "features": [
                "basic-aggregations",
                "standard-deviation-aggregations",
                "expression-aggregations",
                "foreign-keys",
                "native-parameters",
                "expressions"
            ],
            "name": "Sample Dataset",
            "caveats": null,
            "tables": [
                1,
                2,
                3,
                4
            ],
            "is_full_sync": true,
            "updated_at": "2017-05-15T18:05:07.493Z",
            "native_permissions": "write",
            "is_sample": true,
            "id": 1,
            "engine": "h2",
            "created_at": "2017-05-15T18:05:07.493Z",
            "points_of_interest": null
        },
        "2": {
            "name": "Imaginary Multi-Schema Dataset",
            "tables": [
                // In schema_1
                5,
                6,
                // In schema_2
                7,
                8,
                9
            ],
            "id": 2
        },
        "3": {
            "name": "Imaginary Schemaless Dataset",
            "tables": [
                10,
                11,
                12,
                13
            ],
            "id": 3
        }
    },
    "tables": {
        "1": {
            "description": "This is a confirmed order for a product from a user.",
            "entity_type": null,
            "schema": "PUBLIC",
            "raw_table_id": 2,
            "show_in_getting_started": false,
            "name": "ORDERS",
            "caveats": null,
            "rows": 17624,
            "updated_at": "2017-05-15T18:05:08.417Z",
            "entity_name": null,
            "active": true,
            "id": 1,
            "db_id": 1,
            "visibility_type": null,
            "display_name": "Orders",
            "created_at": "2017-05-15T18:05:07.787Z",
            "points_of_interest": null,
            "db": 1,
            // "fields": [1, 2, 3, 4, 5, 6, 7],
            "fields": [],
            "segments": [],
            "field_values": {/* stripped out */},
            "metrics": []
        },
        "2": {
            "description": "This is a user account. Note that employees and customer support staff will have accounts.",
            "entity_type": null,
            "schema": "PUBLIC",
            "raw_table_id": 3,
            "show_in_getting_started": false,
            "name": "PEOPLE",
            "caveats": null,
            "rows": 2500,
            "updated_at": "2017-05-15T18:05:08.723Z",
            "entity_name": null,
            "active": true,
            "id": 2,
            "db_id": 1,
            "visibility_type": null,
            "display_name": "People",
            "created_at": "2017-05-15T18:05:07.821Z",
            "points_of_interest": null,
            "db": 1,
            // "fields": [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
            "fields": [],
            "segments": [],
            "field_values": {/* stripped out */},
            "metrics": []
        },
        "3": {
            "description": "This is our product catalog. It includes all products ever sold by the Sample Company.",
            "entity_type": null,
            "schema": "PUBLIC",
            "raw_table_id": 1,
            "show_in_getting_started": false,
            "name": "PRODUCTS",
            "caveats": null,
            "rows": 200,
            "updated_at": "2017-05-15T18:05:08.818Z",
            "entity_name": null,
            "active": true,
            "id": 3,
            "db_id": 1,
            "visibility_type": null,
            "display_name": "Products",
            "created_at": "2017-05-15T18:05:07.854Z",
            "points_of_interest": null,
            "db": 1,
            // "fields": [21, 22, 23, 24, 25, 26, 27, 28],
            "fields": [],
            "segments": [],
            "field_values": {/* stripped out */},
            "metrics": []
        },
        "4": {
            "description": "These are reviews our customers have left on products. Note that these are not tied to orders so it is possible people have reviewed products they did not purchase from us.",
            "entity_type": null,
            "schema": "PUBLIC",
            "raw_table_id": 5,
            "show_in_getting_started": false,
            "name": "REVIEWS",
            "caveats": null,
            "rows": 1078,
            "updated_at": "2017-05-15T18:05:08.876Z",
            "entity_name": null,
            "active": true,
            "id": 4,
            "db_id": 1,
            "visibility_type": null,
            "display_name": "Reviews",
            "created_at": "2017-05-15T18:05:07.873Z",
            "points_of_interest": null,
            "db": 1,
            // "fields": [29, 30, 31, 32, 33, 34],
            "fields": [],
            "segments": [],
            "field_values": {/* stripped out */},
            "metrics": []
        },
        "5": {
            "schema": "schema_1",
            "name": "Avian Singles Messages",
            "id": 5,
            "db_id": 2
        },
        "6": {
            "schema": "schema_1",
            "name": "Avian Singles Users",
            "id": 6,
            "db_id": 2
        },
        "7": {
            "schema": "schema_2",
            "name": "Tupac Sightings Sightings",
            "id": 7,
            "db_id": 2
        },
        "8": {
            "schema": "schema_2",
            "name": "Tupac Sightings Categories",
            "id": 8,
            "db_id": 2
        },
        "9": {
            "schema": "schema_2",
            "name": "Tupac Sightings Cities",
            "id": 9,
            "db_id": 2
        },
        "10": {
            "schema": null,
            "name": "Badminton Men's Double Results",
            "id": 10,
            "db_id": 3
        },
        "11": {
            "schema": null,
            "name": "Badminton Mixed Double Results",
            "id": 11,
            "db_id": 3
        },
        "12": {
            "schema": null,
            "name": "Badminton Women's Singles Results",
            "id": 12,
            "db_id": 3
        },
        "13": {
            "schema": null,
            "name": "Badminton Mixed Singles Results",
            "id": 13,
            "db_id": 3
        },
    },
    "fields": {/* stripped out */},
    "revisions": {},
    "databasesList": [1, 2, 3]
};

export const denormalizedMetadata = getMetadata({metadata: normalizedMetadata});
