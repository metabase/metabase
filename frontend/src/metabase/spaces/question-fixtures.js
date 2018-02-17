export const QUESTIONS = [
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "0.27 downloads progress",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-15T23:25:18.728Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select count(*)\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\nand bucket='downloads.metabase.com'\nand key like 'v0.27.%'",
                "template_tags": {}
            }
        },
        "id": 381,
        "display": "progress",
        "visualization_settings": {
            "graph.colors": [
                "#F1B556",
                "#9cc177",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ],
            "progress.goal": 69000
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-29T00:44:15.587Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "month"
            },
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "100% stacked area chart",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:10.391Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            25
                        ],
                        "as",
                        "month"
                    ],
                    [
                        "fk->",
                        10,
                        16
                    ]
                ]
            }
        },
        "id": 390,
        "display": "area",
        "visualization_settings": {
            "stackable.stack_type": "normalized",
            "line.marker_enabled": false
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-30T21:52:20.227Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Value",
                "name": "value"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "#2548 bars appear in wrong order (expected: b, c, a)",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2018-01-08T22:01:32.183Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "SELECT category, value\nFROM (VALUES\n  ('b', 90),\n  ('c', 20),\n  ('a', 100)\n) AS t(category, value);"
            }
        },
        "id": 108,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-11T00:02:03.151Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "x-axis labels are not re-sorted but data points are, leading to wacky line charts",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Value",
                "name": "value"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "#2548 line data points appear in incorrect order",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-17T19:31:21.187Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "SELECT category, value\nFROM (VALUES\n  ('b', 90),\n  ('c', 20),\n  ('a', 100)\n) AS t(category, value);"
            }
        },
        "id": 109,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-11T00:04:38.274Z",
        "public_uuid": null
    },
    {
        "description": "non-overlapping values in subsequent series are appended to end of graph, and we're sorting the data points which leads to wacky lines",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Category2",
                "name": "category2"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Value",
                "name": "value"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "#2548 multiseries with non-overlapping values show data points out of order (expected: a, b, c, d)",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-17T19:31:21.154Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "SELECT category, category2, value\nFROM (VALUES\n  ('x', 'b', 1),\n  ('x', 'c', 2),\n  ('x', 'd', 3),\n  ('y', 'a', 1),\n  ('y', 'b', 2),\n  ('y', 'c', 3)\n) AS t(category, category2, value);"
            }
        },
        "id": 110,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-11T00:09:10.373Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 2,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Rating",
                "name": "RATING",
                "description": "The rating (on a scale of 1-5) the user left.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "#2549 D-D-M with numeric dimension incorrectly detected as D-M-M multiseries",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-17T19:31:22.142Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 2,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "fk->",
                        8,
                        16
                    ],
                    14
                ],
                "filter": []
            }
        },
        "id": 111,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-11T00:11:50.077Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "A",
                "name": "a"
            },
            {
                "base_type": "type/Text",
                "display_name": "B",
                "name": "b"
            },
            {
                "base_type": "type/Integer",
                "display_name": "C",
                "name": "c"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 6,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "#2771 stacked area plot shouldn't show 0 points on top of non-zero points",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2018-01-08T21:59:49.565Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 6,
            "type": "native",
            "native": {
                "query": "SELECT a,b,c\nFROM (values\n  ('a', 'w', 1),\n  ('a', 'x', 1),\n  ('a', 'y', 1),\n  ('a', 'z', 1),\n  ('b', 'y', 1),\n  ('b', 'z', 1),\n  ('c', 'w', 1),\n  ('c', 'x', 1),\n  ('c', 'y', 1),\n  ('c', 'z', 1)\n) as t(a,b,c);",
                "collection": "acquisitions"
            }
        },
        "id": 132,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-09T00:16:21.289Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "hour-of-day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "#2819 \"hour of day\" data points should be in correct order",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-11-21T18:15:15.953Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        25,
                        "as",
                        "hour-of-day"
                    ]
                ],
                "filter": []
            }
        },
        "id": 124,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-23T21:35:30.447Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "?column?",
                "name": "?column?"
            },
            {
                "base_type": "type/Integer",
                "display_name": "?column? 2",
                "name": "?column?_2"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 6,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "#2898 bar graphs barf when a row comes back with a \"null\"",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-17T19:31:21.235Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 6,
            "type": "native",
            "native": {
                "query": "SELECT 'A', 2\nUNION ALL SELECT 'B', 5\nUNION ALL SELECT null, 8",
                "collection": "acquisitions"
            }
        },
        "id": 130,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-04T08:27:09.440Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Description",
                "name": "description"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ts",
                "name": "ts"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Ammonium",
                "name": "ammonium"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Nitrogen",
                "name": "nitrogen"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 6,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "#3095 single series w/ custom columns not displaying correctly",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-11-02T18:26:26.345Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 6,
            "type": "native",
            "native": {
                "query": "select id, description, ts, ammonium, nitrogen\nfrom \n(VALUES \n    (1, 'testbatch 1', '2016-06-30 00:21', 0.83, 0.80)\n  , (2, 'testbatch 2', '2016-07-10 00:21', 0.85, 0.95)\n  , (3, 'testbatch 3', '2016-07-11 00:21', 0.86, 0.98)\n  , (4, 'testbatch 4', '2016-07-20 00:21', 0.81, 0.94)\n  , (5, 'testbatch 5', '2016-07-21 00:21', 0.80, 0.96)\n  ) as t(id, description, ts, ammonium, nitrogen)",
                "collection": "acquisitions"
            }
        },
        "id": 129,
        "display": "line",
        "visualization_settings": {
            "graph.dimensions": [
                "description"
            ],
            "graph.metrics": [
                "ammonium"
            ]
        },
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-04T08:04:47.601Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Id",
                "name": "ID",
                "description": "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "default"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Product ID",
                "name": "PRODUCT_ID",
                "description": "The product ID. This is an internal identifier for the product, NOT the SKU.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Float",
                "display_name": "Subtotal",
                "name": "SUBTOTAL",
                "description": "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Tax",
                "name": "TAX",
                "description": "This is the amount of local and federal taxes that are collected on the purchase. Note that other governmental fees on some products are not included here, but instead are accounted for in the subtotal.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Total",
                "name": "TOTAL",
                "description": "The total billed amount."
            },
            {
                "base_type": "type/Integer",
                "display_name": "User Id",
                "name": "USER_ID",
                "description": "The id of the user who made this order. Note that in some cases where an order was created on behalf of a customer who phoned the order in, this might be the employee who handled the request.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Product ID",
                "name": "TITLE",
                "description": "The name of the product as it should be displayed to customers.",
                "special_type": "type/Name"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "#4209: Better display of queries that return no data in dashboards",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-17T19:31:22.152Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            15
                        ],
                        1000000
                    ]
                ]
            }
        },
        "id": 213,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-02-21T19:06:17.179Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "D",
                "name": "d"
            },
            {
                "base_type": "type/Integer",
                "display_name": "C",
                "name": "c"
            }
        ],
        "creator": {
            "email": "cam@metabase.com",
            "first_name": "Cam",
            "last_login": "2018-01-02T23:47:22.792Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 6,
            "last_name": "Saul",
            "date_joined": "2015-10-24T16:00:48.515Z",
            "common_name": "Cam Saul"
        },
        "database_id": 12,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "4802 Canary Card",
        "in_public_dashboard": false,
        "creator_id": 6,
        "updated_at": "2017-10-20T00:39:40.504Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 12,
            "type": "native",
            "native": {
                "query": "SELECT '2017-10-01'::date AS d, 3 AS c\nUNION\nSELECT '2017-10-02'::date AS d, 4 AS c\nUNION\nSELECT '2017-10-03'::date AS d, NULL AS c\nUNION\nSELECT '2017-10-04'::date AS d, 2 AS c\nUNION\nSELECT '2017-10-05'::date AS d, 4 AS c\nUNION\nSELECT '2017-10-06'::date AS d, NULL AS c\nUNION\nSELECT '2017-10-07'::date AS d, 9 AS c\nUNION\nSELECT '2017-10-08'::date AS d, 6 AS c",
                "collection": "activity",
                "template_tags": {}
            }
        },
        "id": 348,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-20T00:39:40.504Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "quarter"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "#5221 table",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-20T22:55:29.541Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            25
                        ],
                        "as",
                        "quarter"
                    ]
                ]
            }
        },
        "id": 260,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-30T21:39:41.399Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "quarter"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "#5221 test",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-06T23:07:04.802Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            25
                        ],
                        "as",
                        "quarter"
                    ]
                ]
            }
        },
        "id": 259,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-30T21:37:34.315Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "X",
                "name": "X"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "#5343 test",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-09-28T17:13:00.793Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select * where true [[and {{param_demo_template_tag}}]]",
                "collection": "ORDERS",
                "template_tags": {
                    "param_demo_template_tag": {
                        "id": "3fdd3be5-d315-4628-3616-0dcba02c60b5",
                        "name": "param_demo_template_tag",
                        "display_name": "Param demo template tag",
                        "type": "text",
                        "required": false
                    }
                }
            }
        },
        "id": 282,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-01T22:22:11.149Z",
        "public_uuid": null,
        spaces: [2, 3]
    },
    {
        "description": "Count of downloads from the past 7 days",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "7 Day Downloads",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-13T01:54:44.221Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "METRIC",
                        2
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "TIME_INTERVAL",
                        49,
                        -7,
                        "day"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 5,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-10-24T15:43:16.351Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "",
        "archived": false,
        "labels": [],
        "table_id": 7,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "7-Day  time filter canary card",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:22:48.522Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    58
                ],
                "filter": [
                    "AND",
                    [
                        "TIME_INTERVAL",
                        58,
                        -7,
                        "day"
                    ]
                ]
            }
        },
        "id": 28,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-21T19:50:03.255Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Event Label",
                "name": "ga:eventLabel",
                "description": "Event label."
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Actions usage",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-04T18:02:33.568Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6938
                        ],
                        "Actions"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-05-09"
                    ],
                    [
                        "!=",
                        [
                            "field-id",
                            6939
                        ],
                        "(not set)"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        6939
                    ]
                ]
            }
        },
        "id": 293,
        "display": "table",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ],
            "table.column_widths": [
                222
            ]
        },
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T18:02:33.568Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "?column?",
                "name": "?column?"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Active installation growth, yesterday vs. 31 days ago",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-05T18:19:46.166Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "Select (\n    100*\n    (\n        (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('day', \"public\".\"entries\".\"time\") = date_trunc('day', (NOW() + INTERVAL '-1 day')))\n            )  \n            - \n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count2\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('day', \"public\".\"entries\".\"time\") = date_trunc('day', (NOW() + INTERVAL '-31 day')))\n            )\n        )\n        /\n        (cast (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count2\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('day', \"public\".\"entries\".\"time\") = date_trunc('day', (NOW() + INTERVAL '-31 day')))\n            )\n            as float\n            )\n        )\n    )\n) ",
                "template_tags": {}
            },
            "parameters": []
        },
        "id": 281,
        "display": "scalar",
        "visualization_settings": {
            "graph.colors": [
                "#A989C5",
                "#9CC177",
                "#A989C5",
                "#EF8C8C",
                "#f9d45c"
            ],
            "scalar.suffix": " %"
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-01T22:08:58.975Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "These are installations that phone home for new versions. Believed to be fairly accurate, except for instances that have common ips, so this significantly undercounts active mac installations.",
        "archived": false,
        "labels": [
            {
                "id": 19,
                "name": "User Behavior",
                "slug": "user_behavior",
                "icon": "#2D86D4"
            }
        ],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Active installations",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-05T19:03:13.082Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            80
                        ],
                        -180,
                        "day"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ]
            }
        },
        "id": 142,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 5000,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000,
            "graph.y_axis.auto_split": true
        },
        "collection": null,
        "favorite": false,
        "created_at": "2016-09-06T19:30:56.464Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "month"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Active Installations, July 2016",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-28T03:50:38.611Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "BETWEEN",
                        80,
                        "2016-07-01",
                        "2016-07-31"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ]
            }
        },
        "id": 154,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-11-10T19:01:41.277Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Test description",
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Active Installations, June 2016",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-07T00:25:00.171Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "BETWEEN",
                        80,
                        "2016-06-01",
                        "2016-06-30"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ]
            }
        },
        "id": 157,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-11-10T19:04:43.603Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Active Installations, Oct 2016",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-07T00:25:16.282Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "BETWEEN",
                        80,
                        "2016-10-01",
                        "2016-10-31"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ]
            }
        },
        "id": 155,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-11-10T19:02:17.865Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Active Installations over time",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-12T19:11:52.484Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 330,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 10000,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000,
            "progress.goal": 10000,
            "progress.color": "#509EE3"
        },
        "collection": null,
        "favorite": false,
        "created_at": "2017-10-16T23:10:43.014Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "query",
        "name": "Active installations, rolling 90 day window",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-10T23:33:29.359Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            80
                        ],
                        -90,
                        "day"
                    ]
                ]
            }
        },
        "id": 220,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": false,
            "graph.goal_value": 2500,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-21T16:32:20.606Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "query",
        "name": "Active installations this month so far",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-03T00:51:27.017Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            80
                        ],
                        "current",
                        "month"
                    ]
                ]
            }
        },
        "id": 228,
        "display": "scalar",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 5000,
            "graph.y_axis.auto_range": false,
            "graph.y_axis.max": 6000
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-29T18:42:20.149Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Active Installations Yesterday",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2017-12-12T19:15:40.085Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "METRIC",
                        17
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "TIME_INTERVAL",
                        80,
                        -1,
                        "day"
                    ]
                ]
            }
        },
        "id": 191,
        "display": "progress",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 2500,
            "graph.y_axis.auto_range": false,
            "graph.y_axis.max": 3000,
            "progress.goal": 6000,
            "progress.color": "#509EE3"
        },
        "collection": null,
        "favorite": false,
        "created_at": "2016-12-19T23:51:29.153Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Active Installs",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-12-28T22:58:00.399Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "/",
                        [
                            "count"
                        ],
                        2
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 344,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 2500,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000,
            "progress.goal": 10000,
            "progress.color": "#509EE3"
        },
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": true,
        "created_at": "2017-10-17T01:25:25.532Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            },
            {
                "base_type": "type/Text",
                "display_name": "Major Version",
                "name": "Major Version"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Active Installs by Major Version, last 30 days",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:04:16.117Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "SELECT count(*) AS \"count\", (regexp_matches(version, '^(v[0-9]+\\.2[1-9]+)'))[1] as \"Major Version\"\nFROM \"public\".\"usage_stats\"\nWHERE CAST(\"public\".\"usage_stats\".\"ts\" AS date) BETWEEN CAST((NOW() + INTERVAL '-30 day') AS date)\n   AND CAST((NOW() + INTERVAL '-1 day') AS date)\nGROUP BY \"Major Version\"\nORDER BY \"Major Version\" ASC",
                "template_tags": {}
            }
        },
        "id": 295,
        "display": "row",
        "visualization_settings": {
            "graph.dimensions": [
                "Major Version"
            ],
            "graph.metrics": [
                "count"
            ]
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T22:50:25.338Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            },
            {
                "base_type": "type/Text",
                "display_name": "Major Version",
                "name": "Major Version"
            },
            {
                "base_type": "type/Date",
                "display_name": "Ts",
                "name": "ts"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Active Installs by Major Version over time, last 60 days",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-05T18:19:38.634Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "SELECT count(*) AS \"count\",\n    (regexp_matches(version, '^(v[0-9]+\\.[2-9]+[1-5]+)'))[1] as \"Major Version\",\n    CAST(\"public\".\"usage_stats\".\"ts\" AS date)\nFROM \"public\".\"usage_stats\"\nWHERE CAST(\"public\".\"usage_stats\".\"ts\" AS date) BETWEEN CAST((NOW() + INTERVAL '-90 day') AS date)\n   AND CAST((NOW() + INTERVAL '-1 day') AS date)\nGROUP BY \"Major Version\", CAST(\"public\".\"usage_stats\".\"ts\" AS date)\nORDER BY \"Major Version\", CAST(\"public\".\"usage_stats\".\"ts\" AS date) ASC",
                "template_tags": {}
            }
        },
        "id": 296,
        "display": "area",
        "visualization_settings": {
            "graph.dimensions": [
                "ts",
                "Major Version"
            ],
            "graph.metrics": [
                "count"
            ],
            "stackable.stack_type": "stacked"
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-09T00:20:22.718Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "This is the new definition that uses `count / 2` (because we poll for updates twice a day). The old definition was producing suspect results.",
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Active Installs, past 90 days",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2017-12-05T19:15:27.289Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "METRIC",
                        17
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            80
                        ],
                        -90,
                        "day"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 382,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 10000,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000,
            "progress.goal": 10000,
            "progress.color": "#509EE3",
            "graph.y_axis.title_text": "Active Instances"
        },
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-29T21:51:41.554Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Active instances x-ray test - maz",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-04T19:56:36.898Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "METRIC",
                        17
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "<",
                        [
                            "field-id",
                            80
                        ],
                        "2017-12-31"
                    ]
                ]
            }
        },
        "id": 395,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 10000,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000,
            "progress.goal": 10000,
            "progress.color": "#509EE3",
            "graph.y_axis.title_text": "Active Instances"
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2018-01-04T19:53:23.727Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 20,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Event Id",
                "name": "event_id",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ab Fl",
                "name": "ab_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass10 Fld Cd",
                "name": "ass10_fld_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass1 Fld Cd",
                "name": "ass1_fld_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass2 Fld Cd",
                "name": "ass2_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass3 Fld Cd",
                "name": "ass3_fld_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass4 Fld Cd",
                "name": "ass4_fld_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass5 Fld Cd",
                "name": "ass5_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass6 Fld Cd",
                "name": "ass6_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass7 Fld Cd",
                "name": "ass7_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass8 Fld Cd",
                "name": "ass8_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ass9 Fld Cd",
                "name": "ass9_fld_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Away Score Ct",
                "name": "away_score_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "Away Team Id",
                "name": "away_team_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Balls Count",
                "name": "balls_ct"
            },
            {
                "base_type": "type/Text",
                "display_name": "Base1 Run Id",
                "name": "base1_run_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Base2 Force Fl",
                "name": "base2_force_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Base2 Run Id",
                "name": "base2_run_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Base3 Force Fl",
                "name": "base3_force_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Base3 Run Id",
                "name": "base3_run_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Base4 Force Fl",
                "name": "base4_force_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Dest Id",
                "name": "bat_dest_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Event Fl",
                "name": "bat_event_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Fate Id",
                "name": "bat_fate_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Fld Cd",
                "name": "bat_fld_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Hand Cd",
                "name": "bat_hand_cd",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Home Id",
                "name": "bat_home_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Id",
                "name": "bat_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat In Hold Id",
                "name": "bat_in_hold_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Last Id",
                "name": "bat_last_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Lineup Id",
                "name": "bat_lineup_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat On Deck Id",
                "name": "bat_on_deck_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Play Tx",
                "name": "bat_play_tx"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Safe Err Fl",
                "name": "bat_safe_err_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Start Fl",
                "name": "bat_start_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Team Id",
                "name": "bat_team_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Battedball Cd",
                "name": "battedball_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Battedball Loc Tx",
                "name": "battedball_loc_tx"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bunt Fl",
                "name": "bunt_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Dp Fl",
                "name": "dp_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "End Bases Cd",
                "name": "end_bases_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Err1 Cd",
                "name": "err1_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Err1 Fld Cd",
                "name": "err1_fld_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Err2 Cd",
                "name": "err2_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Err2 Fld Cd",
                "name": "err2_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Err3 Cd",
                "name": "err3_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Err3 Fld Cd",
                "name": "err3_fld_cd"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Err Ct",
                "name": "err_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "Event Cd",
                "name": "event_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Event Outs Ct",
                "name": "event_outs_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Event Runs Ct",
                "name": "event_runs_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "Event Tx",
                "name": "event_tx",
                "special_type": "type/Description"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Fate Runs Ct",
                "name": "fate_runs_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "Fld Cd",
                "name": "fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Fielder ID",
                "name": "fld_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Fielder's Team ID",
                "name": "fld_team_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Foul Fl",
                "name": "foul_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Game End Fl",
                "name": "game_end_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Game ID",
                "name": "game_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Game New Fl",
                "name": "game_new_fl"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Game PA Ct",
                "name": "game_pa_ct",
                "description": "How many total plate appearances were made in the game",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "H Cd",
                "name": "h_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Home Score Ct",
                "name": "home_score_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "Home Team ID",
                "name": "home_team_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Inning Ct",
                "name": "inn_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "Inning End Fl",
                "name": "inn_end_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Inning New Fl",
                "name": "inn_new_fl"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Inning PA Count",
                "name": "inn_pa_ct",
                "description": "How many plate appearances have been made in the inning so far",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Inning Runs Count",
                "name": "inn_runs_ct",
                "description": "How many runs have been scored in the inning so far",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "Leadoff Fl",
                "name": "leadoff_fl"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Outs Count",
                "name": "outs_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Ball Count",
                "name": "pa_ball_ct",
                "description": "The total count of balls when this event occurred",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Called Ball Count",
                "name": "pa_called_ball_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Called Strike Count",
                "name": "pa_called_strike_ct",
                "description": "How many called strikes in this plate appearance so far",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Foul Strike Count",
                "name": "pa_foul_strike_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Hitbatter Ball Count",
                "name": "pa_hitbatter_ball_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Inplay Strike Count",
                "name": "pa_inplay_strike_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Intent Ball Count",
                "name": "pa_intent_ball_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "PA New Fl",
                "name": "pa_new_fl"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Other Ball Count",
                "name": "pa_other_ball_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Other Strike Count",
                "name": "pa_other_strike_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Pitchout Ball Count",
                "name": "pa_pitchout_ball_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Strike Count",
                "name": "pa_strike_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "PA Swinging Miss Strike Ct",
                "name": "pa_swingmiss_strike_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pa Trunc Fl",
                "name": "pa_trunc_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pb Fl",
                "name": "pb_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ph Fl",
                "name": "ph_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pit Hand Cd",
                "name": "pit_hand_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pitcher ID",
                "name": "pit_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pit Start Fl",
                "name": "pit_start_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pitch Seq Tx",
                "name": "pitch_seq_tx",
                "special_type": "type/Description"
            },
            {
                "base_type": "type/Text",
                "display_name": "Po1 Fld Cd",
                "name": "po1_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Po2 Fld Cd",
                "name": "po2_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Po3 Fld Cd",
                "name": "po3_fld_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pos2 Fld Id",
                "name": "pos2_fld_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pos3 Fld Id",
                "name": "pos3_fld_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pos4 Fld Id",
                "name": "pos4_fld_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pos5 Fld Id",
                "name": "pos5_fld_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pos6 Fld Id",
                "name": "pos6_fld_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pos7 Fld Id",
                "name": "pos7_fld_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pos8 Fld Id",
                "name": "pos8_fld_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pos9 Fld Id",
                "name": "pos9_fld_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pr Run1 Fl",
                "name": "pr_run1_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pr Run2 Fl",
                "name": "pr_run2_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pr Run3 Fl",
                "name": "pr_run3_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "RBI Count",
                "name": "rbi_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "Removed For PH Bat Fld Cd",
                "name": "removed_for_ph_bat_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Removed For PH Bat Id",
                "name": "removed_for_ph_bat_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Removed For PR Run1 Id",
                "name": "removed_for_pr_run1_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Removed For PR Run2 Id",
                "name": "removed_for_pr_run2_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Removed For Pr Run3 Id",
                "name": "removed_for_pr_run3_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Resp Bat Hand Cd",
                "name": "resp_bat_hand_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Responsible Batter ID",
                "name": "resp_bat_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Responsible Batter Start Fl",
                "name": "resp_bat_start_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Responsible Pitcher Hand Cd",
                "name": "resp_pit_hand_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Responsible Pitcher ID",
                "name": "resp_pit_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Responsible Pitcher Start Fl",
                "name": "resp_pit_start_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 CS Fl",
                "name": "run1_cs_fl",
                "description": "Runner caught stealing",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 Destination ID",
                "name": "run1_dest_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 Fate Id",
                "name": "run1_fate_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 Fld Cd",
                "name": "run1_fld_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 Lineup Cd",
                "name": "run1_lineup_cd",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 Origin Event Id",
                "name": "run1_origin_event_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 Pk Fl",
                "name": "run1_pk_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 Play Tx",
                "name": "run1_play_tx",
                "special_type": "type/Description"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 Resp Cat Id",
                "name": "run1_resp_cat_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 Resp Pit Id",
                "name": "run1_resp_pit_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run1 SB Fl",
                "name": "run1_sb_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 CS Fl",
                "name": "run2_cs_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 Dest Id",
                "name": "run2_dest_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 Fate Id",
                "name": "run2_fate_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 Fld Cd",
                "name": "run2_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 Lineup Cd",
                "name": "run2_lineup_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 Origin Event Id",
                "name": "run2_origin_event_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 Pk Fl",
                "name": "run2_pk_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 Play Tx",
                "name": "run2_play_tx"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 Responsible Catcher ID",
                "name": "run2_resp_cat_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 Responsible Pitcher ID",
                "name": "run2_resp_pit_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run2 SB Fl",
                "name": "run2_sb_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Cs Fl",
                "name": "run3_cs_fl",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Dest Id",
                "name": "run3_dest_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Fate Id",
                "name": "run3_fate_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Fld Cd",
                "name": "run3_fld_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Lineup Cd",
                "name": "run3_lineup_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Origin Event ID",
                "name": "run3_origin_event_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Pk Fl",
                "name": "run3_pk_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Play Text",
                "name": "run3_play_tx",
                "special_type": "type/Description"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Resp Cat Id",
                "name": "run3_resp_cat_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 Resp Pit Id",
                "name": "run3_resp_pit_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Run3 SB Fl",
                "name": "run3_sb_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "SF Fl",
                "name": "sf_fl",
                "description": "Sacrifice fly"
            },
            {
                "base_type": "type/Text",
                "display_name": "SH Fl",
                "name": "sh_fl",
                "description": "Sacrifice hit"
            },
            {
                "base_type": "type/Text",
                "display_name": "Start Bases Cd",
                "name": "start_bases_cd"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Start Bat Score Ct",
                "name": "start_bat_score_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Start Fld Score Ct",
                "name": "start_fld_score_ct",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Strikes Ct",
                "name": "strikes_ct",
                "description": "The current count of strikes",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Text",
                "display_name": "TP Fl",
                "name": "tp_fl",
                "description": "Either Triple Play, or Total Pitches? I think it's the former."
            },
            {
                "base_type": "type/Text",
                "display_name": "Uncertain Play Exc Fl",
                "name": "uncertain_play_exc_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "Unknown Out Exc Fl",
                "name": "unknown_out_exc_fl"
            },
            {
                "base_type": "type/Text",
                "display_name": "WP Fl",
                "name": "wp_fl",
                "description": "Wild pitch"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "All baseball events",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-12T23:59:13.631Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 20
            }
        },
        "id": 243,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-04-26T20:49:43.638Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:users",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "All Time Website Visitors",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-16T01:13:28.087Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ]
            }
        },
        "id": 402,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2018-01-16T01:13:28.087Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3279,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 17,
        "enable_embedding": false,
        "collection_id": 22,
        "query_type": "query",
        "name": "Average flow run time (all branches)",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-15T19:37:39.561Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 17,
            "type": "query",
            "query": {
                "source_table": 3279,
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            14921
                        ],
                        "run-time \"yarn run flow\""
                    ]
                ],
                "aggregation": [
                    [
                        "avg",
                        [
                            "field-id",
                            14919
                        ]
                    ]
                ]
            }
        },
        "id": 356,
        "display": "scalar",
        "visualization_settings": {
            "table.column_widths": [
                null,
                null,
                null,
                null,
                null,
                null,
                198
            ],
            "scalar.suffix": "s"
        },
        "collection": {
            "id": 22,
            "name": "Code stats",
            "slug": "code_stats",
            "description": null,
            "color": "#7172AD",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-01T22:42:49.923Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3279,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 17,
        "enable_embedding": false,
        "collection_id": 22,
        "query_type": "query",
        "name": "Average frontend integration test run time",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-15T19:37:40.035Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 17,
            "type": "query",
            "query": {
                "source_table": 3279,
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            14921
                        ],
                        "run-time \"yarn run test-integrated\""
                    ]
                ],
                "aggregation": [
                    [
                        "avg",
                        [
                            "field-id",
                            14919
                        ]
                    ]
                ]
            }
        },
        "id": 360,
        "display": "scalar",
        "visualization_settings": {
            "scalar.suffix": "s"
        },
        "collection": {
            "id": 22,
            "name": "Code stats",
            "slug": "code_stats",
            "description": null,
            "color": "#7172AD",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-01T23:22:55.999Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3279,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 17,
        "enable_embedding": false,
        "collection_id": 22,
        "query_type": "query",
        "name": "Average frontend unit test run time",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-15T19:37:39.415Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 17,
            "type": "query",
            "query": {
                "source_table": 3279,
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            14921
                        ],
                        "run-time \"yarn run test-unit\""
                    ]
                ],
                "aggregation": [
                    [
                        "avg",
                        [
                            "field-id",
                            14919
                        ]
                    ]
                ]
            }
        },
        "id": 359,
        "display": "scalar",
        "visualization_settings": {
            "scalar.suffix": "s"
        },
        "collection": {
            "id": 22,
            "name": "Code stats",
            "slug": "code_stats",
            "description": null,
            "color": "#7172AD",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-01T23:21:16.359Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Average NPS",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:04.122Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "avg",
                    532
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        ">",
                        537,
                        "2016-05-03"
                    ]
                ]
            }
        },
        "id": 94,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-05T19:20:21.297Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 21,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Away Team ID",
                "name": "away_team_id",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Integer",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "Average number of runs a team scores per away game",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2017-12-12T23:23:58.535Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 21,
                "aggregation": [
                    "avg",
                    379
                ],
                "breakout": [
                    381
                ],
                "filter": []
            }
        },
        "id": 88,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-21T19:25:49.854Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 21,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "Average number of runs a team scores per home game",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2017-01-04T19:07:42.277Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 21,
                "aggregation": [
                    "METRIC",
                    10
                ],
                "breakout": [
                    419
                ],
                "filter": []
            }
        },
        "id": 87,
        "display": "bar",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 4
        },
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-21T19:24:40.565Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "State",
                "name": "STATE",
                "description": "The state or province of the account’s billing address",
                "special_type": "type/State"
            },
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Average order subtotal by state",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T00:49:13.996Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "avg",
                        [
                            "field-id",
                            15
                        ]
                    ]
                ],
                "breakout": [
                    [
                        "fk->",
                        5,
                        33
                    ]
                ]
            }
        },
        "id": 268,
        "display": "map",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-16T22:40:46.858Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "Presumably in MPH?",
        "archived": false,
        "labels": [],
        "table_id": 13,
        "result_metadata": [
            {
                "base_type": "type/Decimal",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Average Speed",
        "in_public_dashboard": true,
        "creator_id": 5,
        "updated_at": "2017-09-12T21:08:29.997Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13,
                "aggregation": [
                    [
                        "avg",
                        102
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        8
                    ]
                ]
            }
        },
        "id": 105,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-02T17:02:05.302Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "The average number of days all open bugs have been open for.",
        "archived": false,
        "labels": [
            {
                "id": 11,
                "name": "Bug Tracking",
                "slug": "bug_tracking",
                "icon": "#ED6E6E"
            }
        ],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Avg age of Open Bugs",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-04-06T21:15:21.453Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "select floor(avg(age))\nfrom (\n    select ((date_part('month', age(current_date, created_at)) * 30) + date_part('day', age(current_date, created_at))) as age\n    from metabase_issues \n    where (labels like '%Bug%' or labels like '%bug%')\n    and state = 'open'\n) a;"
            }
        },
        "id": 34,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-25T05:55:16.047Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date the product was added to our catalog.",
                "unit": "quarter"
            },
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 18,
        "query_type": "query",
        "name": "Avg Product Rating by category per quarter",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-05T19:03:34.775Z",
        "made_public_by_id": 2,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 3,
                "aggregation": [
                    [
                        "avg",
                        27
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        29,
                        "as",
                        "quarter"
                    ],
                    16
                ]
            }
        },
        "id": 115,
        "display": "bar",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 4.4
        },
        "collection": {
            "id": 18,
            "name": "Sample Dataset",
            "slug": "sample_dataset",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-17T21:19:09.473Z",
        "public_uuid": "272910f2-42f2-4b52-bf1a-142b5908f507",
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 21,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "Avg. runs, away team",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-03T00:49:03.567Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 21,
                "aggregation": [
                    [
                        "avg",
                        379
                    ]
                ]
            }
        },
        "id": 230,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-30T18:26:37.232Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 21,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "Avg. runs, home team",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-03T00:49:06.091Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 21,
                "aggregation": [
                    [
                        "METRIC",
                        10
                    ]
                ]
            }
        },
        "id": 226,
        "display": "scalar",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 4
        },
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-27T17:49:35.223Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "Combined scores of home and away teams. Modern ballparks only.",
        "archived": false,
        "labels": [],
        "table_id": 21,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Park ID",
                "name": "park_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "Avg. total runs per game, by ballpark",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:10.309Z",
        "made_public_by_id": 2,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 21,
                "aggregation": [
                    [
                        "avg",
                        [
                            "expression",
                            "Total Runs"
                        ]
                    ]
                ],
                "breakout": [
                    427
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        9
                    ],
                    [
                        "NOT_NULL",
                        [
                            "field-id",
                            427
                        ]
                    ]
                ],
                "expressions": {
                    "Total Runs": [
                        "+",
                        [
                            "field-id",
                            417
                        ],
                        [
                            "field-id",
                            379
                        ]
                    ]
                },
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ],
                "limit": 25
            }
        },
        "id": 89,
        "display": "row",
        "visualization_settings": {
            "line": {
                "lineColor": "#EF8C8C",
                "marker_fillColor": "#EF8C8C",
                "marker_lineColor": "#EF8C8C"
            },
            "area": {
                "fillColor": "#EF8C8C"
            },
            "bar": {
                "color": "#EF8C8C"
            }
        },
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-22T18:00:02.323Z",
        "public_uuid": "20f831f6-9492-480b-9458-9c5da2efc437",
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 2,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Id",
                "name": "ID",
                "description": "A unique internal identifier for the review. Should not be used externally.",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Body",
                "name": "BODY",
                "description": "The review the user left. Limited to 2000 characters.",
                "special_type": "type/Description"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The day and time a review was written by a user.",
                "unit": "default"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Product Id",
                "name": "PRODUCT_ID",
                "description": "The product the review was for",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Rating",
                "name": "RATING",
                "description": "The rating (on a scale of 1-5) the user left.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Reviewer",
                "name": "REVIEWER",
                "description": "The user who left the review"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Bad reviews yesterday",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:00:00.687Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 2,
                "filter": [
                    "AND",
                    [
                        "<",
                        [
                            "field-id",
                            14
                        ],
                        3
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            22
                        ],
                        -1,
                        "day"
                    ]
                ]
            }
        },
        "id": 374,
        "display": "table",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-11-09T00:09:56.042Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 39,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Batting Handedness",
                "name": "bat_hand_cd",
                "description": "Hand used for batting",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "First Name",
                "name": "first_name_tx",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Last Name",
                "name": "last_name_tx",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Throwing Handedness",
                "name": "pit_hand_cd",
                "description": "Hand used for throwing",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Player Id",
                "name": "player_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Position",
                "name": "pos_tx",
                "description": "Defensive position played",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Team",
                "name": "team_tx",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Year",
                "name": "year",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "Baseball Players",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-12-06T01:06:56.248Z",
        "made_public_by_id": 2,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 39,
                "filter": [
                    "AND",
                    [
                        "BETWEEN",
                        [
                            "field-id",
                            520
                        ],
                        2008,
                        2017
                    ]
                ]
            }
        },
        "id": 254,
        "display": "table",
        "visualization_settings": {
            "table.columns": [
                {
                    "name": "player_id",
                    "enabled": true
                },
                {
                    "name": "year",
                    "enabled": false
                },
                {
                    "name": "bat_hand_cd",
                    "enabled": false
                },
                {
                    "name": "first_name_tx",
                    "enabled": true
                },
                {
                    "name": "last_name_tx",
                    "enabled": true
                },
                {
                    "name": "pit_hand_cd",
                    "enabled": false
                },
                {
                    "name": "pos_tx",
                    "enabled": false
                },
                {
                    "name": "team_tx",
                    "enabled": true
                }
            ]
        },
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-19T22:44:39.385Z",
        "public_uuid": "36924e3e-dbaa-47cc-b9b0-a660bd66b9ed",
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Year",
                "name": "year"
            },
            {
                "base_type": "type/Text",
                "display_name": "Player ID",
                "name": "player_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "Last Name Tx",
                "name": "last_name_tx"
            },
            {
                "base_type": "type/Text",
                "display_name": "First Name Tx",
                "name": "first_name_tx"
            },
            {
                "base_type": "type/Text",
                "display_name": "Bat Hand Cd",
                "name": "bat_hand_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pit Hand Cd",
                "name": "pit_hand_cd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Team Tx",
                "name": "team_tx"
            },
            {
                "base_type": "type/Text",
                "display_name": "Pos Tx",
                "name": "pos_tx"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "native",
        "name": "Baseball roster",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-12-06T01:07:01.106Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "native",
            "native": {
                "query": "select * from rosters limit 100;",
                "collection": "events",
                "template_tags": {}
            }
        },
        "id": 352,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-24T21:32:21.013Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Version",
                "name": "version"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "native",
        "name": "Breakout multiseries test",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-12-01T23:12:46.227Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select (regexp_matches(key, '^(v[0-9]+\\.[0-9]+)'))[1] as version, count(*)\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\ngroup by 1 order by 1 asc"
            }
        },
        "id": 206,
        "display": "pie",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-01-25T21:09:07.190Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [
            {
                "id": 11,
                "name": "Bug Tracking",
                "slug": "bug_tracking",
                "icon": "#ED6E6E"
            }
        ],
        "table_id": 10,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Closed At",
                "name": "closed_at",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Bugs closed per day",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:04:21.315Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 10,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        86,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        89,
                        "Bug"
                    ],
                    [
                        ">",
                        86,
                        "2015-07-13"
                    ]
                ]
            }
        },
        "id": 190,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-16T19:05:04.172Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 11,
                "name": "Bug Tracking",
                "slug": "bug_tracking",
                "icon": "#ED6E6E"
            },
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Bugs open 7+ days",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-04-06T21:15:21.452Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "select count(*) \nfrom metabase_issues \nwhere (labels like '%Bug%' or labels like '%bug%')\nand state = 'open'\nand created_at < current_date - interval '7 days';"
            }
        },
        "id": 33,
        "display": "scalar",
        "visualization_settings": {
            "scalar.suffix": " 🐛",
            "scalar.prefix": "🐛 "
        },
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-25T01:26:52.774Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "Any bug that's been opened within the past 7 days",
        "archived": false,
        "labels": [
            {
                "id": 11,
                "name": "Bug Tracking",
                "slug": "bug_tracking",
                "icon": "#ED6E6E"
            }
        ],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Bugs that need fixing!!",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-04-06T21:15:21.454Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "SELECT number, CONCAT('https://github.com/metabase/metabase/issues/',number) as url, title, to_char(created_at, 'Mon dd') as created\nFROM metabase_issues\nWHERE (labels like '%Bug%' or labels like '%Bug%')\nAND closed_at is NULL\nAND created_at > now() - interval '7 days'"
            }
        },
        "id": 44,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-29T05:38:21.841Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Event Action",
                "name": "ga:eventAction",
                "description": "Event action."
            },
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Caching usage per week",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-04T18:15:37.667Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6938
                        ],
                        "General Settings"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-05-09"
                    ],
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6937
                        ],
                        "cach"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        6937
                    ],
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "week"
                    ]
                ]
            }
        },
        "id": 294,
        "display": "bar",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ]
        },
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T18:15:37.667Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Cards",
                "name": "# Cards"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "# Cards per Dashboard",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-11-20T18:58:37.440Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Cards\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'dashboard'->'num_cards_per_dash' as col,\njson_object_keys(stats->'dashboard'->'num_cards_per_dash') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 169,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:50:08.679Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Cards",
                "name": "# Cards"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "# Cards per Label",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:41.277Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Cards\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'label'->'num_cards_per_label' as col,\njson_object_keys(stats->'label'->'num_cards_per_label') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 172,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:53:13.831Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Pulses",
                "name": "# Pulses"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "# Cards per Pulse",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:48.141Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Pulses\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'pulse'->'num_cards_per_pulses' as col,\njson_object_keys(stats->'pulse'->'num_cards_per_pulses') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 175,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:55:59.597Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 13,
                "name": "Cat Facts",
                "slug": "cat_facts",
                "icon": ":cat:"
            }
        ],
        "table_id": 13,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp_seconds",
                "special_type": "type/UNIXTimestampSeconds",
                "unit": "day"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Cat Average Speed by Day",
        "in_public_dashboard": true,
        "creator_id": 4,
        "updated_at": "2018-01-10T23:48:24.228Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13,
                "aggregation": [
                    "METRIC",
                    3
                ],
                "breakout": [
                    103
                ],
                "filter": []
            }
        },
        "id": 48,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-29T23:24:01.271Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 13,
                "name": "Cat Facts",
                "slug": "cat_facts",
                "icon": ":cat:"
            }
        ],
        "table_id": 13,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp_seconds",
                "special_type": "type/UNIXTimestampSeconds",
                "unit": "hour"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Cat Average Speed by Hour",
        "in_public_dashboard": true,
        "creator_id": 4,
        "updated_at": "2017-11-27T19:03:52.753Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13,
                "aggregation": [
                    [
                        "METRIC",
                        3
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        103,
                        "as",
                        "hour"
                    ]
                ]
            }
        },
        "id": 45,
        "display": "line",
        "visualization_settings": {
            "line": {
                "lineColor": "#A989C5",
                "marker_fillColor": "#A989C5",
                "marker_lineColor": "#A989C5"
            },
            "area": {
                "fillColor": "#A989C5"
            },
            "bar": {
                "color": "#A989C5"
            },
            "graph.show_goal": true,
            "graph.goal_value": 7
        },
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-29T23:21:33.623Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 13,
                "name": "Cat Facts",
                "slug": "cat_facts",
                "icon": ":cat:"
            }
        ],
        "table_id": 13,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp_seconds",
                "special_type": "type/UNIXTimestampSeconds",
                "unit": "day"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "sum",
                "name": "sum",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Cat Distance by Day",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-09-12T21:08:30.149Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13,
                "aggregation": [
                    "METRIC",
                    4
                ],
                "breakout": [
                    103
                ],
                "filter": []
            }
        },
        "id": 47,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-29T23:22:54.528Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 13,
                "name": "Cat Facts",
                "slug": "cat_facts",
                "icon": ":cat:"
            }
        ],
        "table_id": 13,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Cat Distance by Hour",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2016-12-30T00:27:23.202Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13,
                "aggregation": [
                    "METRIC",
                    4
                ],
                "breakout": [
                    [
                        "datetime_field",
                        103,
                        "as",
                        "hour"
                    ]
                ],
                "filter": []
            }
        },
        "id": 46,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-29T23:21:55.802Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 13,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Cat distance in February 2016",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-06-15T21:05:14.185Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13,
                "aggregation": [
                    [
                        "METRIC",
                        4
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        103,
                        "as",
                        "hour"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "BETWEEN",
                        [
                            "field-id",
                            103
                        ],
                        "2016-02-01",
                        "2016-03-01"
                    ]
                ]
            }
        },
        "id": 263,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-15T21:05:14.185Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [
            {
                "id": 13,
                "name": "Cat Facts",
                "slug": "cat_facts",
                "icon": ":cat:"
            }
        ],
        "table_id": 13,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp_seconds",
                "special_type": "type/UNIXTimestampSeconds",
                "unit": "day"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Cat speed over time",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-09T12:13:53.329Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13,
                "aggregation": [
                    "METRIC",
                    5
                ],
                "breakout": [
                    103
                ],
                "filter": []
            }
        },
        "id": 85,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-15T23:25:37.899Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 13,
        "result_metadata": [
            {
                "base_type": "type/Decimal",
                "display_name": "Distance",
                "name": "distance",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Speed",
                "name": "speed",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp_seconds",
                "special_type": "type/UNIXTimestampSeconds",
                "unit": "default"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Cat speed per day",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2017-09-12T21:08:30.062Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13
            }
        },
        "id": 264,
        "display": "scatter",
        "visualization_settings": {
            "graph.dimensions": [
                "timestamp_seconds"
            ],
            "graph.metrics": [
                "speed"
            ]
        },
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-15T21:24:55.040Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 13,
                "name": "Cat Facts",
                "slug": "cat_facts",
                "icon": ":cat:"
            }
        ],
        "table_id": 13,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Cat Wheels, Average Speed, Grouped by Timestamp (hour)",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2016-12-30T00:27:23.203Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13,
                "aggregation": [
                    "METRIC",
                    5
                ],
                "breakout": [
                    [
                        "datetime_field",
                        103,
                        "as",
                        "hour"
                    ]
                ],
                "filter": []
            }
        },
        "id": 49,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-30T00:22:45.116Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "day"
            },
            {
                "base_type": "type/Text",
                "display_name": "Event Label",
                "name": "ga:eventLabel",
                "description": "Event label."
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Change Remapping Type actions over time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-04T17:32:40.147Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Change Remapping Type"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-07-23"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "day"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ]
            }
        },
        "id": 289,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T17:25:00.615Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 43,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 9,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Checkins, Raw data",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2016-08-05T22:46:58.246Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 9,
            "type": "query",
            "query": {
                "source_table": 43,
                "aggregation": [
                    "rows"
                ],
                "breakout": [],
                "filter": []
            }
        },
        "id": 131,
        "display": "table",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2016-08-05T22:46:58.246Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Steps as a % of the overall build time.",
        "archived": false,
        "labels": [],
        "table_id": 3279,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Stat",
                "name": "name",
                "description": "The stat being collected.",
                "special_type": "type/Name"
            },
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 17,
        "enable_embedding": false,
        "collection_id": 22,
        "query_type": "query",
        "name": "CI build time by step.",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-15T19:37:39.990Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 17,
            "type": "query",
            "query": {
                "source_table": 3279,
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            14921
                        ],
                        "run-time"
                    ]
                ],
                "aggregation": [
                    [
                        "avg",
                        [
                            "field-id",
                            14919
                        ]
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        14921
                    ]
                ]
            }
        },
        "id": 354,
        "display": "pie",
        "visualization_settings": {
            "table.column_widths": [
                null,
                null,
                null,
                233
            ]
        },
        "collection": {
            "id": 22,
            "name": "Code stats",
            "slug": "code_stats",
            "description": null,
            "color": "#7172AD",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-01T22:36:43.324Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 18,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Ts",
                "name": "ts",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 13,
        "query_type": "query",
        "name": "Contact form messages by day",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-16T16:00:09.470Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 18,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    191
                ],
                "filter": []
            }
        },
        "id": 60,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 13,
            "name": "User Communications",
            "slug": "user_communications",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-25T01:46:58.721Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3279,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Circle CI Node",
                "name": "node_index",
                "description": "Which node the stat ran on.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Timestamp",
                "name": "timestamp",
                "unit": "day"
            },
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 17,
        "enable_embedding": false,
        "collection_id": 22,
        "query_type": "query",
        "name": "Container run time by day.",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-11-01T23:08:29.220Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 17,
            "type": "query",
            "query": {
                "source_table": 3279,
                "aggregation": [
                    [
                        "avg",
                        [
                            "field-id",
                            14919
                        ]
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        14922
                    ],
                    [
                        "datetime-field",
                        [
                            "field-id",
                            14924
                        ],
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            14921
                        ],
                        "run-time"
                    ]
                ]
            }
        },
        "id": 357,
        "display": "bar",
        "visualization_settings": {
            "stackable.stack_type": "normalized"
        },
        "collection": {
            "id": 22,
            "name": "Code stats",
            "slug": "code_stats",
            "description": null,
            "color": "#7172AD",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-01T23:07:12.331Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "For testing differences in date range filter treatment of an identical question between in mbql and sql",
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "atte@metabase.com",
            "first_name": "Atte",
            "last_login": "2018-01-13T12:39:13.697Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 18,
            "last_name": "Keinänen",
            "date_joined": "2017-03-16T23:11:36.072Z",
            "common_name": "Atte Keinänen"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Count of Orders",
        "in_public_dashboard": false,
        "creator_id": 18,
        "updated_at": "2018-01-09T12:13:53.262Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ]
            }
        },
        "id": 234,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-31T22:17:27.157Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Well the world turns\nand a hungry little boy with a runny nose\nplays in the street as the cold wind blows\nIn the ghetto",
        "archived": false,
        "labels": [],
        "table_id": 18,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 13,
        "query_type": "query",
        "name": "CRM",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T23:11:45.826Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 18,
                "aggregation": [
                    "rows"
                ],
                "breakout": [],
                "filter": [],
                "order_by": [
                    [
                        186,
                        "descending"
                    ]
                ]
            }
        },
        "id": 58,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 13,
            "name": "User Communications",
            "slug": "user_communications",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-24T21:59:04.719Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "CSV Download Canary",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:15:32.646Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select count(*) from orders",
                "collection": "ORDERS"
            }
        },
        "id": 151,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-10-22T00:28:12.958Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 7,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp",
                "special_type": "type/UNIXTimestampMilliseconds",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Cumulative Count of Metabase's GitHub Stars",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-13T01:55:18.724Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "aggregation": [
                    [
                        "cum_count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        58,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        3
                    ]
                ]
            },
            "parameters": []
        },
        "id": 225,
        "display": "area",
        "visualization_settings": {
            "graph.y_axis.scale": "linear",
            "graph.y_axis.title_text": "Stars",
            "graph.x_axis.title_text": "Day"
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-22T18:01:22.913Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Cumulative count of downloads all time",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Time",
                "name": "time"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Sum",
                "name": "sum"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Cumulative Downloads",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-16T01:07:09.187Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select time::date, sum(count(*)) OVER (ORDER BY time::date)\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\nand \"key\" not in ('appcast.xml', 'index.hml', 'favicon.ico', 'Metabase.dmg', 'Metabase.zip')\nand time >= '2015-10-19'\nand bucket='downloads.metabase.com'\ngroup by 1"
            }
        },
        "id": 6,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-10-24T18:51:08.323Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Cumulative Downloads by Day",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2018-01-16T01:09:07.116Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "cum_count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        49,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 121,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-21T23:30:45.816Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Daily growth of GH stars on metabase/metabase",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Timezone",
                "name": "timezone"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Watchers",
                "name": "watchers"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Cumulative GH Stars",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-13T01:43:09.841Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "select (to_timestamp(timestamp/1000) AT TIME ZONE 'US/Pacific')::date, max(watchers) as watchers\nfrom follow_events\ngroup by 1\norder by 1"
            }
        },
        "id": 39,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": true,
        "created_at": "2016-01-27T05:43:34.144Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 7,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Cumulative Github Stars by Day",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-04-06T21:23:48.269Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "aggregation": [
                    "cum_count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        58,
                        "as",
                        "day"
                    ]
                ],
                "filter": []
            }
        },
        "id": 123,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-21T23:33:37.663Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Cumulative Invite Email Views by Day",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-04-07T00:27:39.109Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "cum_count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        73,
                        "GET /email_graph_bottom.png HTTP/1.1"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ]
            }
        },
        "id": 122,
        "display": "line",
        "visualization_settings": {
            "line": {
                "lineColor": "#EF8C8C",
                "marker_fillColor": "#EF8C8C",
                "marker_lineColor": "#EF8C8C"
            },
            "area": {
                "fillColor": "#EF8C8C"
            },
            "bar": {
                "color": "#EF8C8C"
            }
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-21T23:31:15.133Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 18,
        "query_type": "query",
        "name": "Cumulative Orders by Month",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-04T18:16:54.317Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    "cum_count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        25,
                        "as",
                        "week"
                    ]
                ],
                "filter": []
            }
        },
        "id": 112,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 18,
            "name": "Sample Dataset",
            "slug": "sample_dataset",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-17T21:11:23.527Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Company Size",
                "name": "company_size",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Customer Company Size Breakdown",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:03.181Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    526
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        537,
                        "2016-05-03"
                    ]
                ]
            }
        },
        "id": 92,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#f9d45c",
                "marker_fillColor": "#f9d45c",
                "marker_lineColor": "#f9d45c"
            },
            "area": {
                "fillColor": "#f9d45c"
            },
            "bar": {
                "color": "#f9d45c"
            }
        },
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-05T19:15:22.850Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            },
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Daily distinct download IPs",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-16T07:00:15.495Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "distinct",
                        45
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        49,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        4
                    ],
                    [
                        "TIME_INTERVAL",
                        49,
                        "current",
                        "year"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 83,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-11T16:41:38.321Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Daily downloads since launch...",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            },
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": 6,
        "result_metadata": null,
        "creator": {
            "email": "rs@expa.com",
            "first_name": "Roberto",
            "last_login": "2017-10-17T02:05:51.838Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 7,
            "last_name": "Sanabria",
            "date_joined": "2015-10-24T16:01:05.222Z",
            "common_name": "Roberto Sanabria"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Daily downloads",
        "in_public_dashboard": false,
        "creator_id": 7,
        "updated_at": "2017-04-07T00:28:47.472Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        49,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        38,
                        200,
                        204,
                        206
                    ],
                    [
                        "=",
                        47,
                        "REST.GET.OBJECT",
                        "WEBSITE.GET.OBJECT"
                    ],
                    [
                        "TIME_INTERVAL",
                        49,
                        "current",
                        "year"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 11,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-11-07T22:52:47.819Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Time",
                "name": "time"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "jennifer@expa.com",
            "first_name": "Jennifer",
            "last_login": "2016-01-05T22:19:23.746Z",
            "is_qbnewb": true,
            "is_superuser": false,
            "id": 10,
            "last_name": "Liu",
            "date_joined": "2015-10-24T18:54:17.367Z",
            "common_name": "Jennifer Liu"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Daily downloads",
        "in_public_dashboard": false,
        "creator_id": 10,
        "updated_at": "2017-11-29T00:12:13.603Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "SELECT time::date, COUNT(*) \nFROM entries \nWHERE http_status IN (200, 204, 206)\nAND operation IN ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nAND (key NOT IN ('Metabase.dmg', 'Metabase.zip', 'appcast.xml', 'favicon.ico', 'index.html'))\nGROUP BY 1 \nORDER BY 1 DESC\n"
            }
        },
        "id": 21,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-12-16T01:15:40.788Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "jennifer@expa.com",
            "first_name": "Jennifer",
            "last_login": "2016-01-05T22:19:23.746Z",
            "is_qbnewb": true,
            "is_superuser": false,
            "id": 10,
            "last_name": "Liu",
            "date_joined": "2015-10-24T18:54:17.367Z",
            "common_name": "Jennifer Liu"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Daily downloads",
        "in_public_dashboard": false,
        "creator_id": 10,
        "updated_at": "2017-04-06T21:14:25.641Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "SELECT time::date, COUNT(*) \nFROM entries \nWHERE http_status IN (200, 204, 206)\nAND operation IN ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nAND (key NOT IN ('Metabase.dmg', 'Metabase.zip', 'appcast.xml', 'favicon.ico', 'index.html'))\nGROUP BY 1 \nORDER BY 1 DESC\n"
            }
        },
        "id": 22,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-12-16T01:16:24.335Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Daily downloads since launch...",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": 6,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Daily downloads, trying to strip out China bots",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-07T00:28:28.194Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    49
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        38,
                        200,
                        204,
                        206
                    ],
                    [
                        "=",
                        47,
                        "REST.GET.OBJECT",
                        "WEBSITE.GET.OBJECT"
                    ],
                    [
                        "TIME_INTERVAL",
                        49,
                        "current",
                        "year"
                    ],
                    [
                        "!=",
                        45,
                        "59.38.98.7"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 50,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-05T18:06:21.723Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": null,
        "creator": {
            "email": "tabraham@expa.com",
            "first_name": "Tim",
            "last_login": "2017-05-23T13:31:29.446Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 11,
            "last_name": "Abraham",
            "date_joined": "2015-10-24T18:55:26.993Z",
            "common_name": "Tim Abraham"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Daily Traffic to Metabase.com",
        "in_public_dashboard": false,
        "creator_id": 11,
        "updated_at": "2017-05-18T22:45:35.474Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            7105
                        ],
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            7105
                        ],
                        -30,
                        "day"
                    ]
                ]
            }
        },
        "id": 253,
        "display": "line",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-05-18T22:45:35.474Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Dashboards",
                "name": "# Dashboards"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "# Dashboards a Card is in",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:39.657Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Dashboards\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'dashboard'->'num_dashs_per_card' as col,\njson_object_keys(stats->'dashboard'->'num_dashs_per_card') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 170,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:50:45.719Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Dashboards",
                "name": "# Dashboards"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Dashboards Created per User",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:32.409Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Dashboards\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'dashboard'->'num_dashs_per_user' as col,\njson_object_keys(stats->'dashboard'->'num_dashs_per_user') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 168,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:49:23.672Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Active Installs",
                "name": "Active Installs"
            },
            {
                "base_type": "type/Date",
                "display_name": "Time",
                "name": "time"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Active Installs, Prior Month",
                "name": "Active Installs, Prior Month"
            },
            {
                "base_type": "type/Date",
                "display_name": "Previous Date",
                "name": "Previous Date"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Day over day active installs, all time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-16T19:50:51.706Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "SELECT \n    count(distinct entries.remote_ip) AS \"Active Installs\",\n    CAST(\"public\".\"entries\".\"time\" AS date) AS \"time\",\n    LAG(count(distinct entries.remote_ip), 28) OVER (ORDER BY CAST(\"public\".\"entries\".\"time\" AS date)) as \"Active Installs, Prior Month\",\n    LAG(CAST(\"public\".\"entries\".\"time\" AS date), 28) OVER (ORDER BY CAST(\"public\".\"entries\".\"time\" AS date)) as \"Previous Date\"\nFROM entries\nWHERE entries.key like 'version%'\n    AND bucket = 'static.metabase.com'\nGROUP BY CAST (time AS date)\nORDER BY CAST (time AS date) Desc;",
                "collection": "entries",
                "template_tags": {}
            }
        },
        "id": 284,
        "display": "area",
        "visualization_settings": {
            "graph.dimensions": [
                "time"
            ],
            "graph.metrics": [
                "Active Installs",
                "Active Installs, Prior Month"
            ],
            "stackable.stack_type": null,
            "graph.colors": [
                "#509ee3",
                "#A989C5",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ],
            "graph.x_axis.axis_enabled": false,
            "graph.x_axis.labels_enabled": false,
            "graph.y_axis.auto_range": false,
            "graph.y_axis.max": 4500
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-03T20:38:17.684Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Active Installs",
                "name": "Active Installs"
            },
            {
                "base_type": "type/Date",
                "display_name": "Time",
                "name": "time"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Active Installs, Prior Month",
                "name": "Active Installs, Prior Month"
            },
            {
                "base_type": "type/Date",
                "display_name": "Previous Date",
                "name": "Previous Date"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Day over day active installs, previous 90 days",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-08T22:29:55.808Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "SELECT * from\n\n(SELECT \n    count(distinct entries.remote_ip) AS \"Active Installs\",\n    CAST(\"public\".\"entries\".\"time\" AS date) AS \"time\",\n    LAG(count(distinct entries.remote_ip), 28) OVER (ORDER BY CAST(\"public\".\"entries\".\"time\" AS date)) as \"Active Installs, Prior Month\",\n    LAG(CAST(\"public\".\"entries\".\"time\" AS date), 28) OVER (ORDER BY CAST(\"public\".\"entries\".\"time\" AS date)) as \"Previous Date\"\nFROM entries\nWHERE entries.key like 'version%'\n    AND bucket = 'static.metabase.com'\nGROUP BY CAST (time AS date)\nORDER BY CAST (time AS date) Desc)\n\nas result where ((cast (time AS date)) > current_date -90);",
                "collection": "entries",
                "template_tags": {}
            }
        },
        "id": 328,
        "display": "line",
        "visualization_settings": {
            "line.marker_enabled": false,
            "graph.x_axis.labels_enabled": false,
            "graph.y_axis.max": 8000,
            "graph.x_axis.axis_enabled": true,
            "graph.metrics": [
                "Active Installs",
                "Active Installs, Prior Month"
            ],
            "graph.colors": [
                "#509ee3",
                "#A989C5",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ],
            "graph.y_axis.auto_range": false,
            "graph.dimensions": [
                "time"
            ],
            "stackable.stack_type": null
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-16T19:50:36.406Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "now() minus the hardcoded date for the last release",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Date Part",
                "name": "date_part"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "native",
        "name": "Days since last major release",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:04:21.724Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "SELECT DATE_PART('day', now()::timestamp - '2017-11-28'::timestamp);",
                "collection": "follow_events",
                "template_tags": {}
            }
        },
        "id": 247,
        "display": "progress",
        "visualization_settings": {
            "progress.goal": 42
        },
        "collection": null,
        "favorite": false,
        "created_at": "2017-05-04T00:18:05.477Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "month"
            },
            {
                "base_type": "type/Text",
                "display_name": "Event Label",
                "name": "ga:eventLabel",
                "description": "Event label.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 23,
        "query_type": "query",
        "name": "DB creation failures by DB type (monthly).",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-11-06T21:44:09.522Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        28
                    ]
                ],
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "month"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ]
            }
        },
        "id": 368,
        "display": "bar",
        "visualization_settings": {
            "stackable.stack_type": "normalized"
        },
        "collection": {
            "id": 23,
            "name": "Database Tracking",
            "slug": "database_tracking",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-06T21:44:09.522Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "DB Creations by Database",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2016-12-12T19:43:12.478Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    "METRIC",
                    "ga:totalEvents"
                ],
                "breakout": [
                    6939
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        6938,
                        "Databases"
                    ],
                    [
                        "=",
                        6937,
                        "Create"
                    ]
                ],
                "order_by": [
                    [
                        6939,
                        "ascending"
                    ]
                ]
            },
            "parameters": []
        },
        "id": 185,
        "display": "pie",
        "visualization_settings": {
            "table.column_widths": [],
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ]
        },
        "collection": null,
        "favorite": false,
        "created_at": "2016-12-12T19:43:12.478Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Nps",
                "name": "nps"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "Default field filter test Maz",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-08T21:59:49.447Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "native",
            "native": {
                "query": "SELECT \nSUM(CASE \n  WHEN nps < 7 then -1 \n  WHEN nps >8 then 1\n  ELSE NULL END\n) * 100 / COUNT(*) as NPS\nFROM \nfollowup_survey_results\nWHERE {{date}}",
                "template_tags": {
                    "date": {
                        "id": "de006cbf-f8e7-c17d-9f6c-6e931801444a",
                        "name": "date",
                        "display_name": "Date",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            537
                        ],
                        "widget_type": "date/month-year",
                        "default": "2017-03"
                    }
                }
            }
        },
        "id": 321,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-03T18:18:44.710Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count(*)",
                "name": "COUNT(*)"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "native",
        "name": "Default field filter value not working?",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-28T04:28:41.399Z",
        "made_public_by_id": 3,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT count(*)\nFROM products\nWHERE {{x}}",
                "collection": "ORDERS",
                "template_tags": {
                    "x": {
                        "id": "c3ece00b-3b7c-0eb8-7e30-e317584a1df9",
                        "name": "x",
                        "display_name": "X",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            16
                        ],
                        "widget_type": "category",
                        "default": "Gizmo"
                    }
                }
            }
        },
        "id": 297,
        "display": "scalar",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-08-10T18:29:47.583Z",
        "public_uuid": "0919871b-c8e6-4108-b01c-72f185f80fc0",
        spaces: [5]
    },
    {
        "description": "Survey result submissions with NPS score below 9.",
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "TS",
                "name": "ts",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Detractors over time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:09.326Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "cum_count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        537,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "<",
                        532,
                        9
                    ]
                ]
            }
        },
        "id": 149,
        "display": "line",
        "visualization_settings": {
            "graph.colors": [
                "#EF8C8C",
                "#9CC177",
                "#A989C5",
                "#EF8C8C",
                "#f9d45c"
            ]
        },
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-10-19T21:51:58.487Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1134,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Discussion Forum New Users",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:22:30.511Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1134,
                "aggregation": [
                    "METRIC",
                    "ga:newUsers"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        6597,
                        "as",
                        "week"
                    ]
                ],
                "filter": []
            }
        },
        "id": 198,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-21T21:39:59.268Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1134,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Discussion Forum Users",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:22:30.518Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1134,
                "aggregation": [
                    "METRIC",
                    "ga:users"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        6597,
                        "as",
                        "week"
                    ]
                ],
                "filter": []
            }
        },
        "id": 199,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-21T21:40:39.984Z",
        "public_uuid": null
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1134,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Discussion Forum Views",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:22:30.517Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1134,
                "aggregation": [
                    "METRIC",
                    "ga:pageviews"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        6597,
                        "as",
                        "week"
                    ]
                ],
                "filter": []
            }
        },
        "id": 194,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-21T21:36:26.805Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Dislikes",
                "name": "dislikes",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Dislikes breadown",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:08.485Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    542
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        537,
                        "2016-05-03"
                    ],
                    [
                        "NOT_NULL",
                        542
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "ascending"
                    ]
                ]
            }
        },
        "id": 99,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#EF8C8C",
                "marker_fillColor": "#EF8C8C",
                "marker_lineColor": "#EF8C8C"
            },
            "area": {
                "fillColor": "#EF8C8C"
            },
            "bar": {
                "color": "#EF8C8C"
            }
        },
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-06T22:22:22.717Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Distinct Downloading IPs this Year",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-16T00:49:50.743Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "distinct",
                        45
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        4
                    ],
                    [
                        ">",
                        49,
                        "2017-01-01"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 345,
        "display": "scalar",
        "visualization_settings": {
            "line": {
                "lineColor": "#9CC177",
                "marker_fillColor": "#9CC177",
                "marker_lineColor": "#9CC177"
            },
            "area": {
                "fillColor": "#9CC177"
            },
            "bar": {
                "color": "#9CC177"
            }
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:37:15.710Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 6,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Distinct download IPs per month, pre 2017",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-07T00:28:09.657Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "distinct",
                        45
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        49,
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        4
                    ],
                    [
                        "<",
                        49,
                        "2017-01-01"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 119,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#9CC177",
                "marker_fillColor": "#9CC177",
                "marker_lineColor": "#9CC177"
            },
            "area": {
                "fillColor": "#9CC177"
            },
            "bar": {
                "color": "#9CC177"
            }
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-21T16:57:09.364Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Just for the past three months",
        "archived": false,
        "labels": [],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Distinct download IPs per week",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:04:25.033Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "distinct",
                        45
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        49,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        4
                    ],
                    [
                        "time-interval",
                        49,
                        -90,
                        "day"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 147,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#9CC177",
                "marker_fillColor": "#9CC177",
                "marker_lineColor": "#9CC177"
            },
            "area": {
                "fillColor": "#9CC177"
            },
            "bar": {
                "color": "#9CC177"
            }
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-10-19T17:06:43.934Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "How many distinct values of Remote IP did we have yesterday for valid downloads?",
        "archived": false,
        "labels": [],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Distinct download IPs yesterday",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-07T17:14:23.443Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "distinct",
                        45
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        4
                    ],
                    [
                        "=",
                        49,
                        [
                            "relative_datetime",
                            -1,
                            "day"
                        ]
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 138,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-19T17:03:41.189Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [
            {
                "id": 19,
                "name": "User Behavior",
                "slug": "user_behavior",
                "icon": "#2D86D4"
            }
        ],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Distinct IPs checking for Updates",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-16T07:00:10.553Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            72
                        ],
                        "version-info.json"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            80
                        ],
                        -730,
                        "day"
                    ]
                ]
            }
        },
        "id": 125,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-30T00:12:55.139Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [
            {
                "id": 1,
                "name": "Test Validations",
                "slug": "test_validations",
                "icon": ":ghost:"
            }
        ],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "Don't repeat 12th week (#2288)",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-17T19:31:21.894Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        25,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "BETWEEN",
                        25,
                        "2016-03-01",
                        "2016-04-01"
                    ]
                ]
            }
        },
        "id": 78,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-05T18:16:20.007Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [
            {
                "id": 1,
                "name": "Test Validations",
                "slug": "test_validations",
                "icon": ":ghost:"
            }
        ],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Id",
                "name": "ID",
                "description": "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "default"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Product ID",
                "name": "PRODUCT_ID",
                "description": "The product ID. This is an internal identifier for the product, NOT the SKU.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Float",
                "display_name": "Subtotal",
                "name": "SUBTOTAL",
                "description": "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Tax",
                "name": "TAX",
                "description": "This is the amount of local and federal taxes that are collected on the purchase. Note that other governmental fees on some products are not included here, but instead are accounted for in the subtotal.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Total",
                "name": "TOTAL",
                "description": "The total billed amount."
            },
            {
                "base_type": "type/Integer",
                "display_name": "User Id",
                "name": "USER_ID",
                "description": "The id of the user who made this order. Note that in some cases where an order was created on behalf of a customer who phoned the order in, this might be the employee who handled the request.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Product ID",
                "name": "TITLE",
                "description": "The name of the product as it should be displayed to customers.",
                "special_type": "type/Name"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "Don't truncate date columns in raw data (#2277)",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-17T19:31:21.062Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    "rows"
                ],
                "breakout": [],
                "filter": [],
                "limit": 1
            }
        },
        "id": 77,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-05T18:13:07.976Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Download Events, Num Downloads, Grouped by Time (day)",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-09-28T17:12:10.200Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "METRIC",
                        2
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            49
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 306,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-06T19:09:04.709Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Count of downloads per hour only during the last 24 hours",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Downloads by Hour (24Hr)",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-13T01:54:40.317Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select\n    date_trunc('hour', time) as time,\n    count(*)\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\nand time > NOW() - INTERVAL '24' HOUR\nand bucket='downloads.metabase.com'\ngroup by 1"
            }
        },
        "id": 17,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-12-04T02:00:06.647Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Version",
                "name": "version"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Downloads by Major Version",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-29T14:47:00.608Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select (regexp_matches(key, '^(v[0-9]+\\.[0-9]+)'))[1] as version, count(*)\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\nand bucket='downloads.metabase.com'\ngroup by 1 order by 1 asc"
            }
        },
        "id": 120,
        "display": "bar",
        "visualization_settings": {
            "graph.colors": [
                "#F1B556",
                "#9cc177",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ]
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-21T17:18:21.459Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Version",
                "name": "version"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Downloads by Major Version, v0.2X",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:04:27.363Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select (regexp_matches(key, '^(v[0-9]+\\.2[0-9]+)'))[1] as version, count(*)\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\nand bucket='downloads.metabase.com'\ngroup by 1 order by 1 asc",
                "template_tags": {}
            }
        },
        "id": 279,
        "display": "bar",
        "visualization_settings": {
            "graph.colors": [
                "#F1B556",
                "#9cc177",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ]
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-07-26T20:23:13.520Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Count of downloads by type of download all time",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Case",
                "name": "case"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Downloads by Type",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-16T01:07:34.951Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select \n    CASE WHEN file='Metabase.dmg' THEN 'Mac'\n         WHEN file='Metabase.zip' THEN 'Mac'\n         WHEN file='launch-aws-eb.html' THEN 'AWS'\n         WHEN file='launch-heroku.html' THEN 'Heroku'\n         WHEN file='metabase.jar' THEN 'Jar'\n         ELSE 'other'\n    END,\n    count\nfrom (\n    select (regexp_matches(key, '^v.*/(.*)'))[1] as file, count(*) as count\n    from entries\n    where operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\n    and http_status in (200, 204, 206)\n    and bucket='downloads.metabase.com'\n    group by 1\n) versioned\nwhere file in ('Metabase.dmg', 'Metabase.zip', 'launch-aws-eb.html', 'metabase.jar')\nunion\nselect 'Heroku', count(*) as count\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\nand key = 'launch-heroku.html'\nand bucket='downloads.metabase.com'\ngroup by 1"
            }
        },
        "id": 3,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#A989C5",
                "marker_fillColor": "#A989C5",
                "marker_lineColor": "#A989C5"
            },
            "area": {
                "fillColor": "#A989C5"
            },
            "bar": {
                "color": "#A989C5"
            }
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-10-24T15:34:55.709Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Count of downloads by Version number all time",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            },
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Version",
                "name": "version"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Downloads by Version",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-11-29T00:20:39.712Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select (regexp_matches(key, '^(v.*)/.*'))[1] as version, count(*)\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\nand bucket='downloads.metabase.com'\ngroup by 1"
            }
        },
        "id": 2,
        "display": "pie",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-10-24T15:21:38.460Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "Count of downloads by Version number only during the last 24 hours",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            },
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Version",
                "name": "version"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Downloads by Version (24Hr)",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-13T01:54:40.375Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select (regexp_matches(key, '^(v.*)/.*'))[1] as version, count(*)\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\nand time > NOW() - INTERVAL '24' HOUR\nand bucket='downloads.metabase.com'\ngroup by 1\norder by 1"
            }
        },
        "id": 16,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-12-04T01:51:24.584Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "hour"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "ryan@metabase.com",
            "first_name": "Ryan",
            "last_login": "2018-01-09T18:22:23.762Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 20,
            "last_name": "Senior",
            "date_joined": "2017-05-08T17:08:52.534Z",
            "common_name": "Ryan Senior"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Downloads for past 5 days",
        "in_public_dashboard": false,
        "creator_id": 20,
        "updated_at": "2017-09-28T17:12:10.162Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            49
                        ],
                        -3,
                        "day"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            49
                        ],
                        "hour"
                    ]
                ],
                "aggregation": [
                    [
                        "count"
                    ]
                ]
            }
        },
        "id": 302,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-01T14:38:07.068Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Entries, Distinct values of Remote IP, Grouped by Time (day), Filtered by Key and Bucket",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-09-06T19:12:29.832Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 307,
        "display": "table",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 2500,
            "graph.y_axis.auto_range": false,
            "graph.y_axis.max": 3000,
            "progress.goal": 10000,
            "progress.color": "#509EE3"
        },
        "collection": null,
        "favorite": false,
        "created_at": "2017-09-06T19:11:55.293Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Entries, Distinct values of Remote Ip, Grouped by Time (month), Filtered by Key and Time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2016-11-10T19:03:49.657Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    "distinct",
                    76
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "BETWEEN",
                        80,
                        "2016-06-01",
                        "2016-06-30"
                    ]
                ]
            }
        },
        "id": 156,
        "display": "bar",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2016-11-10T19:03:49.657Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "Example broken sort card",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-07-06T13:52:14.628Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        532
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ]
            }
        },
        "id": 272,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-07-06T13:52:14.628Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Fields per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:47.983Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'field'->>'fields')::int/100)*100 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 179,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T02:17:49.895Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Fields",
                "name": "# Fields"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "# Fields per Table",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:50.415Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Fields\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'field'->'num_per_table' as col,\njson_object_keys(stats->'field'->'num_per_table') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 171,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:51:27.851Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "",
        "archived": false,
        "labels": [],
        "table_id": 7,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Follow Events raw data",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-06T21:29:56.810Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "aggregation": [
                    "rows"
                ],
                "breakout": [],
                "filter": []
            }
        },
        "id": 26,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-09T00:02:42.162Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "id",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Comments",
                "name": "comments",
                "special_type": "type/Description"
            },
            {
                "base_type": "type/Text",
                "display_name": "Company Size",
                "name": "company_size",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Contact Choice",
                "name": "contact_choice",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Contact Details",
                "name": "contact_details",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Dislikes",
                "name": "dislikes",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Dislikes Comment",
                "name": "dislikes_comment",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Hash",
                "name": "hash",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "IP",
                "name": "ip",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "NPS",
                "name": "nps",
                "description": "Net Promoter Score",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Reason",
                "name": "reason",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Reason Comments",
                "name": "reason_comments",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source",
                "name": "source",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source Comments",
                "name": "source_comments",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Survey ID",
                "name": "survey_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "TS",
                "name": "ts",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "Usage",
                "name": "usage",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Followup Survey Results after May 3",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:07.494Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "filter": [
                    "AND",
                    [
                        ">",
                        537,
                        "2016-05-03"
                    ]
                ],
                "order_by": [
                    [
                        530,
                        "descending"
                    ]
                ]
            }
        },
        "id": 95,
        "display": "table",
        "visualization_settings": {
            "table.columns": [
                {
                    "name": "id",
                    "enabled": true
                },
                {
                    "name": "nps",
                    "enabled": true
                },
                {
                    "name": "comments",
                    "enabled": true
                },
                {
                    "name": "company_size",
                    "enabled": true
                },
                {
                    "name": "contact_choice",
                    "enabled": true
                },
                {
                    "name": "contact_details",
                    "enabled": true
                },
                {
                    "name": "dislikes",
                    "enabled": true
                },
                {
                    "name": "dislikes_comment",
                    "enabled": true
                },
                {
                    "name": "hash",
                    "enabled": false
                },
                {
                    "name": "ip",
                    "enabled": true
                },
                {
                    "name": "reason",
                    "enabled": true
                },
                {
                    "name": "reason_comments",
                    "enabled": true
                },
                {
                    "name": "source",
                    "enabled": true
                },
                {
                    "name": "source_comments",
                    "enabled": true
                },
                {
                    "name": "survey_id",
                    "enabled": true
                },
                {
                    "name": "ts",
                    "enabled": true
                },
                {
                    "name": "usage",
                    "enabled": true
                }
            ]
        },
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-05T19:21:20.763Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "test",
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Followup Survey Results, Raw data",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:30:05.420Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "rows"
                ],
                "breakout": [],
                "filter": []
            }
        },
        "id": 100,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-09T17:36:33.346Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Max",
                "name": "max"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Forks",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-13T01:43:09.305Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "select max(forks) from follow_events"
            }
        },
        "id": 40,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-27T05:48:16.538Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 11,
                "name": "Bug Tracking",
                "slug": "bug_tracking",
                "icon": "#ED6E6E"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/*",
                "display_name": "Number",
                "name": "number"
            },
            {
                "base_type": "type/*",
                "display_name": "Opened",
                "name": "opened"
            },
            {
                "base_type": "type/*",
                "display_name": "Title",
                "name": "title"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Fresh Bugs",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-16T16:00:08.087Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "SELECT number, to_char(created_at, 'Mon dd') as opened, title\nFROM metabase_issues\nWHERE (labels like '%Bug%' or labels like '%Bug%')\nAND closed_at is NULL\nAND created_at > now() - interval '7 days'"
            }
        },
        "id": 53,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-10T16:20:21.245Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3279,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Build Number",
                "name": "build_number",
                "description": "The circle CI build number.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Number",
                "display_name": "Size in MB",
                "name": "Size in MB",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 17,
        "enable_embedding": false,
        "collection_id": 22,
        "query_type": "query",
        "name": "Frontend bundle size by build (master)",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2018-01-12T07:11:02.762Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 17,
            "type": "query",
            "query": {
                "source_table": 3279,
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            14921
                        ],
                        "frontend-size"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            14918
                        ],
                        "master"
                    ]
                ],
                "aggregation": [
                    [
                        "named",
                        [
                            "/",
                            [
                                "avg",
                                [
                                    "field-id",
                                    14919
                                ]
                            ],
                            1024,
                            1000
                        ],
                        "Size in MB"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        14923
                    ]
                ]
            }
        },
        "id": 397,
        "display": "line",
        "visualization_settings": {
            "graph.x_axis.axis_enabled": true,
            "graph.y_axis.title_text": "MB",
            "graph.x_axis.title_text": "",
            "graph.x_axis.labels_enabled": false
        },
        "collection": {
            "id": 22,
            "name": "Code stats",
            "slug": "code_stats",
            "description": null,
            "color": "#7172AD",
            "archived": false
        },
        "favorite": false,
        "created_at": "2018-01-09T09:40:24.438Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3279,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Timestamp",
                "name": "timestamp",
                "unit": "month"
            },
            {
                "base_type": "type/Number",
                "display_name": "Size in MB",
                "name": "Size in MB",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 17,
        "enable_embedding": false,
        "collection_id": 22,
        "query_type": "query",
        "name": "Frontend bundle size by month.",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-15T19:37:23.734Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 17,
            "type": "query",
            "query": {
                "source_table": 3279,
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            14921
                        ],
                        "frontend-size"
                    ]
                ],
                "aggregation": [
                    [
                        "named",
                        [
                            "/",
                            [
                                "avg",
                                [
                                    "field-id",
                                    14919
                                ]
                            ],
                            1024,
                            1000
                        ],
                        "Size in MB"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            14924
                        ],
                        "month"
                    ]
                ]
            }
        },
        "id": 358,
        "display": "bar",
        "visualization_settings": {
            "graph.x_axis.axis_enabled": true,
            "graph.y_axis.title_text": "MB",
            "graph.x_axis.title_text": "",
            "graph.x_axis.labels_enabled": false
        },
        "collection": {
            "id": 22,
            "name": "Code stats",
            "slug": "code_stats",
            "description": null,
            "color": "#7172AD",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-01T23:18:11.604Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3279,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 17,
        "enable_embedding": false,
        "collection_id": 22,
        "query_type": "query",
        "name": "Frontend Test Coverage",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-16T16:00:00.787Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 17,
            "type": "query",
            "query": {
                "source_table": 3279,
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            14921
                        ],
                        "frontend-coverage-lines"
                    ]
                ],
                "aggregation": [
                    [
                        "avg",
                        [
                            "field-id",
                            14919
                        ]
                    ]
                ]
            }
        },
        "id": 355,
        "display": "scalar",
        "visualization_settings": {
            "table.column_widths": [
                null,
                null,
                null,
                null,
                null,
                null,
                257
            ],
            "scalar.suffix": "%"
        },
        "collection": {
            "id": 22,
            "name": "Code stats",
            "slug": "code_stats",
            "description": null,
            "color": "#7172AD",
            "archived": false
        },
        "favorite": true,
        "created_at": "2017-11-01T22:39:39.181Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3279,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 17,
        "enable_embedding": false,
        "collection_id": 22,
        "query_type": "query",
        "name": "Frontend test coverage progress",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-15T19:37:40.019Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 17,
            "type": "query",
            "query": {
                "source_table": 3279,
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            14921
                        ],
                        "frontend-coverage-branches",
                        "frontend-coverage-functions",
                        "frontend-coverage-lines",
                        "frontend-coverage-statements"
                    ]
                ],
                "aggregation": [
                    [
                        "avg",
                        [
                            "field-id",
                            14919
                        ]
                    ]
                ]
            }
        },
        "id": 361,
        "display": "progress",
        "visualization_settings": {
            "table.column_widths": [
                null,
                null,
                null,
                null,
                null,
                null,
                257
            ],
            "scalar.suffix": "%",
            "progress.goal": 90,
            "progress.color": "#7172AD"
        },
        "collection": {
            "id": 22,
            "name": "Code stats",
            "slug": "code_stats",
            "description": null,
            "color": "#7172AD",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-02T18:25:09.743Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 21,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "avg",
                "name": "avg",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "Games, Average of Away Hits Ct",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-12-20T00:51:04.327Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 21,
                "aggregation": [
                    [
                        "avg",
                        [
                            "field-id",
                            359
                        ]
                    ]
                ]
            }
        },
        "id": 392,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-12-20T00:50:39.224Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "",
        "archived": false,
        "labels": [],
        "table_id": 7,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp",
                "special_type": "type/UNIXTimestampMilliseconds",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Github interactions / Day",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-13T01:43:10.671Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    58
                ],
                "filter": []
            }
        },
        "id": 7,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#9CC177",
                "marker_fillColor": "#9CC177",
                "marker_lineColor": "#9CC177"
            },
            "area": {
                "fillColor": "#9CC177"
            },
            "bar": {
                "color": "#9CC177"
            }
        },
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-10-28T18:23:18.552Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "Stars and forks that happened today",
        "archived": false,
        "labels": [],
        "table_id": 7,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Github interactions today (partial data)",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-13T01:43:09.921Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "aggregation": [
                    "count"
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        "=",
                        58,
                        [
                            "relative_datetime",
                            "current"
                        ]
                    ]
                ]
            }
        },
        "id": 9,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-10-28T18:27:41.869Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "Stars and forks that happened yesterday",
        "archived": false,
        "labels": [],
        "table_id": 7,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Github interactions yesterday",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:16:54.370Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "aggregation": [
                    "count"
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        "=",
                        58,
                        [
                            "relative_datetime",
                            -1,
                            "day"
                        ]
                    ]
                ]
            }
        },
        "id": 8,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-10-28T18:25:02.200Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": 7,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp",
                "special_type": "type/UNIXTimestampMilliseconds",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Github stars",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-13T01:43:11.080Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        58,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "TIME_INTERVAL",
                        58,
                        "current",
                        "year"
                    ],
                    [
                        "SEGMENT",
                        3
                    ]
                ]
            }
        },
        "id": 69,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-03-11T23:06:46.457Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "Number of events where someone added a GA db.",
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Google Analytics DB Adds",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-11-06T21:34:20.554Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6939
                        ],
                        "googleanalytics"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            6938
                        ],
                        "Databases"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Create"
                    ]
                ]
            }
        },
        "id": 367,
        "display": "line",
        "visualization_settings": {
            "table.column_widths": [
                198
            ]
        },
        "collection": null,
        "favorite": false,
        "created_at": "2017-11-06T21:34:20.554Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Company Size",
                "name": "company_size",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Comments",
                "name": "comments",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Grouped raw data pulse test",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-30T22:05:13.352Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "rows"
                ],
                "breakout": [
                    526,
                    525
                ],
                "filter": []
            }
        },
        "id": 126,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-07-01T19:02:13.725Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Groups per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:46.207Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'group'->>'groups')::int/5)*5 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 177,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T02:15:24.109Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "GUI vs. Native Queries, all time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-05-12T00:29:15.990Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Run Query"
                    ],
                    [
                        "!=",
                        [
                            "field-id",
                            6939
                        ],
                        "(not set)",
                        "url"
                    ],
                    [
                        "BETWEEN",
                        [
                            "field-id",
                            6851
                        ],
                        "2015-10-01",
                        "2017-04-30"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "as",
                        "month"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ]
            }
        },
        "id": 251,
        "display": "line",
        "visualization_settings": {
            "table.column_widths": [],
            "graph.x_axis.title_text": "Query Type",
            "graph.y_axis.title_text": "Queries",
            "graph.colors": [
                "#A989C5",
                "#9cc177",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ]
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-12T00:03:10.286Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "GUI vs. Native Queries, past 180 days",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-07-13T17:51:21.811Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Run Query"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            6851
                        ],
                        -180,
                        "day"
                    ],
                    [
                        "!=",
                        [
                            "field-id",
                            6939
                        ],
                        "(not set)",
                        "url"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "as",
                        "week"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ]
            }
        },
        "id": 250,
        "display": "line",
        "visualization_settings": {
            "table.column_widths": [],
            "graph.x_axis.title_text": "Query Type",
            "graph.y_axis.title_text": "Queries",
            "graph.colors": [
                "#509EE3",
                "#EF8C8C",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ]
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-12T00:01:38.726Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Count of Downloads by hour for the past 7 days",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "hour"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Hourly Downloads",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-11-07T19:46:13.686Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "METRIC",
                        2
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        49,
                        "as",
                        "hour"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "TIME_INTERVAL",
                        49,
                        -7,
                        "day"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            40
                        ],
                        "downloads.metabase.com"
                    ]
                ]
            }
        },
        "id": 1,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-10-24T15:06:16.659Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": 6,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Hourly Downloads (All time)",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:24:27.950Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        49,
                        "as",
                        "hour"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        38,
                        200,
                        204,
                        206
                    ],
                    [
                        "=",
                        47,
                        "REST.GET.OBJECT",
                        "WEBSITE.GET.OBJECT"
                    ]
                ]
            }
        },
        "id": 12,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-11-13T18:06:00.418Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Install Base This Year",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-09-25T23:26:23.421Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            72
                        ],
                        "version-info.json"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            80
                        ],
                        "2017-01-11"
                    ]
                ]
            }
        },
        "id": 312,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-20T01:19:25.329Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1232,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Version",
                "name": "version",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "query",
        "name": "Installs by MB Version",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-20T18:59:36.306Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "query",
            "query": {
                "source_table": 1232,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        7655
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            7653
                        ],
                        -30,
                        "day"
                    ]
                ]
            }
        },
        "id": 285,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-03T21:59:28.004Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Installs, past 365 days",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-14T20:35:36.864Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "METRIC",
                        17
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            80
                        ],
                        -365,
                        "day"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 310,
        "display": "line",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-09-18T21:52:03.674Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "When do people start their metabase instances?",
        "archived": false,
        "labels": [],
        "table_id": 1232,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "query",
        "name": "Instance starts by day of week",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:24:07.759Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "query",
            "query": {
                "source_table": 1232,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            7646
                        ],
                        "as",
                        "day-of-week"
                    ]
                ]
            }
        },
        "id": 217,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-02-28T22:00:23.021Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Example of a dataset spanning years that showcases a timeseries with a large and difficult x-axis",
        "archived": false,
        "labels": [],
        "table_id": 16,
        "result_metadata": null,
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 6,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "Investments by Day",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-04-06T21:30:17.795Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 6,
            "type": "query",
            "query": {
                "source_table": 16,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    152
                ],
                "filter": []
            }
        },
        "id": 54,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-11T05:32:04.548Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "counts occurrences of email invites by tallying hits to our email images.",
        "archived": false,
        "labels": [
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Invite Emails Viewed",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-10-24T18:27:12.067Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        73,
                        "GET /email_graph_bottom.png HTTP/1.1"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ]
            }
        },
        "id": 13,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-11-15T23:20:11.801Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Invite emails viewed by day of week",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:31:27.228Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "day-of-week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        73,
                        "GET /email_graph_bottom.png HTTP/1.1"
                    ],
                    [
                        "TIME_INTERVAL",
                        80,
                        "current",
                        "year"
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ]
            }
        },
        "id": 91,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#EF8C8C",
                "marker_fillColor": "#EF8C8C",
                "marker_lineColor": "#EF8C8C"
            },
            "area": {
                "fillColor": "#EF8C8C"
            },
            "bar": {
                "color": "#EF8C8C"
            }
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-29T17:42:26.393Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Invite Emails Viewed Per Day, This Year",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-06T21:31:27.229Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        73,
                        "GET /email_graph_bottom.png HTTP/1.1"
                    ],
                    [
                        "TIME_INTERVAL",
                        80,
                        "current",
                        "year"
                    ]
                ]
            }
        },
        "id": 72,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-03-28T22:28:54.377Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "month"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Invite emails viewed per month",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:04:21.521Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        80,
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        73,
                        "GET /email_graph_bottom.png HTTP/1.1"
                    ],
                    [
                        ">",
                        80,
                        "2015-10-12"
                    ]
                ]
            }
        },
        "id": 90,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#EF8C8C",
                "marker_fillColor": "#EF8C8C",
                "marker_lineColor": "#EF8C8C"
            },
            "area": {
                "fillColor": "#EF8C8C"
            },
            "bar": {
                "color": "#EF8C8C"
            }
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-22T21:25:02.338Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Invite emails viewed yesterday",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-07T17:14:22.584Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    "count"
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        "=",
                        73,
                        "GET /email_graph_bottom.png HTTP/1.1"
                    ],
                    [
                        "=",
                        80,
                        [
                            "relative_datetime",
                            -1,
                            "day"
                        ]
                    ]
                ]
            }
        },
        "id": 139,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-19T17:04:43.810Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Permalink",
                "name": "permalink"
            },
            {
                "base_type": "type/Text",
                "display_name": "Name",
                "name": "name"
            },
            {
                "base_type": "type/Text",
                "display_name": "Homepage URL",
                "name": "homepage_url"
            },
            {
                "base_type": "type/Text",
                "display_name": "Category List",
                "name": "category_list"
            },
            {
                "base_type": "type/Text",
                "display_name": "Market",
                "name": "market"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Funding Total Usd",
                "name": "funding_total_usd"
            },
            {
                "base_type": "type/Text",
                "display_name": "Status",
                "name": "status"
            },
            {
                "base_type": "type/Text",
                "display_name": "Country Code",
                "name": "country_code"
            },
            {
                "base_type": "type/Text",
                "display_name": "State Code",
                "name": "state_code"
            },
            {
                "base_type": "type/Text",
                "display_name": "Region",
                "name": "region"
            },
            {
                "base_type": "type/Text",
                "display_name": "City",
                "name": "city"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Funding Rounds",
                "name": "funding_rounds"
            },
            {
                "base_type": "type/Date",
                "display_name": "Founded At",
                "name": "founded_at"
            },
            {
                "base_type": "type/Text",
                "display_name": "Founded Month",
                "name": "founded_month"
            },
            {
                "base_type": "type/Text",
                "display_name": "Founded Quarter",
                "name": "founded_quarter"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Founded Year",
                "name": "founded_year"
            },
            {
                "base_type": "type/Date",
                "display_name": "First Funding At",
                "name": "first_funding_at"
            },
            {
                "base_type": "type/Date",
                "display_name": "Last Funding At",
                "name": "last_funding_at"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 6,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "Issue #3615",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-16T22:21:02.679Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 6,
            "type": "native",
            "native": {
                "query": "select * from companies where {{market}};",
                "collection": "acquisitions",
                "template_tags": {
                    "market": {
                        "id": "e9e850f3-ec6b-528e-40cf-16b96272111e",
                        "name": "market",
                        "display_name": "Market",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            138
                        ]
                    }
                }
            }
        },
        "id": 329,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-16T22:20:54.565Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": "https://github.com/metabase/metabase/issues/3959",
        "archived": false,
        "labels": [],
        "table_id": 2,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Issue #3959",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-05-03T00:35:23.405Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 2,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        14
                    ],
                    [
                        "datetime-field",
                        [
                            "field-id",
                            22
                        ],
                        "as",
                        "day"
                    ]
                ]
            }
        },
        "id": 246,
        "display": "area",
        "visualization_settings": {
            "stackable.stack_type": "normalized",
            "graph.y_axis.auto_range": false,
            "graph.y_axis.max": 0.1
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-03T00:35:23.405Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "Issue Canary",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:23:28.449Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT created_at, \nreviewer,\nproduct_id\nFROM (\nSELECT\n\"PUBLIC\".\"REVIEWS\".\"CREATED_AT\" AS created_at, \n\"PUBLIC\".\"REVIEWS\".\"BODY\" AS body, \n\"PUBLIC\".\"REVIEWS\".\"RATING\" AS rating, \n\"PUBLIC\".\"REVIEWS\".\"REVIEWER\" AS reviewer, \n\"PUBLIC\".\"REVIEWS\".\"PRODUCT_ID\" AS product_id, \n\"PUBLIC\".\"REVIEWS\".\"ID\" AS id\nFROM \"PUBLIC\".\"REVIEWS\"\nWHERE \"PUBLIC\".\"REVIEWS\".\"PRODUCT_ID\" = {{productID}}\nUNION ALL\nSELECT\n\"PUBLIC\".\"REVIEWS\".\"CREATED_AT\" AS created_at, \n\"PUBLIC\".\"REVIEWS\".\"BODY\" AS body, \n\"PUBLIC\".\"REVIEWS\".\"RATING\" AS rating, \n\"PUBLIC\".\"REVIEWS\".\"REVIEWER\" AS reviewer, \n\"PUBLIC\".\"REVIEWS\".\"PRODUCT_ID\" AS product_id, \n\"PUBLIC\".\"REVIEWS\".\"ID\" AS id\nFROM \"PUBLIC\".\"REVIEWS\"\nWHERE \"PUBLIC\".\"REVIEWS\".\"PRODUCT_ID\" = {{productID}}\n) AS derived\nwhere product_id = {{productID}}\nORDER BY created_at",
                "collection": "ORDERS",
                "template_tags": {
                    "productID": {
                        "id": "a2e5f4d7-03e0-c860-4813-44c029e5ffde",
                        "name": "productID",
                        "display_name": "Productid",
                        "type": "number"
                    }
                }
            }
        },
        "id": 158,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-01T19:22:14.886Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": "If it was closed in the past 7 days then it's included.",
        "archived": false,
        "labels": [],
        "table_id": 10,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Issues closed in the last 7 days",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-10-24T17:11:32.238Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 10,
                "aggregation": [
                    "count"
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        "TIME_INTERVAL",
                        86,
                        -7,
                        "day"
                    ]
                ]
            }
        },
        "id": 35,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": true,
        "created_at": "2016-01-25T18:56:44.308Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1232,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Java Vm Specification Version",
                "name": "java_vm_specification_version",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "ryan@metabase.com",
            "first_name": "Ryan",
            "last_login": "2018-01-09T18:22:23.762Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 20,
            "last_name": "Senior",
            "date_joined": "2017-05-08T17:08:52.534Z",
            "common_name": "Ryan Senior"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "query",
        "name": "Java Versions in the Wild",
        "in_public_dashboard": false,
        "creator_id": 20,
        "updated_at": "2018-01-16T16:00:11.591Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "query",
            "query": {
                "source_table": 1232,
                "filter": [
                    "AND",
                    [
                        "NOT_NULL",
                        [
                            "field-id",
                            13713
                        ]
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        13718
                    ]
                ],
                "aggregation": [
                    [
                        "count"
                    ]
                ]
            }
        },
        "id": 316,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-02T13:55:12.924Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": "Excludes PRs it would seem.",
        "archived": false,
        "labels": [],
        "table_id": 10,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "id",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Closed At",
                "name": "closed_at",
                "unit": "default"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "created_at",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "Labels",
                "name": "labels"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Number",
                "name": "number",
                "special_type": "type/URL"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Sender ID",
                "name": "sender_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Sender Login",
                "name": "sender_login",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "State",
                "name": "state",
                "special_type": "type/State"
            },
            {
                "base_type": "type/Text",
                "display_name": "Title",
                "name": "title"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Updated At",
                "name": "updated_at",
                "unit": "default"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "kdoh issues closed last 7 days",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-13T01:45:58.186Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 10,
                "filter": [
                    "AND",
                    [
                        "TIME_INTERVAL",
                        86,
                        -7,
                        "day"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            92
                        ],
                        "kdoh"
                    ]
                ],
                "order_by": [
                    [
                        [
                            "field-id",
                            92
                        ],
                        "ascending"
                    ]
                ]
            }
        },
        "id": 351,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": true,
        "created_at": "2017-10-24T17:12:56.006Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Labels per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:48.781Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'label'->>'labels')::int/5)*5 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 181,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T02:19:02.680Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": "",
        "archived": false,
        "labels": [],
        "table_id": 7,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "Last week canary card",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:23:28.481Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    58
                ],
                "filter": [
                    "AND",
                    [
                        "TIME_INTERVAL",
                        58,
                        "last",
                        "week"
                    ]
                ]
            }
        },
        "id": 29,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-21T19:50:55.260Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 19,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Protocol",
                "name": "protocol",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Raw Time",
                "name": "raw_time",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Box State",
                "name": "state",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "default"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Litter box data, simplified",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-09-18T23:32:55.547Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 19
            }
        },
        "id": 311,
        "display": "table",
        "visualization_settings": {
            "table.columns": [
                {
                    "name": "protocol",
                    "enabled": true
                },
                {
                    "name": "raw_time",
                    "enabled": false
                },
                {
                    "name": "state",
                    "enabled": true
                },
                {
                    "name": "time",
                    "enabled": true
                }
            ]
        },
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-18T23:32:55.547Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 20,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "Long running baseball query",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-05-20T00:13:01.707Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 20,
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            247
                        ],
                        "K"
                    ]
                ],
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "limit": 100,
                "breakout": [
                    [
                        "fk->",
                        222,
                        517
                    ]
                ]
            }
        },
        "id": 256,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-20T00:12:32.683Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": "Just a really long SQL query which could result in 414 and other errors.  Tests our ability to deal with arbitrarily long query definitions.",
        "archived": false,
        "labels": [
            {
                "id": 1,
                "name": "Test Validations",
                "slug": "test_validations",
                "icon": ":ghost:"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Lskflskjfslkjflskjfsl Kjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjsl Fjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkf Jslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjs Lkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfs Lkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfksl Kfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkf Jslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfj Slkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdls Kflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjsl Kfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsld Fjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjfl Skjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfs Lkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjsl Fjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljf Slkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjf Sldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjs Ljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslk Fjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslf Jslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkd Fjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjs Lkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjsl Kfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjf Slkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkf Jslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfj Slfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslk Jfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslf Jsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfj Slkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjsl Kfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfsl Kfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslk Fjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfj Slkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjs Lkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlsk Flskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslk Fjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldf Jslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjfls Kjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfsl Kfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslf Jslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfs Lkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfs Ldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsl Jfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkf Jslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfj Slkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdf Jsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjsl Kfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslk Fjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfs Lkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfj Slkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjs Lfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkj Fsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfj Sldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjs Lkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslk Fjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslk Fjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkf Jslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjs Lkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjsl Kfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskf Lskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkf Jslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfj Slkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflsk Jfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslk Fjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfj Slkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfsl Kfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsl Djfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjslj Fkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfj Slkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjs Lkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfj Sdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslk Fjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkf Jsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfsl Kjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjs Lkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjsl Fjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjf Sljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjs Ldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjsl Kfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkf Jslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkf Jslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfj Slkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjsl Kfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslk Fjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskfl Skjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfj Slkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjs Lkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskj Fslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkf Jslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjs Lkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslk Fjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsld Jfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljf Kslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjs Lkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjsl Kfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjs Dlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkf Jslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfj Sldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslk Jflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjsl Kfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslf Jslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfs Ljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsl Djfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslk Fjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfj Slkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfj Slfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjs Lkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslk Fjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkf Jslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskfls Kjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjs Lkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjsl Kfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjf Slkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfj Slfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjsl Kfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkf Jslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldj Fslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfk Slkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjsl Kfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslk Fjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsd",
                "name": "LSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSDLSKFLSKJFSLKJFLSKJFSLKJFSLJFSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFJSLKFSLKFJSLFJSLDJFSLDJFSLKFJSLFJSLKFJSLKFJSLKFJSLDFJSLKFJSLFJSLFJSLKFJSLKFJSLJFKSLKFJSLKDFJSD"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "Long SQL Test",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-10-12T22:19:42.222Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT 5 as lskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsdlskflskjfslkjflskjfslkjfsljfslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfjslkfslkfjslfjsldjfsldjfslkfjslfjslkfjslkfjslkfjsldfjslkfjslfjslfjslkfjslkfjsljfkslkfjslkdfjsd"
            }
        },
        "id": 56,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-11T21:48:09.782Z",
        "public_uuid": null,
        spaces: [4]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Mac App Opens over Time",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-08T21:27:05.165Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            72
                        ],
                        "appcast.xml"
                    ]
                ],
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 332,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": true,
        "created_at": "2017-10-17T01:00:29.232Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "The difference between actives last month vs. 2 months ago, divided by 2 months ago. The SQL in this question is awful because I have no idea what I'm doing.",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "?column?",
                "name": "?column?"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "MAI Growth Last Month",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-03T20:26:18.785Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "Select (\n    100*\n    (\n        (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-1 month')))\n            )  \n            - \n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count2\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-2 month')))\n            )\n        )\n        /\n        (cast (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count3\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-2 month')))\n            )\n            as float\n            )\n        )\n    )\n) "
            },
            "parameters": []
        },
        "id": 229,
        "display": "scalar",
        "visualization_settings": {
            "graph.colors": [
                "#A989C5",
                "#9CC177",
                "#A989C5",
                "#EF8C8C",
                "#f9d45c"
            ]
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-29T19:03:02.892Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Excludes lower volume DBs",
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "month"
            },
            {
                "base_type": "type/Text",
                "display_name": "Event Label",
                "name": "ga:eventLabel",
                "description": "Event label.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 23,
        "query_type": "query",
        "name": "Major DB creations by DB type",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-11-06T21:54:08.724Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        27
                    ],
                    [
                        "SEGMENT",
                        29
                    ]
                ],
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "month"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ]
            }
        },
        "id": 369,
        "display": "area",
        "visualization_settings": {
            "stackable.stack_type": "normalized"
        },
        "collection": {
            "id": 23,
            "name": "Database Tracking",
            "slug": "database_tracking",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-06T21:54:08.724Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 4,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "map",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2016-08-09T22:04:36.118Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 4,
                "aggregation": [
                    "rows"
                ],
                "breakout": [],
                "filter": []
            }
        },
        "id": 133,
        "display": "map",
        "visualization_settings": {
            "map.zoom": 3
        },
        "collection": null,
        "favorite": false,
        "created_at": "2016-08-09T17:21:58.948Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 10,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "created_at",
                "unit": "month"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Maz has grown crankier over time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-24T17:11:18.973Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 10,
                "filter": [
                    "AND",
                    [
                        "!=",
                        [
                            "field-id",
                            93
                        ],
                        "closed"
                    ],
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            89
                        ],
                        "UX"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            92
                        ],
                        "mazameli"
                    ]
                ],
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            87
                        ],
                        "as",
                        "month"
                    ]
                ]
            }
        },
        "id": 242,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-04-26T20:38:35.393Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count(*)",
                "name": "COUNT(*)"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "Maz's cool localhost question",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-22T20:17:50.205Z",
        "made_public_by_id": 2,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT count(*)\nFROM products\n[[WHERE category = {{category}}]]",
                "template_tags": {
                    "category": {
                        "id": "4b1ea8a9-63bf-9cf3-a03e-e1bf71f82ce5",
                        "name": "category",
                        "display_name": "Category",
                        "type": "text"
                    }
                }
            }
        },
        "id": 233,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-31T18:39:14.542Z",
        "public_uuid": "bb205612-3b1a-432f-900f-e5695e4ec4e0",
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count(*)",
                "name": "COUNT(*)"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "Maz SQL test",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-12T20:15:17.743Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT count(*)\nFROM products\nWHERE {{created_at}}",
                "template_tags": {
                    "created_at": {
                        "name": "created_at",
                        "display_name": "Created at",
                        "type": "dimension",
                        "required": true,
                        "default": "Widget",
                        "id": "ae5d6615-ccf1-e99e-d6d1-a660caa224f8",
                        "dimension": [
                            "field-id",
                            29
                        ],
                        "widget_type": "date/month-year"
                    }
                }
            }
        },
        "id": 380,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-28T03:57:31.789Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 15,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "First Funding At",
                "name": "first_funding_at",
                "unit": "month"
            },
            {
                "base_type": "type/Integer",
                "display_name": "sum",
                "name": "sum",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 6,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Maz test - alert emails bug",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-12-20T17:15:34.529Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 6,
            "type": "query",
            "query": {
                "source_table": 15,
                "aggregation": [
                    [
                        "METRIC",
                        9
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        129,
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "BETWEEN",
                        129,
                        "2005-12-31",
                        "2008-12-31"
                    ]
                ]
            }
        },
        "id": 68,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-03-03T20:07:34.097Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date the product was added to our catalog.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Maz test: products over time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-06T17:03:40.224Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 3,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        [
                            "field-id",
                            29
                        ],
                        "as",
                        "day"
                    ]
                ]
            }
        },
        "id": 209,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-01-27T19:49:38.965Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 10,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Sender Login",
                "name": "sender_login",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "\"Maz would like to file a UX complaint\"",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-09-18T17:08:08.859Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 10,
                "filter": [
                    "AND",
                    [
                        "!=",
                        [
                            "field-id",
                            93
                        ],
                        "closed"
                    ],
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            89
                        ],
                        "UX"
                    ]
                ],
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        92
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ]
            }
        },
        "id": 241,
        "display": "pie",
        "visualization_settings": {
            "table.columns": [
                {
                    "name": "number",
                    "enabled": true
                },
                {
                    "name": "title",
                    "enabled": true
                },
                {
                    "name": "id",
                    "enabled": false
                },
                {
                    "name": "created_at",
                    "enabled": true
                },
                {
                    "name": "labels",
                    "enabled": false
                },
                {
                    "name": "sender_id",
                    "enabled": false
                },
                {
                    "name": "closed_at",
                    "enabled": false
                },
                {
                    "name": "state",
                    "enabled": false
                },
                {
                    "name": "sender_login",
                    "enabled": true
                },
                {
                    "name": "updated_at",
                    "enabled": true
                }
            ]
        },
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-04-26T20:21:04.746Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "metabase.com monthly page views",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:25:16.123Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    "METRIC",
                    "ga:pageviews"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        7105,
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        7105,
                        "2015-11-01"
                    ]
                ]
            }
        },
        "id": 193,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-21T20:42:22.565Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1259,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 15,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Metabasers' Name Popularity in the USA over time",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-01-06T07:18:01.591Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 15,
            "type": "query",
            "query": {
                "source_table": 1259,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        7765
                    ],
                    [
                        "field-id",
                        7768
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            7765
                        ],
                        "Tom",
                        "Maz",
                        "Kyle",
                        "Sameer",
                        "Cam"
                    ]
                ]
            }
        },
        "id": 201,
        "display": "line",
        "visualization_settings": {
            "table.column_widths": [],
            "line.marker_enabled": false,
            "line.interpolate": "cardinal",
            "line.missing": "zero"
        },
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-01-06T07:14:20.814Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Display URL",
                "name": "ga:adDisplayUrl",
                "description": "The URL the AdWords ads displayed."
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:page Load Sample",
                "name": "ga:pageLoadSample"
            }
        ],
        "creator": {
            "email": "cam@metabase.com",
            "first_name": "Cam",
            "last_login": "2018-01-02T23:47:22.792Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 6,
            "last_name": "Saul",
            "date_joined": "2015-10-24T16:00:48.515Z",
            "common_name": "Cam Saul"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Metabases, Users",
        "in_public_dashboard": false,
        "creator_id": 6,
        "updated_at": "2017-11-16T01:18:03.928Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:pageLoadSample"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        6808
                    ]
                ]
            }
        },
        "id": 379,
        "display": "table",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-11-16T01:16:17.614Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Metabases, Users, Grouped by Country ISO Code",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:24:54.254Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    "METRIC",
                    "ga:users"
                ],
                "breakout": [
                    6846
                ],
                "filter": []
            }
        },
        "id": 160,
        "display": "map",
        "visualization_settings": {
            "graph.y_axis.auto_split": false,
            "map.region": "world_countries"
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": true,
        "created_at": "2016-12-02T00:19:11.081Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Metrics per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:50.038Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'metric'->>'metrics')::int/5)*5 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 183,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T02:20:19.231Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Number of distinct values of remote IPs phoning home to check for new versions of MB.",
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "month"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Monthly Active Installations",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-16T00:50:41.720Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        [
                            "field-id",
                            80
                        ],
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            72
                        ],
                        "version"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            80
                        ],
                        -6,
                        "month"
                    ]
                ]
            }
        },
        "id": 204,
        "display": "bar",
        "visualization_settings": {
            "graph.colors": [
                "#A989C5",
                "#9CC177",
                "#A989C5",
                "#EF8C8C",
                "#f9d45c"
            ]
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-01-24T18:22:08.332Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Mobile and tabled sessions by month",
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "month"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:sessions",
                "name": "ga:sessions"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Monthly mobile sessions",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-11-04T00:12:33.761Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:sessions"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        "gaid::-11"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            6851
                        ],
                        -1,
                        "year"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "month"
                    ]
                ]
            }
        },
        "id": 364,
        "display": "bar",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-11-04T00:11:38.204Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "The difference between actives last month vs. 2 months ago, divided by 2 months ago. Repeated for the two spans before last month as well. The SQL in this question is awful because I have no idea what I'm doing.",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Last Month",
                "name": "Last month"
            },
            {
                "base_type": "type/Float",
                "display_name": "Two Months Ago",
                "name": "Two months ago"
            },
            {
                "base_type": "type/Float",
                "display_name": "Three Months Ago",
                "name": "Three months ago"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Month/month growth, rolling last 3 months",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-24T21:32:49.722Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "Select (\n    100*\n    (\n        (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-1 month')))\n            )  \n            - \n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count2\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-2 month')))\n            )\n        )\n        /\n        (cast (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count3\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-2 month')))\n            )\n            as float\n            )\n        )\n    )\n) as \"Last month\",\n (\n 100*\n    (\n        (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-2 month')))\n            )  \n            - \n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count2\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-3 month')))\n            )\n        )\n        /\n        (cast (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count3\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-3 month')))\n            )\n            as float\n            )\n        )\n    )\n ) as \"Two months ago\",\n (\n 100*\n    (\n        (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-3 month')))\n            )  \n            - \n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count2\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-4 month')))\n            )\n        )\n        /\n        (cast (\n            (\n            SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count3\"\n            FROM \"public\".\"entries\"\n            WHERE ((\"public\".\"entries\".\"key\" like 'version%')\n            AND date_trunc('month', \"public\".\"entries\".\"time\") = date_trunc('month', (NOW() + INTERVAL '-4 month')))\n            )\n            as float\n            )\n        )\n    )\n ) as \"Three months ago\"\n "
            },
            "parameters": []
        },
        "id": 248,
        "display": "table",
        "visualization_settings": {
            "graph.colors": [
                "#A989C5",
                "#9CC177",
                "#A989C5",
                "#EF8C8C",
                "#f9d45c"
            ],
            "scalar.suffix": " %",
            "scalar.decimals": 2,
            "card.title": "Active installations increase last month"
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-10T17:52:12.400Z",
        "public_uuid": null,
        spaces: [5]
    },
    {
        "description": "Lists GH users by the number of issues they were the last to update, including the total percentage of issues.  NOTE: attribution of issues to users is a bit strange here because it users the last user to touch the issue, not necessarily the owner, creator, or most commented.",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Sender Login",
                "name": "sender_login"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Cnt",
                "name": "cnt"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Percent",
                "name": "percent"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Most active GH users",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-11-07T19:47:30.222Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "SELECT sender_login, count(*) cnt, (count(*) / sum(count(*)) OVER ())*100.0 as percent\nFROM metabase_issues\nGROUP BY sender_login\nORDER BY percent DESC"
            }
        },
        "id": 55,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-11T06:02:52.428Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT"
            }
        ],
        "creator": {
            "email": "ryan@metabase.com",
            "first_name": "Ryan",
            "last_login": "2018-01-09T18:22:23.762Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 20,
            "last_name": "Senior",
            "date_joined": "2017-05-08T17:08:52.534Z",
            "common_name": "Ryan Senior"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "native",
        "name": "Native Orders with Goal",
        "in_public_dashboard": false,
        "creator_id": 20,
        "updated_at": "2018-01-04T18:16:59.051Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT count(*) AS \"count\", parsedatetime(formatdatetime(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\", 'yyyyMM'), 'yyyyMM') AS \"CREATED_AT\"\nFROM \"PUBLIC\".\"ORDERS\"\nWHERE CAST(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" AS date) > CAST('2018-12-31' AS date)\nGROUP BY parsedatetime(formatdatetime(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\", 'yyyyMM'), 'yyyyMM')\nORDER BY parsedatetime(formatdatetime(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\", 'yyyyMM'), 'yyyyMM') ASC",
                "template_tags": {}
            }
        },
        "id": 383,
        "display": "line",
        "visualization_settings": {
            "graph.dimensions": [
                "CREATED_AT"
            ],
            "graph.metrics": [
                "count"
            ],
            "graph.show_goal": true,
            "graph.goal_value": 410
        },
        "collection": null,
        "favorite": false,
        "created_at": "2017-11-30T14:38:50.544Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Native vs. GUI queries, last 30 days",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2017-04-11T21:45:11.417Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Run Query"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            6851
                        ],
                        -30,
                        "day"
                    ],
                    [
                        "!=",
                        [
                            "field-id",
                            6939
                        ],
                        "(not set)",
                        "url"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        6939
                    ]
                ]
            }
        },
        "id": 214,
        "display": "pie",
        "visualization_settings": {
            "table.column_widths": [],
            "graph.x_axis.title_text": "Query Type",
            "graph.y_axis.title_text": "Count",
            "graph.colors": [
                "#A989C5",
                "#9cc177",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ]
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-02-22T21:45:02.446Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "month"
            },
            {
                "base_type": "type/Text",
                "display_name": "Event Label",
                "name": "ga:eventLabel",
                "description": "Event label.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Native vs GUI query execution trends",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-03T23:32:27.992Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "as",
                        "month"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6938
                        ],
                        "QueryBuilder"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Create Card"
                    ]
                ]
            }
        },
        "id": 362,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-03T23:32:27.992Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "id",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Comments",
                "name": "comments",
                "special_type": "type/Description"
            },
            {
                "base_type": "type/Text",
                "display_name": "Company Size",
                "name": "company_size",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Contact Choice",
                "name": "contact_choice",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Contact Details",
                "name": "contact_details",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Dislikes",
                "name": "dislikes",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Dislikes Comment",
                "name": "dislikes_comment",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Hash",
                "name": "hash",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "IP",
                "name": "ip",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "NPS",
                "name": "nps",
                "description": "Net Promoter Score",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Reason",
                "name": "reason",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Reason Comments",
                "name": "reason_comments",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source",
                "name": "source",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source Comments",
                "name": "source_comments",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Survey ID",
                "name": "survey_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "TS",
                "name": "ts",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "Usage",
                "name": "usage",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Negative surveys yesterday",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-16T16:00:04.566Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "filter": [
                    "AND",
                    [
                        "<",
                        [
                            "field-id",
                            532
                        ],
                        8
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            537
                        ],
                        -1,
                        "day"
                    ]
                ],
                "order_by": [
                    [
                        530,
                        "descending"
                    ]
                ]
            }
        },
        "id": 377,
        "display": "table",
        "visualization_settings": {
            "table.columns": [
                {
                    "name": "id",
                    "enabled": true
                },
                {
                    "name": "nps",
                    "enabled": true
                },
                {
                    "name": "comments",
                    "enabled": true
                },
                {
                    "name": "company_size",
                    "enabled": true
                },
                {
                    "name": "contact_choice",
                    "enabled": true
                },
                {
                    "name": "contact_details",
                    "enabled": true
                },
                {
                    "name": "dislikes",
                    "enabled": true
                },
                {
                    "name": "dislikes_comment",
                    "enabled": true
                },
                {
                    "name": "hash",
                    "enabled": false
                },
                {
                    "name": "ip",
                    "enabled": true
                },
                {
                    "name": "reason",
                    "enabled": true
                },
                {
                    "name": "reason_comments",
                    "enabled": true
                },
                {
                    "name": "source",
                    "enabled": true
                },
                {
                    "name": "source_comments",
                    "enabled": true
                },
                {
                    "name": "survey_id",
                    "enabled": true
                },
                {
                    "name": "ts",
                    "enabled": true
                },
                {
                    "name": "usage",
                    "enabled": true
                }
            ]
        },
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-15T19:26:53.469Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Nested query events over time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-04T17:32:40.193Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6939
                        ],
                        ":nest-query"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-07-23"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 286,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T17:08:42.344Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "ID"
            },
            {
                "base_type": "type/Integer",
                "display_name": "User ID",
                "name": "USER_ID"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Product ID",
                "name": "PRODUCT_ID"
            },
            {
                "base_type": "type/Float",
                "display_name": "Subtotal",
                "name": "SUBTOTAL"
            },
            {
                "base_type": "type/Float",
                "display_name": "Tax",
                "name": "TAX"
            },
            {
                "base_type": "type/Float",
                "display_name": "Total",
                "name": "TOTAL"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT"
            },
            {
                "base_type": "type/Text",
                "display_name": "Title",
                "name": "TITLE"
            },
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY"
            },
            {
                "base_type": "type/Text",
                "display_name": "Vendor",
                "name": "VENDOR"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "native",
        "name": "Nested Query Example Question",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-19T22:20:02.883Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select o.id, o.user_id, o.product_id, o.subtotal, o.tax, o.total, o.created_at, p.title, p.category,  p.vendor\nfrom orders o join products p \nwhere o.product_id = p.id\n\n",
                "collection": "ORDERS",
                "template_tags": {}
            }
        },
        "id": 346,
        "display": "table",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-10-19T22:18:38.805Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Nested Query Example Questions, Count, Grouped by Created At (day)",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-19T22:21:08.380Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": -1337,
            "type": "query",
            "query": {
                "source_table": "card__346",
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            [
                                "field-literal",
                                "CREATED_AT",
                                "type/DateTime"
                            ]
                        ],
                        "as",
                        "day"
                    ]
                ]
            }
        },
        "id": 347,
        "display": "bar",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-10-19T22:20:57.480Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "Percentage of total respondents who are Promoters ( score > 8) minus percentage of detractors (score < 7).",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Nps",
                "name": "nps"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "native",
        "name": "Net Promoter Score (NPS)",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-16T07:00:15.576Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "native",
            "native": {
                "query": "SELECT \nSUM(CASE \n  WHEN nps < 7 then -1 \n  WHEN nps >8 then 1\n  ELSE NULL END\n) * 100 / COUNT(*) as NPS\nFROM \nfollowup_survey_results;"
            }
        },
        "id": 101,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-10T23:37:00.592Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "New Users",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:32:15.818Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    "METRIC",
                    "ga:newUsers"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        6851,
                        "as",
                        "day"
                    ]
                ],
                "filter": []
            }
        },
        "id": 187,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-15T20:46:01.032Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 7,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Id",
                "name": "id",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Event",
                "name": "event",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Fork Repo Fullname",
                "name": "fork_repo_fullname",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Fork Repo Id",
                "name": "fork_repo_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Forks",
                "name": "forks",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Repo Fullname",
                "name": "repo_fullname",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Repo Id",
                "name": "repo_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp",
                "special_type": "type/UNIXTimestampMilliseconds",
                "unit": "default"
            },
            {
                "base_type": "type/Integer",
                "display_name": "User Id",
                "name": "user_id"
            },
            {
                "base_type": "type/Text",
                "display_name": "User Login",
                "name": "user_login"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Watchers",
                "name": "watchers"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "No result table",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-05T19:03:33.675Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 7,
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            55
                        ],
                        0
                    ]
                ]
            }
        },
        "id": 257,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-21T16:32:06.002Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Week",
                "name": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "no sql skinny bars (#2282)",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-17T19:31:21.104Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "SELECT tm as week, count(*)\nFROM (VALUES\n  ('2016-03-08'),\n  ('2016-03-15'),\n  ('2016-03-22')\n) AS t(tm)\nGROUP BY week\nORDER BY week;"
            }
        },
        "id": 79,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-05T18:22:20.325Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "NPS",
                "name": "nps",
                "description": "Net Promoter Score",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "NPS distribution",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:03.672Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    532
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        537,
                        "2016-05-03"
                    ]
                ]
            }
        },
        "id": 93,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-05T19:17:19.767Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Nps",
                "name": "nps"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "native",
        "name": "NPS, previous 90 days",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:04:20.272Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "native",
            "native": {
                "query": "SELECT \nSUM(CASE \n  WHEN nps < 7 then -1 \n  WHEN nps >8 then 1\n  ELSE NULL END\n) * 100 / COUNT(*) as NPS\nFROM \nfollowup_survey_results\nWHERE CAST(\"public\".\"followup_survey_results\".\"ts\" AS date) BETWEEN CAST((NOW() + INTERVAL '-90 day') AS date)\n   AND CAST((NOW() + INTERVAL '-1 day') AS date)\n;",
                "template_tags": {}
            }
        },
        "id": 277,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-07-21T21:52:12.785Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "Testing",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Nps",
                "name": "nps"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "native",
        "name": "NPS with time filter",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-15T19:23:26.304Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "native",
            "native": {
                "query": "SELECT \nSUM(CASE \n  WHEN nps < 7 then -1 \n  WHEN nps >8 then 1\n  ELSE NULL END\n) * 100 / COUNT(*) as NPS\nFROM \nfollowup_survey_results\n[[WHERE {{time}}]]\n;",
                "template_tags": {
                    "time": {
                        "id": "4829bb29-8095-e38c-db60-2beebe941e31",
                        "name": "time",
                        "display_name": "Time",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            537
                        ],
                        "widget_type": "date/all-options",
                        "default": null
                    }
                }
            }
        },
        "id": 239,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-04-20T16:50:51.668Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:pageviews",
                "name": "ga:pageviews"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 19,
        "query_type": "query",
        "name": "NQF: metric page views over time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-05T17:10:59.104Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:pageviews"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6991
                        ],
                        "/question/new/metric"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 324,
        "display": "line",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ]
        },
        "collection": {
            "id": 19,
            "name": "Release 0.26 usage",
            "slug": "release_0_26_usage",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-05T17:10:34.222Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 18,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 13,
        "query_type": "query",
        "name": "Number of contact form submissions by day",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-06T23:11:45.848Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 18,
                "aggregation": [
                    "METRIC",
                    8
                ],
                "breakout": [
                    191
                ],
                "filter": []
            }
        },
        "id": 64,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 13,
            "name": "User Communications",
            "slug": "user_communications",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-26T18:10:55.632Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Number of distinct remote IPs with download events",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-07T17:19:31.806Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    "distinct",
                    45
                ],
                "breakout": [
                    [
                        "datetime_field",
                        49,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        4
                    ],
                    [
                        "TIME_INTERVAL",
                        49,
                        "current",
                        "year"
                    ]
                ]
            }
        },
        "id": 74,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-03-30T17:02:03.176Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Keys",
                "name": "keys"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "My Sum",
                "name": "mysum"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Number of Labels Per Card",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:18.713Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys,\nSUM(json_extract_path_text(col, keys)::NUMERIC) as mysum\nFROM\n(select\nstats->'label'->'num_labels_per_card' as col,\njson_object_keys(stats->'label'->'num_labels_per_card') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 163,
        "display": "pie",
        "visualization_settings": {},
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T00:02:26.776Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Number of Orders",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-09-28T17:13:00.896Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ]
            }
        },
        "id": 238,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-04-13T22:24:34.949Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Number of Users per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:32:24.874Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'user'->'users'->>'total')::int/5)*5 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 203,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-01-17T03:51:26.069Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 2,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "One-star Reviews per Month",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2016-06-17T21:21:08.569Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 2,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        22,
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        14,
                        1
                    ]
                ]
            }
        },
        "id": 116,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#EF8C8C",
                "marker_fillColor": "#EF8C8C",
                "marker_lineColor": "#EF8C8C"
            },
            "area": {
                "fillColor": "#EF8C8C"
            },
            "bar": {
                "color": "#EF8C8C"
            }
        },
        "collection": null,
        "favorite": false,
        "created_at": "2016-06-17T21:21:08.569Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "",
        "archived": false,
        "labels": [
            {
                "id": 11,
                "name": "Bug Tracking",
                "slug": "bug_tracking",
                "icon": "#ED6E6E"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Day",
                "name": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Open Issues",
                "name": "Open Issues"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Open bug count per day",
        "in_public_dashboard": true,
        "creator_id": 1,
        "updated_at": "2018-01-16T17:04:20.927Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "WITH days AS (\n    SELECT generate_series('2015-07-14'::date, current_date, '1 day') AS day\n)\nSELECT day, count(*) AS \"Open Issues\"\nFROM days\nJOIN metabase_issues i \n  ON i.created_at < day\n AND (i.closed_at IS NULL OR i.closed_at::date > day)\nWHERE i.labels ILIKE '%bug%'\nGROUP BY day\nORDER BY day",
                "template_tags": {}
            }
        },
        "id": 43,
        "display": "area",
        "visualization_settings": {
            "line": {
                "lineColor": "#EF8C8C",
                "marker_fillColor": "#EF8C8C",
                "marker_lineColor": "#EF8C8C"
            },
            "area": {
                "fillColor": "#EF8C8C"
            },
            "bar": {
                "color": "#EF8C8C"
            }
        },
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-29T05:18:34.177Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": "total count of open bugs in GitHub",
        "archived": false,
        "labels": [
            {
                "id": 11,
                "name": "Bug Tracking",
                "slug": "bug_tracking",
                "icon": "#ED6E6E"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Open Bugs",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-16T16:00:07.820Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "select count(*) \nfrom metabase_issues \nwhere (labels like '%Bug%' or labels like '%bug%')\nand state = 'open';"
            }
        },
        "id": 32,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": true,
        "created_at": "2016-01-25T01:23:13.767Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 10,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Open UX Issues",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-26T18:00:07.960Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 10,
                "filter": [
                    "AND",
                    [
                        "!=",
                        [
                            "field-id",
                            93
                        ],
                        "closed"
                    ],
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            89
                        ],
                        "UX"
                    ]
                ],
                "order_by": [
                    [
                        87,
                        "descending"
                    ]
                ]
            }
        },
        "id": 240,
        "display": "table",
        "visualization_settings": {
            "table.columns": [
                {
                    "name": "number",
                    "enabled": true
                },
                {
                    "name": "title",
                    "enabled": true
                },
                {
                    "name": "id",
                    "enabled": false
                },
                {
                    "name": "created_at",
                    "enabled": true
                },
                {
                    "name": "labels",
                    "enabled": false
                },
                {
                    "name": "sender_id",
                    "enabled": false
                },
                {
                    "name": "closed_at",
                    "enabled": false
                },
                {
                    "name": "state",
                    "enabled": false
                },
                {
                    "name": "sender_login",
                    "enabled": true
                },
                {
                    "name": "updated_at",
                    "enabled": true
                }
            ]
        },
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-04-26T17:52:34.269Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "atte@metabase.com",
            "first_name": "Atte",
            "last_login": "2018-01-13T12:39:13.697Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 18,
            "last_name": "Keinänen",
            "date_joined": "2017-03-16T23:11:36.072Z",
            "common_name": "Atte Keinänen"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "Order Count SQL",
        "in_public_dashboard": false,
        "creator_id": 18,
        "updated_at": "2017-10-24T21:32:24.021Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT count(*) AS \"count\"\nFROM \"PUBLIC\".\"ORDERS\" WHERE {{created_at}}",
                "template_tags": {
                    "created_at": {
                        "id": "e6cdff7a-2064-a277-0a9b-44df1a00cfb0",
                        "name": "created_at",
                        "display_name": "Created at",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            25
                        ]
                    }
                }
            }
        },
        "id": 235,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-31T22:19:10.293Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Id",
                "name": "ID",
                "description": "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "default"
            },
            {
                "base_type": "type/Float",
                "display_name": "Discount",
                "name": "DISCOUNT",
                "description": "Discount amount."
            },
            {
                "base_type": "type/Integer",
                "display_name": "Product ID",
                "name": "PRODUCT_ID",
                "description": "The product ID. This is an internal identifier for the product, NOT the SKU.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Quantity",
                "name": "QUANTITY",
                "description": "Number of products bought.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Float",
                "display_name": "Subtotal",
                "name": "SUBTOTAL",
                "description": "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Tax",
                "name": "TAX",
                "description": "This is the amount of local and federal taxes that are collected on the purchase. Note that other governmental fees on some products are not included here, but instead are accounted for in the subtotal.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Total",
                "name": "TOTAL",
                "description": "The total billed amount."
            },
            {
                "base_type": "type/Integer",
                "display_name": "User Id",
                "name": "USER_ID",
                "description": "The id of the user who made this order. Note that in some cases where an order was created on behalf of a customer who phoned the order in, this might be the employee who handled the request.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Product ID",
                "name": "TITLE",
                "description": "The name of the product as it should be displayed to customers.",
                "special_type": "type/Name"
            },
            {
                "base_type": "type/Text",
                "display_name": "User Id",
                "name": "NAME",
                "description": "The name of the user who owns an account",
                "special_type": "type/Name"
            }
        ],
        "creator": {
            "email": "atte@metabase.com",
            "first_name": "Atte",
            "last_login": "2018-01-13T12:39:13.697Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 18,
            "last_name": "Keinänen",
            "date_joined": "2017-03-16T23:11:36.072Z",
            "common_name": "Atte Keinänen"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 18,
        "query_type": "query",
        "name": "Orders",
        "in_public_dashboard": false,
        "creator_id": 18,
        "updated_at": "2018-01-09T12:14:10.373Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1
            }
        },
        "id": 270,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 18,
            "name": "Sample Dataset",
            "slug": "sample_dataset",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-19T00:16:40.669Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [
            {
                "id": 20,
                "name": "Sample Dataset",
                "slug": "sample_dataset",
                "icon": "#F7D97B"
            }
        ],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 18,
        "query_type": "query",
        "name": "Orders by Category",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-19T22:14:10.410Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "fk->",
                        10,
                        16
                    ]
                ],
                "filter": []
            }
        },
        "id": 114,
        "display": "pie",
        "visualization_settings": {},
        "collection": {
            "id": 18,
            "name": "Sample Dataset",
            "slug": "sample_dataset",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-17T21:13:43.168Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source",
                "name": "SOURCE",
                "description": "The channel through which we acquired this user. Valid values include: Affiliate, Facebook, Google, Organic and Twitter",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Orders by category and user source",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:13:57.818Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "fk->",
                        10,
                        16
                    ],
                    [
                        "fk->",
                        5,
                        6
                    ]
                ]
            }
        },
        "id": 386,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-30T21:30:53.662Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 18,
        "query_type": "query",
        "name": "Orders by day, past 90 days",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-08T21:59:50.543Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            25
                        ],
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            25
                        ],
                        -90,
                        "day"
                    ]
                ]
            }
        },
        "id": 326,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 35
        },
        "collection": {
            "id": 18,
            "name": "Sample Dataset",
            "slug": "sample_dataset",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-06T16:10:37.723Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Orders by product category",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:13:57.818Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "fk->",
                        10,
                        16
                    ]
                ]
            }
        },
        "id": 385,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-30T21:30:12.201Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "month"
            },
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Orders by product over time",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T00:49:12.848Z",
        "made_public_by_id": 2,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        [
                            "field-id",
                            25
                        ],
                        "as",
                        "month"
                    ],
                    [
                        "fk->",
                        10,
                        16
                    ]
                ]
            }
        },
        "id": 208,
        "display": "line",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-01-27T19:48:50.632Z",
        "public_uuid": "53caa1aa-71b2-46d9-9eb9-4d7c27683994",
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "month"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Orders, Count",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-06T17:09:00.162Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            25
                        ],
                        "as",
                        "month"
                    ]
                ]
            }
        },
        "id": 249,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-11T18:36:53.663Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Orders count by state",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-03-21T21:30:11.379Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "fk->",
                        5,
                        33
                    ]
                ]
            }
        },
        "id": 221,
        "display": "map",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-21T21:30:11.379Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 18,
        "query_type": "query",
        "name": "Orders, Count, Grouped by Created At (day)",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-09T12:13:46.647Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            25
                        ],
                        "as",
                        "day"
                    ]
                ]
            }
        },
        "id": 273,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 35
        },
        "collection": {
            "id": 18,
            "name": "Sample Dataset",
            "slug": "sample_dataset",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-07-11T00:21:14.833Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": null,
        "creator": {
            "email": "atte@metabase.com",
            "first_name": "Atte",
            "last_login": "2018-01-13T12:39:13.697Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 18,
            "last_name": "Keinänen",
            "date_joined": "2017-03-16T23:11:36.072Z",
            "common_name": "Atte Keinänen"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 18,
        "query_type": "query",
        "name": "Orders, Count, Grouped by Created At (hour), Filtered by Created At",
        "in_public_dashboard": false,
        "creator_id": 18,
        "updated_at": "2017-09-28T17:13:32.203Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            25
                        ],
                        "as",
                        "hour"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            25
                        ],
                        -30,
                        "day"
                    ]
                ]
            }
        },
        "id": 271,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 18,
            "name": "Sample Dataset",
            "slug": "sample_dataset",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-19T22:46:39.200Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "State",
                "name": "STATE",
                "description": "The state or province of the account’s billing address",
                "special_type": "type/State"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Orders, Count, Grouped by User → State",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-08T21:59:50.542Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "fk->",
                        5,
                        33
                    ]
                ]
            }
        },
        "id": 396,
        "display": "map",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2018-01-08T19:10:51.884Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Total Orders",
                "name": "Total orders"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Orders Over $50",
                "name": "Orders over $50"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Orders Over $75",
                "name": "Orders over $75"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Orders Over $90",
                "name": "Orders over $90"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Orders Over $125",
                "name": "Orders over $125"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Orders Over $150",
                "name": "Orders over $150"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "Orders funnel",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-30T21:45:56.141Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT \n(SELECT count(*) FROM \"PUBLIC\".\"ORDERS\") as \"Total orders\",\n(SELECT count(*) FROM \"PUBLIC\".\"ORDERS\" where SUBTOTAL > 50) as \"Orders over $50\",\n(SELECT count(*) FROM \"PUBLIC\".\"ORDERS\" where SUBTOTAL > 75) as \"Orders over $75\",\n(SELECT count(*) FROM \"PUBLIC\".\"ORDERS\" where SUBTOTAL > 90) as \"Orders over $90\",\n(SELECT count(*) FROM \"PUBLIC\".\"ORDERS\" where SUBTOTAL > 125) as \"Orders over $125\",\n(SELECT count(*) FROM \"PUBLIC\".\"ORDERS\" where SUBTOTAL > 150) as \"Orders over $150\"\n",
                "template_tags": {}
            }
        },
        "id": 387,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-30T21:44:23.191Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Orders funnel by product cateogry",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:13:58.488Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "fk->",
                        10,
                        16
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ]
            }
        },
        "id": 388,
        "display": "funnel",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-30T21:46:55.303Z",
        "public_uuid": null,
        spaces: [1]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "day"
            },
            {
                "base_type": "type/Float",
                "display_name": "sum",
                "name": "sum"
            }
        ],
        "creator": {
            "email": "simon@metabase.com",
            "first_name": "Simon",
            "last_login": "2018-01-09T12:13:31.578Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 21,
            "last_name": "Belak",
            "date_joined": "2017-06-20T19:34:41.113Z",
            "common_name": "Simon Belak"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 18,
        "query_type": "query",
        "name": "Orders, Sum of Total, Grouped by Created At (day)",
        "in_public_dashboard": false,
        "creator_id": 21,
        "updated_at": "2017-11-09T21:56:09.094Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "sum",
                        [
                            "field-id",
                            23
                        ]
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            25
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 375,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 18,
            "name": "Sample Dataset",
            "slug": "sample_dataset",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-09T21:43:45.341Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Id",
                "name": "ID",
                "description": "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "default"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Product ID",
                "name": "PRODUCT_ID",
                "description": "The product ID. This is an internal identifier for the product, NOT the SKU.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Float",
                "display_name": "Subtotal",
                "name": "SUBTOTAL",
                "description": "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Tax",
                "name": "TAX",
                "description": "This is the amount of local and federal taxes that are collected on the purchase. Note that other governmental fees on some products are not included here, but instead are accounted for in the subtotal.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Total",
                "name": "TOTAL",
                "description": "The total billed amount."
            },
            {
                "base_type": "type/Integer",
                "display_name": "User Id",
                "name": "USER_ID",
                "description": "The id of the user who made this order. Note that in some cases where an order was created on behalf of a customer who phoned the order in, this might be the employee who handled the request.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Product ID",
                "name": "TITLE",
                "description": "The name of the product as it should be displayed to customers.",
                "special_type": "type/Name"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Orders Test",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-09-28T17:11:19.119Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1
            }
        },
        "id": 304,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-01T22:12:32.102Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Page Views",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:32:36.224Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    "METRIC",
                    "ga:pageviews"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        6851,
                        "as",
                        "week"
                    ]
                ],
                "filter": []
            }
        },
        "id": 196,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-21T21:38:28.806Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Param Demo GUI Card",
        "in_public_dashboard": true,
        "creator_id": 4,
        "updated_at": "2017-09-28T17:13:00.908Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ]
            }
        },
        "id": 211,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-02-01T18:48:24.504Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "?1",
                "name": "?1"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "Param Demo SQL Card",
        "in_public_dashboard": true,
        "creator_id": 4,
        "updated_at": "2018-01-12T19:12:53.457Z",
        "made_public_by_id": 2,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select {{param_demo_template_tag}}",
                "collection": "ORDERS",
                "template_tags": {
                    "param_demo_template_tag": {
                        "id": "3fdd3be5-d315-4628-3616-0dcba02c60b5",
                        "name": "param_demo_template_tag",
                        "display_name": "Param demo template tag",
                        "type": "text",
                        "required": true,
                        "default": "param demo template tag default"
                    }
                }
            }
        },
        "id": 212,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-02-01T18:49:42.504Z",
        "public_uuid": "f05200f1-7a37-4387-82d2-91a6235aedbe",
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 4,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Id",
                "name": "ID",
                "description": "A unique identifier given to each user.",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Name",
                "name": "NAME",
                "description": "The name of the user who owns an account",
                "special_type": "type/Name"
            },
            {
                "base_type": "type/Text",
                "display_name": "Address",
                "name": "ADDRESS",
                "description": "The street address of the account’s billing address"
            },
            {
                "base_type": "type/Date",
                "display_name": "Birth Date",
                "name": "BIRTH_DATE",
                "description": "The date of birth of the user",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "City",
                "name": "CITY",
                "description": "The city of the account’s billing address",
                "special_type": "type/City"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date the user record was created. Also referred to as the user’s \"join date\"",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "Email",
                "name": "EMAIL",
                "description": "The contact email for the account."
            },
            {
                "base_type": "type/Float",
                "display_name": "Latitude",
                "name": "LATITUDE",
                "description": "This is the latitude of the user on sign-up. It might be updated in the future to the last seen location.",
                "special_type": "type/Latitude"
            },
            {
                "base_type": "type/Float",
                "display_name": "Longitude",
                "name": "LONGITUDE",
                "description": "This is the longitude of the user on sign-up. It might be updated in the future to the last seen location.",
                "special_type": "type/Longitude"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source",
                "name": "SOURCE",
                "description": "The channel through which we acquired this user. Valid values include: Affiliate, Facebook, Google, Organic and Twitter",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "State",
                "name": "STATE",
                "description": "The state or province of the account’s billing address",
                "special_type": "type/State"
            },
            {
                "base_type": "type/Text",
                "display_name": "Zip",
                "name": "ZIP",
                "description": "The postal code of the account’s billing address",
                "special_type": "type/ZipCode"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "People",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T16:11:09.572Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 4
            }
        },
        "id": 244,
        "display": "table",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-04-29T00:39:21.473Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:users",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "People getting to AWS Start Page",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:27:55.475Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            7105
                        ],
                        "2017-01-01"
                    ],
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            7245
                        ],
                        "/start"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            7245
                        ],
                        "/start/aws.html"
                    ]
                ]
            }
        },
        "id": 335,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:10:50.707Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Page",
                "name": "ga:pagePath",
                "description": "A page on the website specified by path and/or query parameters. Use this with hostname to get the page's full URL."
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:users",
                "name": "ga:users"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "People getting to Docker Start Page",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:28:06.673Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            7105
                        ],
                        "2017-01-01"
                    ],
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            7245
                        ],
                        "/start"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            7245
                        ],
                        "/start/docker.html"
                    ]
                ]
            }
        },
        "id": 337,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:12:14.334Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:users",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "People getting to Heroku Start Page",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:28:16.769Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            7105
                        ],
                        "2017-01-01"
                    ],
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            7245
                        ],
                        "/start"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            7245
                        ],
                        "/start/heroku.html"
                    ]
                ]
            }
        },
        "id": 338,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:12:33.185Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:users",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "People Getting to Jar Start Page",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:28:25.063Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            7105
                        ],
                        "2017-01-01"
                    ],
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            7245
                        ],
                        "/start"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            7245
                        ],
                        "/start/jar.html"
                    ]
                ]
            }
        },
        "id": 339,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:12:53.789Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:users",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "People getting to Mac Start Page",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:28:33.266Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            7105
                        ],
                        "2017-01-01"
                    ],
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            7245
                        ],
                        "/start"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            7245
                        ],
                        "/start/mac.html"
                    ]
                ]
            }
        },
        "id": 340,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:13:15.903Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:users",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "People getting to Other Start Page",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:28:43.733Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            7105
                        ],
                        "2017-01-01"
                    ],
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            7245
                        ],
                        "/start"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            7245
                        ],
                        "/start/other.html"
                    ]
                ]
            }
        },
        "id": 341,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:13:39.563Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:users",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "People landing on Start",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:28:52.799Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            7105
                        ],
                        "2017-01-01"
                    ],
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            7245
                        ],
                        "/start"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            7245
                        ],
                        "/start/"
                    ]
                ]
            }
        },
        "id": 336,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:11:31.021Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 4,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Id",
                "name": "ID",
                "description": "A unique identifier given to each user.",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Name",
                "name": "NAME",
                "description": "The name of the user who owns an account",
                "special_type": "type/Name"
            },
            {
                "base_type": "type/Text",
                "display_name": "Address",
                "name": "ADDRESS",
                "description": "The street address of the account’s billing address"
            },
            {
                "base_type": "type/Date",
                "display_name": "Birth Date",
                "name": "BIRTH_DATE",
                "description": "The date of birth of the user",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "City",
                "name": "CITY",
                "description": "The city of the account’s billing address",
                "special_type": "type/City"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date the user record was created. Also referred to as the user’s \"join date\"",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "Email",
                "name": "EMAIL",
                "description": "The contact email for the account."
            },
            {
                "base_type": "type/Float",
                "display_name": "Latitude",
                "name": "LATITUDE",
                "description": "This is the latitude of the user on sign-up. It might be updated in the future to the last seen location.",
                "special_type": "type/Latitude"
            },
            {
                "base_type": "type/Float",
                "display_name": "Longitude",
                "name": "LONGITUDE",
                "description": "This is the longitude of the user on sign-up. It might be updated in the future to the last seen location.",
                "special_type": "type/Longitude"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source",
                "name": "SOURCE",
                "description": "The channel through which we acquired this user. Valid values include: Affiliate, Facebook, Google, Organic and Twitter",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "State",
                "name": "STATE",
                "description": "The state or province of the account’s billing address",
                "special_type": "type/State"
            },
            {
                "base_type": "type/Text",
                "display_name": "Zip",
                "name": "ZIP",
                "description": "The postal code of the account’s billing address",
                "special_type": "type/ZipCode"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "pin map",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2018-01-09T12:14:04.574Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 4
            }
        },
        "id": 276,
        "display": "map",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-07-19T07:03:10.449Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "Time dimension is the smaller dimension, so on the x-axis.",
        "archived": false,
        "labels": [
            {
                "id": 1,
                "name": "Test Validations",
                "slug": "test_validations",
                "icon": ":ghost:"
            }
        ],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": null
            },
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Pivot Test (category by time)",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-09T12:13:57.800Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        25,
                        "as",
                        "year"
                    ],
                    [
                        "fk->",
                        10,
                        16
                    ]
                ],
                "filter": []
            }
        },
        "id": 80,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-05T18:42:22.765Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "pivot table with time as the larger dimension",
        "archived": false,
        "labels": [
            {
                "id": 1,
                "name": "Test Validations",
                "slug": "test_validations",
                "icon": ":ghost:"
            }
        ],
        "table_id": 1,
        "result_metadata": null,
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Pivot Test (time by category)",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-01-02T18:35:49.680Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        25,
                        "as",
                        "quarter"
                    ],
                    [
                        "fk->",
                        10,
                        16
                    ]
                ],
                "filter": []
            }
        },
        "id": 76,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-05T18:11:26.918Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Potential Case Study List",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2016-09-15T00:23:58.119Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "rows"
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        "=",
                        532,
                        10,
                        9
                    ],
                    [
                        "=",
                        527,
                        "Sure, email me"
                    ]
                ]
            }
        },
        "id": 145,
        "display": "table",
        "visualization_settings": {
            "table.columns": [
                {
                    "name": "contact_details",
                    "enabled": true
                },
                {
                    "name": "nps",
                    "enabled": true
                },
                {
                    "name": "usage",
                    "enabled": true
                },
                {
                    "name": "comments",
                    "enabled": true
                },
                {
                    "name": "dislikes",
                    "enabled": true
                },
                {
                    "name": "company_size",
                    "enabled": true
                },
                {
                    "name": "dislikes_comment",
                    "enabled": true
                },
                {
                    "name": "reason",
                    "enabled": true
                },
                {
                    "name": "reason_comments",
                    "enabled": true
                },
                {
                    "name": "id",
                    "enabled": false
                },
                {
                    "name": "contact_choice",
                    "enabled": false
                },
                {
                    "name": "ip",
                    "enabled": false
                },
                {
                    "name": "source",
                    "enabled": false
                },
                {
                    "name": "source_comments",
                    "enabled": false
                },
                {
                    "name": "survey_id",
                    "enabled": false
                },
                {
                    "name": "ts",
                    "enabled": false
                }
            ]
        },
        "collection": null,
        "favorite": false,
        "created_at": "2016-09-15T00:23:58.119Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 3,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date the product was added to our catalog.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Product Additions by Time",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-11-15T18:17:15.368Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 3,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    29
                ],
                "filter": []
            }
        },
        "id": 57,
        "display": "line",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2016-02-24T04:31:43.510Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "TS",
                "name": "ts",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Promoters over time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:09.448Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "cum_count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        537,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        532,
                        8
                    ]
                ]
            }
        },
        "id": 150,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-10-19T21:52:21.317Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "TS",
                "name": "ts",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Promoters over time with silly goal",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-04T18:17:02.751Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    [
                        "cum_count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        537,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        532,
                        8
                    ]
                ]
            }
        },
        "id": 378,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 200
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-15T23:11:10.577Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "Tooltip goes here",
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Proportion of query types over time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-05-30T23:11:03.991Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Run Query"
                    ],
                    [
                        "!=",
                        [
                            "field-id",
                            6939
                        ],
                        "(not set)",
                        "url"
                    ],
                    [
                        "BETWEEN",
                        [
                            "field-id",
                            6851
                        ],
                        "2015-11-01",
                        "2017-05-30"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "as",
                        "month"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ]
            }
        },
        "id": 252,
        "display": "area",
        "visualization_settings": {
            "table.column_widths": [],
            "graph.y_axis.title_text": "Queries",
            "graph.y_axis.max": 1000000,
            "graph.x_axis.title_text": "Query Type",
            "graph.y_axis.scale": "linear",
            "graph.colors": [
                "#A989C5",
                "#9cc177",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ],
            "graph.y_axis.auto_range": true,
            "stackable.stack_type": "normalized",
            "graph.y_axis.min": 0
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-12T00:20:48.470Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Pulses",
                "name": "# Pulses"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "# Pulses a Card is in",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:47.413Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Pulses\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'pulse'->'num_pulses_per_card' as col,\njson_object_keys(stats->'pulse'->'num_pulses_per_card') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 174,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:55:34.516Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Cards",
                "name": "# Cards"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Pulses created per User",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:42.547Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Cards\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'pulse'->'num_pulses_per_user' as col,\njson_object_keys(stats->'pulse'->'num_pulses_per_user') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 173,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:54:57.662Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Pulses per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:49.515Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'pulse'->>'pulses')::int/5)*5 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 182,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T02:19:33.334Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "month"
            },
            {
                "base_type": "type/Text",
                "display_name": "Event Label",
                "name": "ga:eventLabel",
                "description": "Event label."
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Queries per month, Jan 2016 to July 2017",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-07-17T17:41:28.546Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Run Query"
                    ],
                    [
                        "BETWEEN",
                        [
                            "field-id",
                            6851
                        ],
                        "2016-01-01",
                        "2017-06-30"
                    ],
                    [
                        "!=",
                        [
                            "field-id",
                            6939
                        ],
                        "(not set)",
                        "url",
                        "multi"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "month"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ]
            }
        },
        "id": 275,
        "display": "area",
        "visualization_settings": {
            "table.column_widths": [],
            "graph.x_axis.title_text": "Query Type",
            "graph.y_axis.title_text": "Queries",
            "graph.colors": [
                "#509EE3",
                "#EF8C8C",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ],
            "stackable.stack_type": "stacked"
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-07-17T17:41:28.546Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Queries run in the last 12 weeks",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2017-07-14T16:29:38.323Z",
        "made_public_by_id": 4,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Run Query"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            6851
                        ],
                        -12,
                        "week"
                    ],
                    [
                        "!=",
                        [
                            "field-id",
                            6939
                        ],
                        "(not set)",
                        "url",
                        "multi"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "as",
                        "week"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ],
                "order_by": [
                    [
                        [
                            "datetime-field",
                            [
                                "field-id",
                                6851
                            ],
                            "as",
                            "week"
                        ],
                        "descending"
                    ]
                ]
            }
        },
        "id": 274,
        "display": "area",
        "visualization_settings": {
            "table.column_widths": [],
            "graph.x_axis.title_text": "Query Type",
            "graph.y_axis.title_text": "Queries",
            "graph.colors": [
                "#509EE3",
                "#EF8C8C",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ],
            "stackable.stack_type": "stacked"
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-07-13T17:58:00.153Z",
        "public_uuid": "f4f693fc-b095-4fd6-a715-6db9962702e3",
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Seconds",
                "name": "Seconds"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "#executions",
                "name": "#Executions"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Query Executions by Latency",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:38.469Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"Seconds\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"#Executions\"\nFROM\n(select\nstats->'execution'->'num_by_latency' as col,\njson_object_keys(stats->'execution'->'num_by_latency') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 159,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-01T23:50:13.505Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Status",
                "name": "Status"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "#executions",
                "name": "#Executions"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Query Executions by Status",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:27.069Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"Status\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"#Executions\"\nFROM\n(select\nstats->'execution'->'by_status' as col,\njson_object_keys(stats->'execution'->'by_status') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 164,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:44:12.902Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Query Executions per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:45.327Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'execution'->>'executions')::int/1000)*1000 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 176,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T02:14:39.711Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "#executions",
                "name": "#Executions"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Users",
                "name": "Users"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Query Executions per user",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:32.161Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"#Executions\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Users\"\nFROM\n(select\nstats->'execution'->'num_per_user' as col,\njson_object_keys(stats->'execution'->'num_per_user') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            },
            "parameters": []
        },
        "id": 165,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:45:31.395Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 13,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 5,
        "enable_embedding": false,
        "collection_id": 5,
        "query_type": "query",
        "name": "Quinnie's avg speed on cat wheel",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-06T21:26:19.696Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 5,
            "type": "query",
            "query": {
                "source_table": 13,
                "aggregation": [
                    "METRIC",
                    5
                ],
                "breakout": [],
                "filter": []
            }
        },
        "id": 127,
        "display": "scalar",
        "visualization_settings": {
            "scalar.suffix": " MPH"
        },
        "collection": {
            "id": 5,
            "name": "Cat Facts!",
            "slug": "cat_facts_",
            "description": null,
            "color": "#B8A2CC",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-07-29T03:49:03.685Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "ID"
            },
            {
                "base_type": "type/Text",
                "display_name": "Ean",
                "name": "EAN"
            },
            {
                "base_type": "type/Text",
                "display_name": "Title",
                "name": "TITLE"
            },
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY"
            },
            {
                "base_type": "type/Text",
                "display_name": "Vendor",
                "name": "VENDOR"
            },
            {
                "base_type": "type/Float",
                "display_name": "Price",
                "name": "PRICE"
            },
            {
                "base_type": "type/Float",
                "display_name": "Rating",
                "name": "RATING"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "Raw data",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-02T19:11:31.200Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT * FROM products;"
            }
        },
        "id": 107,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-07T23:41:19.391Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Reason",
                "name": "reason",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Reason breakdown",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:06.676Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    533
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        537,
                        "2016-05-03"
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ]
            }
        },
        "id": 96,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#9CC177",
                "marker_fillColor": "#9CC177",
                "marker_lineColor": "#9CC177"
            },
            "area": {
                "fillColor": "#9CC177"
            },
            "bar": {
                "color": "#9CC177"
            }
        },
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-05T19:22:39.537Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1464,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "id",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Name",
                "name": "name",
                "special_type": "type/Name"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Last Login",
                "name": "last_login",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "Password",
                "name": "password",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 10,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Redshift question",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-09-28T17:11:19.118Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 10,
            "type": "query",
            "query": {
                "source_table": 1464
            }
        },
        "id": 303,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-01T19:07:16.594Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "day"
            },
            {
                "base_type": "type/Text",
                "display_name": "Event Label",
                "name": "ga:eventLabel",
                "description": "Event label."
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Remapping change events over time",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-04T17:32:40.149Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "day"
                    ],
                    [
                        "field-id",
                        6939
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Change Remapping Type"
                    ]
                ]
            }
        },
        "id": 288,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T17:15:15.955Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "https://github.com/metabase/metabase/issues/5826",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 15,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "reproduction of #5826",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-09-25T23:11:55.992Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 15,
            "type": "native",
            "native": {
                "query": "#standardSQL\nSELECT EXTRACT(TIME FROM TIMESTAMP \"2008-12-25 15:30:00\") AS time\n",
                "collection": "hackernews_comments",
                "template_tags": {}
            }
        },
        "id": 314,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-25T23:11:55.992Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "https://github.com/metabase/metabase/issues/5826",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 15,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "native",
        "name": "reproduction of #5826",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-09-25T23:11:55.459Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 15,
            "type": "native",
            "native": {
                "query": "#standardSQL\nSELECT EXTRACT(TIME FROM TIMESTAMP \"2008-12-25 15:30:00\") AS time\n",
                "collection": "hackernews_comments",
                "template_tags": {}
            }
        },
        "id": 313,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-25T23:11:55.459Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "From Google Analytics segment",
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Returning users by week",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-06T21:32:46.972Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    "METRIC",
                    "ga:users"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        6851,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        "gaid::-3"
                    ]
                ]
            }
        },
        "id": 200,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-22T22:50:47.210Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 2,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Rating",
                "name": "RATING",
                "description": "The rating (on a scale of 1-5) the user left.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Reviews by Rating",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T00:49:13.527Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 2,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        14
                    ]
                ]
            }
        },
        "id": 267,
        "display": "pie",
        "visualization_settings": {
            "pie.show_legend_perecent": false,
            "pie.show_legend": false
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-16T22:28:58.644Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 2,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The day and time a review was written by a user.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 18,
        "query_type": "query",
        "name": "Reviews per day, past 30 days",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-11T23:28:48.066Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 2,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            22
                        ],
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            22
                        ],
                        -30,
                        "day"
                    ]
                ]
            }
        },
        "id": 327,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 18,
            "name": "Sample Dataset",
            "slug": "sample_dataset",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-06T17:10:04.550Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": "Today's count of active instances divided by last 30 days of active instances.",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "?column?",
                "name": "?column?"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Rolling 30 day DAI / MAI",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:04:27.792Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "SELECT\n    CAST (\n        (\n        SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count\"\n        FROM \"public\".\"entries\"\n        WHERE ((\"public\".\"entries\".\"key\" LIKE 'version%')\n        AND CAST(\"public\".\"entries\".\"time\" AS date) = CAST((NOW() + INTERVAL '-1 day') AS date))\n        )\n        AS float\n    ) \n    / \n    CAST (\n        (SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count\"\n        FROM \"public\".\"entries\"\n        WHERE ((\"public\".\"entries\".\"key\" LIKE 'version%')\n        AND CAST(\"public\".\"entries\".\"time\" AS date) BETWEEN CAST((NOW() + INTERVAL '-30 day') AS date) AND CAST((NOW() + INTERVAL '-1 day') AS date))\n        )\n        AS float\n    )",
                "collection": "entries"
            }
        },
        "id": 205,
        "display": "scalar",
        "visualization_settings": {
            "scalar.decimals": 2
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-01-25T20:04:01.624Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 2705,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp",
                "special_type": "type/UNIXTimestampMilliseconds",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 10,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Sad Toucan Incidents Incidents, Count, Grouped by Timestamp",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-09-28T17:13:55.242Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 10,
            "type": "query",
            "query": {
                "source_table": 2705,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "binning-strategy",
                        [
                            "field-id",
                            13125
                        ],
                        "default"
                    ]
                ]
            }
        },
        "id": 300,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-31T22:46:32.358Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 2705,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Timestamp",
                "name": "timestamp",
                "special_type": "type/UNIXTimestampMilliseconds",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 10,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Sad Toucan Incidents Incidents, Count, Grouped by Timestamp",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-09-28T17:13:55.243Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 10,
            "type": "query",
            "query": {
                "source_table": 2705,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "binning-strategy",
                        [
                            "field-id",
                            13125
                        ],
                        "default"
                    ]
                ]
            }
        },
        "id": 301,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-31T22:46:34.188Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/BigInteger",
                "display_name": "Id",
                "name": "ID",
                "description": "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "default"
            },
            {
                "base_type": "type/Float",
                "display_name": "Discount",
                "name": "DISCOUNT",
                "description": "Discount amount."
            },
            {
                "base_type": "type/Integer",
                "display_name": "Product ID",
                "name": "PRODUCT_ID",
                "description": "The product ID. This is an internal identifier for the product, NOT the SKU.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Quantity",
                "name": "QUANTITY",
                "description": "Number of products bought.",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Float",
                "display_name": "Subtotal",
                "name": "SUBTOTAL",
                "description": "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Tax",
                "name": "TAX",
                "description": "This is the amount of local and federal taxes that are collected on the purchase. Note that other governmental fees on some products are not included here, but instead are accounted for in the subtotal.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Total",
                "name": "TOTAL",
                "description": "The total billed amount."
            },
            {
                "base_type": "type/Integer",
                "display_name": "User Id",
                "name": "USER_ID",
                "description": "The id of the user who made this order. Note that in some cases where an order was created on behalf of a customer who phoned the order in, this might be the employee who handled the request.",
                "special_type": "type/FK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Product ID",
                "name": "TITLE",
                "description": "The name of the product as it should be displayed to customers.",
                "special_type": "type/Name"
            },
            {
                "base_type": "type/Text",
                "display_name": "User Id",
                "name": "NAME",
                "description": "The name of the user who owns an account",
                "special_type": "type/Name"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Scatterplot test",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:13:55.423Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1
            }
        },
        "id": 222,
        "display": "scatter",
        "visualization_settings": {
            "graph.dimensions": [
                "SUBTOTAL"
            ],
            "graph.metrics": [
                "TAX"
            ]
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-21T21:33:24.644Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Segments per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:48.301Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'segment'->>'segments')::int/5)*5 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 180,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T02:18:23.119Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count(*)",
                "name": "COUNT(*)"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "native",
        "name": "select count(*) from people where {{email}}",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2018-01-04T00:43:29.692Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select count(*) from people where {{email}}",
                "collection": "ORDERS",
                "template_tags": {
                    "email": {
                        "id": "46a46ef6-9e15-ebf2-5c7d-ca6d78f0836d",
                        "name": "email",
                        "display_name": "Email",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            34
                        ]
                    }
                }
            }
        },
        "id": 202,
        "display": "scalar",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-01-10T18:33:30.082Z",
        "public_uuid": null,
        spaces: [3]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Sessions by Country",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:33:26.189Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    "METRIC",
                    "ga:sessions"
                ],
                "breakout": [
                    6846
                ],
                "filter": []
            }
        },
        "id": 162,
        "display": "map",
        "visualization_settings": {
            "graph.y_axis.auto_split": false,
            "map.region": "world_countries"
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-08T15:20:41.678Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 6,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "sleep 20",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-09-28T17:11:19.115Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 6,
            "type": "native",
            "native": {
                "query": "select pg_sleep(20);"
            }
        },
        "id": 118,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-06-20T21:49:15.448Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Source",
                "name": "source",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Source breakdown",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:09.326Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    535
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        537,
                        "2016-05-03"
                    ]
                ]
            }
        },
        "id": 97,
        "display": "bar",
        "visualization_settings": {
            "line": {
                "lineColor": "#A989C5",
                "marker_fillColor": "#A989C5",
                "marker_lineColor": "#A989C5"
            },
            "area": {
                "fillColor": "#A989C5"
            },
            "bar": {
                "color": "#A989C5"
            }
        },
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-05T19:24:58.668Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "ID"
            },
            {
                "base_type": "type/Text",
                "display_name": "Name",
                "name": "NAME"
            },
            {
                "base_type": "type/Text",
                "display_name": "Address",
                "name": "ADDRESS"
            },
            {
                "base_type": "type/Date",
                "display_name": "Birth Date",
                "name": "BIRTH_DATE"
            },
            {
                "base_type": "type/Text",
                "display_name": "City",
                "name": "CITY"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT"
            },
            {
                "base_type": "type/Text",
                "display_name": "Email",
                "name": "EMAIL"
            },
            {
                "base_type": "type/Float",
                "display_name": "Latitude",
                "name": "LATITUDE"
            },
            {
                "base_type": "type/Float",
                "display_name": "Longitude",
                "name": "LONGITUDE"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source",
                "name": "SOURCE"
            },
            {
                "base_type": "type/Text",
                "display_name": "State",
                "name": "STATE"
            },
            {
                "base_type": "type/Text",
                "display_name": "Zip",
                "name": "ZIP"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "SQL question with state field filter",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-08T21:59:56.100Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT \"PUBLIC\".\"PEOPLE\".\"ID\" AS \"ID\", \"PUBLIC\".\"PEOPLE\".\"NAME\" AS \"NAME\", \"PUBLIC\".\"PEOPLE\".\"ADDRESS\" AS \"ADDRESS\", \"PUBLIC\".\"PEOPLE\".\"BIRTH_DATE\" AS \"BIRTH_DATE\", \"PUBLIC\".\"PEOPLE\".\"CITY\" AS \"CITY\", \"PUBLIC\".\"PEOPLE\".\"CREATED_AT\" AS \"CREATED_AT\", \"PUBLIC\".\"PEOPLE\".\"EMAIL\" AS \"EMAIL\", \"PUBLIC\".\"PEOPLE\".\"LATITUDE\" AS \"LATITUDE\", \"PUBLIC\".\"PEOPLE\".\"LONGITUDE\" AS \"LONGITUDE\", \"PUBLIC\".\"PEOPLE\".\"SOURCE\" AS \"SOURCE\", \"PUBLIC\".\"PEOPLE\".\"STATE\" AS \"STATE\", \"PUBLIC\".\"PEOPLE\".\"ZIP\" AS \"ZIP\"\nFROM \"PUBLIC\".\"PEOPLE\"\nWHERE {{STATE}}\nLIMIT 2000",
                "template_tags": {
                    "STATE": {
                        "id": "585e5639-989d-a509-bcae-7c1891f23a1a",
                        "name": "STATE",
                        "display_name": "State",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            33
                        ]
                    }
                }
            }
        },
        "id": 298,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-14T17:56:53.992Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            },
            {
                "base_type": "type/Date",
                "display_name": "Created At",
                "name": "CREATED_AT"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "SQL timeseries x-ray test",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-30T19:02:27.342Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT count(*) AS \"count\", CAST(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" AS date) AS \"CREATED_AT\"\nFROM \"PUBLIC\".\"ORDERS\"\nWHERE CAST(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" AS date) BETWEEN CAST(dateadd('day', -30, now()) AS date)\n   AND CAST(dateadd('day', -1, now()) AS date)\nGROUP BY CAST(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" AS date)\nORDER BY CAST(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" AS date) ASC"
            }
        },
        "id": 384,
        "display": "line",
        "visualization_settings": {
            "graph.dimensions": [
                "CREATED_AT"
            ],
            "graph.metrics": [
                "count"
            ]
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-30T18:57:07.781Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "SQL vs GUI last 6 months",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-02-27T23:14:55.970Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Run Query"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            6851
                        ],
                        -6,
                        "month"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        6939
                    ],
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "as",
                        "day"
                    ]
                ]
            }
        },
        "id": 215,
        "display": "area",
        "visualization_settings": {
            "table.column_widths": [],
            "graph.x_axis.title_text": "Query Type",
            "graph.y_axis.title_text": "Count",
            "graph.colors": [
                "#F1B556",
                "#509EE3",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ],
            "line.interpolate": "cardinal",
            "graph.show_goal": false,
            "stackable.stack_type": null,
            "line.marker_enabled": true
        },
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-02-27T23:14:55.970Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT",
                "description": "The date and time an order was submitted.",
                "unit": "month"
            },
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY",
                "description": "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Stacked area chart",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:04.735Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            25
                        ],
                        "as",
                        "month"
                    ],
                    [
                        "fk->",
                        10,
                        16
                    ]
                ]
            }
        },
        "id": 389,
        "display": "area",
        "visualization_settings": {
            "stackable.stack_type": "stacked"
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-30T21:51:24.578Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Max",
                "name": "max"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "native",
        "name": "Stars",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-13T01:43:10.631Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "native",
            "native": {
                "query": "select max(watchers) from follow_events"
            }
        },
        "id": 41,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-27T05:49:09.718Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "state field filter",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2017-09-28T17:13:01.063Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT count(*)\nFROM products\nWHERE category = {{category}}",
                "template_tags": {
                    "category": {
                        "name": "category",
                        "display_name": "Category",
                        "type": "dimension",
                        "required": false,
                        "id": "172d424c-efdb-c49c-b729-5af54779b26f",
                        "dimension": [
                            "field-id",
                            33
                        ]
                    }
                }
            },
            "parameters": []
        },
        "id": 232,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-31T00:00:01.636Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 20,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Responsible Batter ID",
                "name": "resp_bat_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 8,
        "enable_embedding": false,
        "collection_id": 6,
        "query_type": "query",
        "name": "Strikeouts (Ks)",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-11T18:37:54.691Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 8,
            "type": "query",
            "query": {
                "source_table": 20,
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            247
                        ],
                        "K"
                    ]
                ],
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        308
                    ]
                ],
                "limit": 10
            }
        },
        "id": 255,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 6,
            "name": "Baseball",
            "slug": "baseball",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-19T23:10:03.759Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Subtotal",
                "name": "SUBTOTAL",
                "description": "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc.",
                "special_type": "type/Number"
            },
            {
                "base_type": "type/Float",
                "display_name": "Rating",
                "name": "RATING",
                "description": "The average rating users have given the product. This ranges from 1 - 5",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Subtotal by Rating Scatterplot",
        "in_public_dashboard": true,
        "creator_id": 2,
        "updated_at": "2018-01-16T00:49:26.217Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "breakout": [
                    [
                        "field-id",
                        15
                    ],
                    [
                        "fk->",
                        10,
                        27
                    ]
                ]
            }
        },
        "id": 266,
        "display": "scatter",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-16T22:26:22.999Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "id",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Comments",
                "name": "comments",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Company Size",
                "name": "company_size",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Contact Choice",
                "name": "contact_choice",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Contact Details",
                "name": "contact_details",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Dislikes",
                "name": "dislikes",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Dislikes Comment",
                "name": "dislikes_comment",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Hash",
                "name": "hash",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "IP",
                "name": "ip",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "NPS",
                "name": "nps",
                "description": "Net Promoter Score",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Reason",
                "name": "reason",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Reason Comments",
                "name": "reason_comments",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source",
                "name": "source",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source Comments",
                "name": "source_comments",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Survey ID",
                "name": "survey_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "TS",
                "name": "ts",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "Usage",
                "name": "usage",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Survey respondents who want to be emailed",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-03T18:11:45.298Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            530
                        ],
                        279
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            527
                        ],
                        "Sure, email me"
                    ]
                ]
            }
        },
        "id": 283,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": [
                null,
                null,
                null,
                180
            ]
        },
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-03T18:11:02.456Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "TS",
                "name": "ts",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Surveys per day",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-09T12:14:06.506Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        537,
                        "as",
                        "day"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        537,
                        "2016-05-03"
                    ]
                ]
            }
        },
        "id": 98,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-05-05T21:09:48.398Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "id",
                "special_type": "type/PK"
            },
            {
                "base_type": "type/Text",
                "display_name": "Comments",
                "name": "comments",
                "special_type": "type/Description"
            },
            {
                "base_type": "type/Text",
                "display_name": "Company Size",
                "name": "company_size",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Contact Choice",
                "name": "contact_choice",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Contact Details",
                "name": "contact_details",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Dislikes",
                "name": "dislikes",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Dislikes Comment",
                "name": "dislikes_comment",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Hash",
                "name": "hash",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "IP",
                "name": "ip",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "NPS",
                "name": "nps",
                "description": "Net Promoter Score",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Reason",
                "name": "reason",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Reason Comments",
                "name": "reason_comments",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source",
                "name": "source",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Source Comments",
                "name": "source_comments",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Text",
                "display_name": "Survey ID",
                "name": "survey_id",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "TS",
                "name": "ts",
                "unit": "default"
            },
            {
                "base_type": "type/Text",
                "display_name": "Usage",
                "name": "usage",
                "special_type": "type/Category"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "Surveys with a score of 9 or 10 yesterday",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2018-01-16T17:00:22.816Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            532
                        ],
                        8
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            537
                        ],
                        -1,
                        "day"
                    ]
                ],
                "order_by": [
                    [
                        530,
                        "descending"
                    ]
                ]
            }
        },
        "id": 393,
        "display": "table",
        "visualization_settings": {
            "table.columns": [
                {
                    "name": "id",
                    "enabled": true
                },
                {
                    "name": "nps",
                    "enabled": true
                },
                {
                    "name": "comments",
                    "enabled": true
                },
                {
                    "name": "company_size",
                    "enabled": true
                },
                {
                    "name": "contact_choice",
                    "enabled": true
                },
                {
                    "name": "contact_details",
                    "enabled": true
                },
                {
                    "name": "dislikes",
                    "enabled": true
                },
                {
                    "name": "dislikes_comment",
                    "enabled": true
                },
                {
                    "name": "hash",
                    "enabled": false
                },
                {
                    "name": "ip",
                    "enabled": true
                },
                {
                    "name": "reason",
                    "enabled": true
                },
                {
                    "name": "reason_comments",
                    "enabled": true
                },
                {
                    "name": "source",
                    "enabled": true
                },
                {
                    "name": "source_comments",
                    "enabled": true
                },
                {
                    "name": "survey_id",
                    "enabled": true
                },
                {
                    "name": "ts",
                    "enabled": true
                },
                {
                    "name": "usage",
                    "enabled": true
                }
            ]
        },
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-12-20T17:30:40.159Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Tables",
                "name": "# Tables"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "# Tables per Database",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:27.033Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Tables\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'table'->'num_per_database' as col,\njson_object_keys(stats->'table'->'num_per_database') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 166,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:47:24.046Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Tables per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:46.791Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'table'->>'tables')::int/10)*10 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 178,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T02:16:06.606Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "# Tables",
                "name": "# Tables"
            },
            {
                "base_type": "type/Decimal",
                "display_name": "Count",
                "name": "Count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "# Tables per Schema",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:27.413Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select\nkeys as \"# Tables\",\nSUM(json_extract_path_text(col, keys)::NUMERIC) as \"Count\"\nFROM\n(select\nstats->'table'->'num_per_schema' as col,\njson_object_keys(stats->'table'->'num_per_schema') as keys\nfrom usage_stats\n) a\nGROUP BY 1 ORDER BY 1"
            }
        },
        "id": 167,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T01:48:01.876Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:pageviews",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 19,
        "query_type": "query",
        "name": "Table x-rays usage progress bar",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-14T20:35:19.047Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:pageviews"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6991
                        ],
                        "xray/table"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-09-26"
                    ]
                ]
            }
        },
        "id": 376,
        "display": "progress",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ],
            "graph.x_axis.labels_enabled": false,
            "progress.goal": 500
        },
        "collection": {
            "id": 19,
            "name": "Release 0.26 usage",
            "slug": "release_0_26_usage",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-14T20:35:19.047Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "",
        "archived": false,
        "labels": [],
        "table_id": 10,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Team member issue count",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:27:05.409Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 10,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    92
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        1
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ],
                "limit": 10
            }
        },
        "id": 37,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-25T19:15:59.534Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "templatized sql",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-11-30T22:07:10.096Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT parsedatetime(formatdatetime(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\", 'yyyyMM'), 'yyyyMM') AS \"CREATED_AT\", count(*) AS \"count\"\nFROM \"PUBLIC\".\"ORDERS\"\nWHERE {{CREATED_AT}}\nGROUP BY parsedatetime(formatdatetime(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\", 'yyyyMM'), 'yyyyMM')\nORDER BY parsedatetime(formatdatetime(\"PUBLIC\".\"ORDERS\".\"CREATED_AT\", 'yyyyMM'), 'yyyyMM') ASC",
                "template_tags": {
                    "CREATED_AT": {
                        "id": "79147b04-0e6f-24fb-c822-2e18763227d0",
                        "name": "CREATED_AT",
                        "display_name": "Created at",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            25
                        ]
                    }
                }
            }
        },
        "id": 146,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-10-12T08:30:51.408Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "test",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-01-02T18:35:49.796Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    "count"
                ],
                "breakout": [],
                "filter": []
            }
        },
        "id": 136,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-13T00:49:18.292Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "test",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-01-02T18:35:49.692Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select count(*) from products [[where category = {{ cat }} ]]",
                "collection": "ORDERS"
            }
        },
        "id": 140,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-30T20:05:25.496Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "Test",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-01-02T18:35:49.781Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select count(*)\nFROM products\nWHERE category = {{cat}}",
                "collection": "ORDERS",
                "template_tags": {
                    "cat": {
                        "id": "fc2cf389-ca05-ca7e-c41f-4cf3eea1abfc",
                        "name": "cat",
                        "display_name": "Cat",
                        "type": "text"
                    }
                }
            }
        },
        "id": 141,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-30T20:07:27.994Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "test",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 10,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "test",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-01-02T18:35:49.781Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 10,
            "type": "native",
            "native": {
                "query": "SELECT count (*) from order"
            }
        },
        "id": 143,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-09-09T18:55:19.306Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "C",
                "name": "C"
            },
            {
                "base_type": "type/Text",
                "display_name": "Category",
                "name": "CATEGORY"
            },
            {
                "base_type": "type/Text",
                "display_name": "Vendor",
                "name": "VENDOR"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "native",
        "name": "test",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-12-20T17:29:01.978Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select count(*) as c, category, vendor, created_at\nfrom products\ngroup by category, vendor, created_at",
                "collection": "ORDERS",
                "template_tags": {}
            }
        },
        "id": 391,
        "display": "table",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-12-08T23:50:55.659Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 10,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Test #4960",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-05-30T20:47:07.750Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 10
            }
        },
        "id": 258,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-05-30T20:47:07.750Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "testing",
        "in_public_dashboard": true,
        "creator_id": 3,
        "updated_at": "2017-09-28T17:11:19.116Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select count(*) from orders\nwhere 1=1 [[and {{category}}]]",
                "template_tags": {
                    "category": {
                        "id": "a2132f3e-1278-6688-2375-d2ec348522db",
                        "name": "category",
                        "display_name": "Category",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            16
                        ]
                    }
                }
            }
        },
        "id": 218,
        "display": "scalar",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-04T00:03:20.712Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "test: Invite emails viewed",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-01-02T18:35:49.903Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    "count"
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        "=",
                        73,
                        "GET /email_graph_bottom.png HTTP/1.1"
                    ]
                ]
            }
        },
        "id": 128,
        "display": "scalar",
        "visualization_settings": {
            "scalar.decimals": 2
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-04T00:25:27.904Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 4,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "test pin map",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-01-02T18:35:49.873Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 4,
                "aggregation": [
                    "rows"
                ],
                "breakout": [],
                "filter": []
            }
        },
        "id": 144,
        "display": "map",
        "visualization_settings": {
            "map.latitude_column": "LATITUDE",
            "map.longitude_column": "LONGITUDE"
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-09-14T22:03:17.573Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "testy",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-01-02T18:35:49.896Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select count(*) \nfrom orders\nwhere created_at > now()::date - {{numDays}}",
                "collection": "ORDERS",
                "template_tags": {
                    "numDays": {
                        "id": "898e6f31-abb1-bbe2-99d6-fb7dc6f7fe47",
                        "name": "numDays",
                        "display_name": "Numdays",
                        "type": "number"
                    }
                }
            }
        },
        "id": 137,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-17T00:41:52.974Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "hour"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "The effects of x-rays on man-in-the-moon marigolds",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-06T16:23:40.098Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "SELECT count(distinct \"public\".\"entries\".\"remote_ip\") AS \"count\", date_trunc('hour', CAST(\"public\".\"entries\".\"time\" AS timestamp)) AS \"time\"\nFROM \"public\".\"entries\"\nWHERE ((\"public\".\"entries\".\"key\" like ?)\n   AND CAST(\"public\".\"entries\".\"time\" AS date) = CAST((NOW() + INTERVAL '-1 day') AS date) AND \"public\".\"entries\".\"bucket\" = ?)\nGROUP BY date_trunc('hour', CAST(\"public\".\"entries\".\"time\" AS timestamp))\nORDER BY date_trunc('hour', CAST(\"public\".\"entries\".\"time\" AS timestamp)) ASC"
            }
        },
        "id": 305,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 2500,
            "graph.y_axis.auto_range": false,
            "graph.y_axis.max": 3000,
            "progress.goal": 10000,
            "progress.color": "#509EE3"
        },
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-05T16:58:09.898Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "tom sql filter test",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-04-07T05:08:38.328Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT count(*) AS \"count\"\nFROM \"PUBLIC\".\"REVIEWS\" WHERE {{created}}",
                "template_tags": {
                    "created": {
                        "id": "c55f6ea1-83d1-662d-de92-3fcde11bc000",
                        "name": "created",
                        "display_name": "Created",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            22
                        ],
                        "widget_type": "date/month-year"
                    }
                }
            }
        },
        "id": 236,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-04-07T05:08:38.328Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "tom sql var test",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-01-02T18:35:49.881Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "SELECT count(*) AS \"count\"\nFROM \"PUBLIC\".\"ORDERS\"\nWHERE {{created_at}}",
                "template_tags": {
                    "created_at": {
                        "id": "2a8a8100-c114-7f8d-0bb0-a87766f8a59b",
                        "name": "created_at",
                        "display_name": "Created at",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            25
                        ]
                    }
                }
            }
        },
        "id": 134,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-08-10T09:54:49.771Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Tom test",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-09-28T17:13:01.061Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ]
            }
        },
        "id": 210,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-02-01T15:26:08.335Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "?column?",
                "name": "?column?"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 12,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "tom test sql",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-10-24T21:32:24.020Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 12,
            "type": "native",
            "native": {
                "query": "select 13"
            }
        },
        "id": 216,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-02-28T20:14:14.481Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "ID",
                "name": "ID"
            },
            {
                "base_type": "type/Integer",
                "display_name": "User ID",
                "name": "USER_ID"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Product ID",
                "name": "PRODUCT_ID"
            },
            {
                "base_type": "type/Float",
                "display_name": "Subtotal",
                "name": "SUBTOTAL"
            },
            {
                "base_type": "type/Float",
                "display_name": "Tax",
                "name": "TAX"
            },
            {
                "base_type": "type/Float",
                "display_name": "Total",
                "name": "TOTAL"
            },
            {
                "base_type": "type/Float",
                "display_name": "Discount",
                "name": "DISCOUNT"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Created At",
                "name": "CREATED_AT"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Quantity",
                "name": "QUANTITY"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "native",
        "name": "tom test sql with field filter template tag",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-12-29T17:19:16.369Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "native",
            "native": {
                "query": "select * from orders where {{id}}",
                "collection": "ORDERS",
                "template_tags": {
                    "id": {
                        "id": "4e6f7a0b-748f-80cd-9594-626fc414501d",
                        "name": "id",
                        "display_name": "Id",
                        "type": "dimension",
                        "dimension": [
                            "field-id",
                            1
                        ]
                    }
                }
            }
        },
        "id": 231,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-30T18:50:11.869Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "State",
                "name": "STATE",
                "description": "The state or province of the account’s billing address",
                "special_type": "type/State"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Top 10 Orderer States",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-07T17:19:14.304Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "fk->",
                        5,
                        33
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ],
                "limit": 10
            }
        },
        "id": 265,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-16T19:28:58.057Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Number of issues created by GH users. Excludes the MB team.",
        "archived": false,
        "labels": [],
        "table_id": 10,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 3,
        "enable_embedding": false,
        "collection_id": 2,
        "query_type": "query",
        "name": "Top community issue filers",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:16:54.473Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 3,
            "type": "query",
            "query": {
                "source_table": 10,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    92
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        2
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ],
                "limit": 10
            }
        },
        "id": 36,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 2,
            "name": "Github Statistics",
            "slug": "github_statistics",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-01-25T19:15:00.086Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:totalEvents",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Total Custom Remappings events",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-04T17:32:40.041Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6939
                        ],
                        "Custom Remappings"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-07-23"
                    ]
                ]
            }
        },
        "id": 292,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T17:29:43.739Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:totalEvents",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 23,
        "query_type": "query",
        "name": "Total DB Creation Events",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-11-06T21:58:09.168Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        27
                    ]
                ],
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ]
            }
        },
        "id": 370,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 23,
            "name": "Database Tracking",
            "slug": "database_tracking",
            "description": null,
            "color": "#7B8797",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-11-06T21:58:09.168Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:totalEvents",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Total DB Creation failures",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-11-06T21:59:32.167Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        28
                    ]
                ],
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ]
            }
        },
        "id": 371,
        "display": "scalar",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2017-11-06T21:59:32.167Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Total number of distinct IP addresses that have ever downloaded Metabase. Valid downloads only.",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            },
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": 6,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Total Download IPs",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-04-06T21:14:52.549Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    "distinct",
                    45
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        4
                    ]
                ]
            }
        },
        "id": 84,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-14T17:12:43.478Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Count of downloads all time",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            },
            {
                "id": 17,
                "name": "TV dashboard",
                "slug": "tv_dashboard",
                "icon": "#72AFE5"
            }
        ],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Total Downloads",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-16T01:13:01.849Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    "METRIC",
                    2
                ],
                "breakout": [],
                "filter": []
            }
        },
        "id": 4,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-10-24T15:41:54.670Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Count of downloads during the last 24 hours",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Cnt",
                "name": "cnt"
            }
        ],
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "Total Downloads (24Hr)",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2018-01-13T01:54:40.930Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "native",
            "native": {
                "query": "select count(*) as cnt\nfrom entries\nwhere operation in ('REST.GET.OBJECT', 'WEBSITE.GET.OBJECT')\nand http_status in (200, 204, 206)\nand time > NOW() - INTERVAL '24' HOUR"
            }
        },
        "id": 18,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-12-04T17:51:29.569Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Count of downloads broken out by Week of the Year",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": 6,
        "result_metadata": null,
        "creator": {
            "email": "allen@metabase.com",
            "first_name": "Allen",
            "last_login": "2016-06-24T18:55:14.856Z",
            "is_qbnewb": false,
            "is_superuser": false,
            "id": 1,
            "last_name": "Gilliland",
            "date_joined": "2015-10-24T05:35:13.572Z",
            "common_name": "Allen Gilliland"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Total Downloads per Week",
        "in_public_dashboard": false,
        "creator_id": 1,
        "updated_at": "2017-04-06T21:14:52.465Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        49,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        38,
                        200,
                        204,
                        206
                    ],
                    [
                        "=",
                        47,
                        "REST.GET.OBJECT",
                        "WEBSITE.GET.OBJECT"
                    ],
                    [
                        "!=",
                        41,
                        "appcast.xml",
                        "Metabase.dmg",
                        "Metabase.zip",
                        "favicon.ico",
                        "index.html"
                    ]
                ]
            }
        },
        "id": 20,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2015-12-15T20:10:21.369Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:totalEvents",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Total foreign key remapping events",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-04T17:32:40.042Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6939
                        ],
                        "Foreign Key"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-07-23"
                    ]
                ]
            }
        },
        "id": 290,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T17:27:54.601Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Total invite emails sent",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:14:52.419Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        73,
                        "GET /email_graph_bottom.png HTTP/1.1"
                    ],
                    [
                        ">",
                        80,
                        "2015-10-12"
                    ]
                ]
            }
        },
        "id": 219,
        "display": "scalar",
        "visualization_settings": {
            "line": {
                "lineColor": "#EF8C8C",
                "marker_fillColor": "#EF8C8C",
                "marker_lineColor": "#EF8C8C"
            },
            "area": {
                "fillColor": "#EF8C8C"
            },
            "bar": {
                "color": "#EF8C8C"
            }
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-10T02:43:54.436Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "After July 23rd, because 0.25.0 was released on July 24.",
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:totalEvents",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Total nested query events",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-04T17:32:40.149Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6939
                        ],
                        ":nest-query"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-07-23"
                    ]
                ]
            }
        },
        "id": 287,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T17:11:44.442Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Total nested query events per day",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-05T17:25:39.404Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6939
                        ],
                        ":nest-query"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-07-23"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 325,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-05T17:25:39.404Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:totalEvents",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 17,
        "query_type": "query",
        "name": "Total \"No Remapping\" events",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-08-04T17:32:40.042Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6939
                        ],
                        "No Remapping"
                    ],
                    [
                        ">",
                        [
                            "field-id",
                            6851
                        ],
                        "2017-07-23"
                    ]
                ]
            }
        },
        "id": 291,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 17,
            "name": "Release 0.25",
            "slug": "release_0_25",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-08-04T17:29:14.172Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Bucket Floor",
                "name": "bucket_floor"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Count",
                "name": "count"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Total Questions per Instance",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:50.235Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select floor((stats->'question'->'questions'->>'total')::int/10)*10 as bucket_floor, count(*) \nfrom usage_stats\ngroup by 1\norder by 1\n\n"
            },
            "parameters": []
        },
        "id": 186,
        "display": "table",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-12T22:06:51.069Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Use IP as a proxy for \"unique\" downloaders, either individuals or companies.",
        "archived": false,
        "labels": [
            {
                "id": 14,
                "name": "Downloads",
                "slug": "downloads",
                "icon": "#84BB4C"
            }
        ],
        "table_id": 6,
        "result_metadata": null,
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "query",
        "name": "Total unique downloads (non mac app)",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-04-06T21:14:52.555Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    "distinct",
                    45
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        4
                    ],
                    [
                        "DOES_NOT_CONTAIN",
                        41,
                        "dmg"
                    ]
                ]
            }
        },
        "id": 75,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-04-01T17:22:40.375Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "Sum",
                "name": "sum"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "native",
        "name": "Total User Accounts",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:50.276Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "native",
            "native": {
                "query": "select sum((stats->'user'->'users'->>'total')::int)\nfrom usage_stats\n\n"
            },
            "parameters": []
        },
        "id": 189,
        "display": "scalar",
        "visualization_settings": {
            "table.column_widths": []
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-15T23:38:19.931Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:users",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Total Website Visitors",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:14:33.136Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ]
            }
        },
        "id": 333,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:06:43.899Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:users",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Total Website Visitors This Year",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:14:33.176Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            7105
                        ],
                        "2017-01-01"
                    ]
                ]
            }
        },
        "id": 334,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:07:18.327Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "day"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:pageviews",
                "name": "ga:pageviews"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 19,
        "query_type": "query",
        "name": "Total x-rays page views per day",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-05T17:18:48.251Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:pageviews"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6991
                        ],
                        "/xray/"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "day"
                    ]
                ]
            }
        },
        "id": 322,
        "display": "line",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ]
        },
        "collection": {
            "id": 19,
            "name": "Release 0.26 usage",
            "slug": "release_0_26_usage",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-05T17:03:12.556Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1232,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Version",
                "name": "version",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/DateTime",
                "display_name": "Ts",
                "name": "ts",
                "unit": "month"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "query",
        "name": "Usage by version, 100% stacked bar chart",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-07-24T19:10:20.706Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "query",
            "query": {
                "source_table": 1232,
                "aggregation": [
                    [
                        "distinct",
                        [
                            "field-id",
                            7654
                        ]
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        7655
                    ],
                    [
                        "datetime-field",
                        [
                            "field-id",
                            7653
                        ],
                        "as",
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            7655
                        ],
                        "v0.2"
                    ],
                    [
                        "DOES_NOT_CONTAIN",
                        [
                            "field-id",
                            7655
                        ],
                        "snapshot"
                    ],
                    [
                        "DOES_NOT_CONTAIN",
                        [
                            "field-id",
                            7655
                        ],
                        "RC"
                    ],
                    [
                        "DOES_NOT_CONTAIN",
                        [
                            "field-id",
                            7655
                        ],
                        "rc"
                    ]
                ]
            }
        },
        "id": 262,
        "display": "bar",
        "visualization_settings": {
            "graph.dimensions": [
                "ts",
                "version"
            ],
            "graph.metrics": [
                "count"
            ],
            "stackable.stack_type": "normalized",
            "line.missing": "interpolate"
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-06T21:38:57.183Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1232,
        "result_metadata": [
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "query",
        "name": "Usage Stats based on this many instances",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-24T18:29:48.277Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "query",
            "query": {
                "source_table": 1232,
                "aggregation": [
                    "count"
                ],
                "breakout": [],
                "filter": []
            }
        },
        "id": 184,
        "display": "scalar",
        "visualization_settings": {},
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-10T02:20:51.725Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Versions of Metabase 0.20 and above",
        "archived": false,
        "labels": [],
        "table_id": 1232,
        "result_metadata": null,
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 14,
        "enable_embedding": false,
        "collection_id": 1,
        "query_type": "query",
        "name": "Version usage by week",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2017-06-06T21:36:09.292Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 14,
            "type": "query",
            "query": {
                "source_table": 1232,
                "aggregation": [
                    [
                        "distinct",
                        [
                            "field-id",
                            7654
                        ]
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        7655
                    ],
                    [
                        "datetime-field",
                        [
                            "field-id",
                            7653
                        ],
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        [
                            "field-id",
                            7655
                        ],
                        "v0.2"
                    ],
                    [
                        "DOES_NOT_CONTAIN",
                        [
                            "field-id",
                            7655
                        ],
                        "snapshot"
                    ],
                    [
                        "DOES_NOT_CONTAIN",
                        [
                            "field-id",
                            7655
                        ],
                        "RC"
                    ],
                    [
                        "DOES_NOT_CONTAIN",
                        [
                            "field-id",
                            7655
                        ],
                        "rc"
                    ]
                ]
            }
        },
        "id": 261,
        "display": "area",
        "visualization_settings": {
            "graph.dimensions": [
                "ts",
                "version"
            ],
            "graph.metrics": [
                "count"
            ],
            "stackable.stack_type": "stacked",
            "line.missing": "interpolate"
        },
        "collection": {
            "id": 1,
            "name": "Anonymous Usage Statistics",
            "slug": "anonymous_usage_statistics",
            "description": "Anonymous Usage Statistics",
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-06-06T06:54:13.321Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Website New Users",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:28:15.144Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    "METRIC",
                    "ga:newUsers"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        7105,
                        "as",
                        "week"
                    ]
                ],
                "filter": []
            }
        },
        "id": 197,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-21T21:39:20.133Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Website Page Views",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:28:27.503Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    "METRIC",
                    "ga:pageviews"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        7105,
                        "as",
                        "month"
                    ]
                ],
                "filter": []
            }
        },
        "id": 192,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-21T20:39:50.355Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Website Users",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:33:44.472Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "aggregation": [
                    "METRIC",
                    "ga:users"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        7105,
                        "as",
                        "week"
                    ]
                ],
                "filter": []
            }
        },
        "id": 195,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-21T21:37:20.533Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "query",
        "name": "Weekly Active Installations",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-11-02T18:34:11.231Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "distinct",
                        76
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "week"
                    ]
                ]
            }
        },
        "id": 331,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 2500,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000,
            "progress.goal": 10000,
            "progress.color": "#509EE3"
        },
        "collection": null,
        "favorite": false,
        "created_at": "2017-10-16T23:10:56.843Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Weekly Active Instances",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:25:02.404Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "/",
                        [
                            "count"
                        ],
                        14
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "week"
                    ]
                ]
            }
        },
        "id": 342,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 2500,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000,
            "progress.goal": 10000,
            "progress.color": "#509EE3"
        },
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": true,
        "created_at": "2017-10-17T01:25:02.404Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 9,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Weekly Active Instances (Avg)",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-10-17T01:26:31.898Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "query",
            "query": {
                "source_table": 9,
                "aggregation": [
                    [
                        "/",
                        [
                            "count"
                        ],
                        14
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "STARTS_WITH",
                        72,
                        "version"
                    ],
                    [
                        "=",
                        [
                            "field-id",
                            71
                        ],
                        "static.metabase.com"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            80
                        ],
                        "week"
                    ]
                ]
            }
        },
        "id": 343,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": true,
            "graph.goal_value": 2500,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000,
            "progress.goal": 10000,
            "progress.color": "#509EE3"
        },
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-17T01:25:04.309Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:users",
                "name": "ga:users"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Weekly Active Users",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-16T01:02:02.640Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            6851
                        ],
                        -130,
                        "week",
                        {
                            "include-current": true
                        }
                    ]
                ]
            }
        },
        "id": 401,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2018-01-16T01:02:02.640Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 43,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Timestamp",
                "name": "timestamp",
                "special_type": "type/PK",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 9,
        "enable_embedding": false,
        "collection_id": 4,
        "query_type": "query",
        "name": "Weekly cards can't be x-rayd",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-09-26T00:53:30.121Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 9,
            "type": "query",
            "query": {
                "source_table": 43,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            547
                        ],
                        "week"
                    ]
                ]
            }
        },
        "id": 315,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 4,
            "name": "Canaries",
            "slug": "canaries",
            "description": null,
            "color": "#F9CF48",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-26T00:53:30.121Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1134,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:users",
                "name": "ga:users"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Weekly Forum Users",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-16T00:52:16.651Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1134,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "breakout": [
                    [
                        "datetime_field",
                        6597,
                        "as",
                        "week"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            6597
                        ],
                        -130,
                        "week",
                        {
                            "include-current": true
                        }
                    ]
                ]
            }
        },
        "id": 398,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2018-01-16T00:52:16.651Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:total Events",
                "name": "ga:totalEvents"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Weekly Queries",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-16T00:54:15.784Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:totalEvents"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        [
                            "field-id",
                            6937
                        ],
                        "Run Query"
                    ],
                    [
                        "time-interval",
                        [
                            "field-id",
                            6851
                        ],
                        -150,
                        "week",
                        {
                            "include-current": true
                        }
                    ],
                    [
                        "!=",
                        [
                            "field-id",
                            6939
                        ],
                        "(not set)",
                        "url",
                        "multi"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            6851
                        ],
                        "as",
                        "week"
                    ]
                ]
            }
        },
        "id": 399,
        "display": "area",
        "visualization_settings": {
            "table.column_widths": [],
            "graph.x_axis.title_text": "Query Type",
            "graph.y_axis.title_text": "Queries",
            "graph.colors": [
                "#509EE3",
                "#EF8C8C",
                "#a989c5",
                "#ef8c8c",
                "#f9d45c",
                "#F1B556",
                "#A6E7F3",
                "#7172AD",
                "#7B8797",
                "#6450e3",
                "#55e350",
                "#e35850",
                "#77c183",
                "#7d77c1",
                "#c589b9",
                "#bec589",
                "#89c3c5",
                "#c17777",
                "#899bc5",
                "#efce8c",
                "#50e3ae",
                "#be8cef",
                "#8cefc6",
                "#ef8cde",
                "#b5f95c",
                "#5cc2f9",
                "#f95cd0",
                "#c1a877",
                "#f95c67"
            ],
            "stackable.stack_type": "stacked"
        },
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2018-01-16T00:54:15.784Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 3,
        "query_type": "query",
        "name": "Weekly Users",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T21:39:47.850Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    "METRIC",
                    "ga:users"
                ],
                "breakout": [
                    [
                        "datetime_field",
                        6851,
                        "as",
                        "week"
                    ]
                ],
                "filter": []
            }
        },
        "id": 188,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 3,
            "name": "Google Analytics Statistics",
            "slug": "google_analytics_statistics",
            "description": null,
            "color": "#84BB4C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-12-15T20:47:18.315Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1136,
        "result_metadata": [
            {
                "base_type": "type/Date",
                "display_name": "Date",
                "name": "ga:date",
                "description": "The date of the session formatted as YYYYMMDD.",
                "unit": "week"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Ga:users",
                "name": "ga:users"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 21,
        "query_type": "query",
        "name": "Weekly Website Visitors",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-16T00:57:56.276Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1136,
                "filter": [
                    "AND",
                    [
                        "time-interval",
                        [
                            "field-id",
                            7105
                        ],
                        -110,
                        "week",
                        {
                            "include-current": true
                        }
                    ]
                ],
                "aggregation": [
                    [
                        "METRIC",
                        "ga:users"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            7105
                        ],
                        "week"
                    ]
                ]
            }
        },
        "id": 400,
        "display": "area",
        "visualization_settings": {},
        "collection": {
            "id": 21,
            "name": "Marketing Numbers",
            "slug": "marketing_numbers",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2018-01-16T00:57:56.276Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": null,
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Weird pin map",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-03-21T21:35:28.539Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "fk->",
                        5,
                        21
                    ],
                    [
                        "fk->",
                        5,
                        31
                    ]
                ]
            }
        },
        "id": 223,
        "display": "map",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-21T21:35:28.539Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1,
        "result_metadata": [
            {
                "base_type": "type/Float",
                "display_name": "Latitude",
                "name": "LATITUDE",
                "description": "This is the latitude of the user on sign-up. It might be updated in the future to the last seen location.",
                "special_type": "type/Latitude"
            },
            {
                "base_type": "type/Float",
                "display_name": "Longitude",
                "name": "LONGITUDE",
                "description": "This is the longitude of the user on sign-up. It might be updated in the future to the last seen location.",
                "special_type": "type/Longitude"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 1,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Weird scatterplot",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-11-30T21:29:11.534Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 1,
            "type": "query",
            "query": {
                "source_table": 1,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "fk->",
                        5,
                        21
                    ],
                    [
                        "fk->",
                        5,
                        31
                    ]
                ]
            }
        },
        "id": 224,
        "display": "scatter",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-03-21T21:36:06.768Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 41,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Reason",
                "name": "reason",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 10,
        "query_type": "query",
        "name": "What people like about us.",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2018-01-06T01:01:44.533Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 41,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "field-id",
                        533
                    ]
                ],
                "order_by": [
                    [
                        [
                            "aggregation",
                            0
                        ],
                        "descending"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        ">",
                        [
                            "field-id",
                            532
                        ],
                        6
                    ],
                    [
                        "!=",
                        [
                            "field-id",
                            533
                        ],
                        "I forgot about it!",
                        "Missing a feature I require",
                        "My team didn’t like it",
                        "Too complicated/confusing"
                    ]
                ]
            }
        },
        "id": 394,
        "display": "bar",
        "visualization_settings": {},
        "collection": {
            "id": 10,
            "name": "Survey Results",
            "slug": "survey_results",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-12-20T20:31:49.548Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": "Louie's, Uno Dos Tacos, North India, Henry's, HRD",
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Name",
                "name": "name"
            }
        ],
        "creator": {
            "email": "tom@metabase.com",
            "first_name": "Tom",
            "last_login": "2018-01-12T08:59:33.094Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 4,
            "last_name": "Robinson",
            "date_joined": "2015-10-24T16:00:18.903Z",
            "common_name": "Tom Robinson"
        },
        "database_id": 6,
        "enable_embedding": false,
        "collection_id": null,
        "query_type": "native",
        "name": "where we should go for lunch",
        "in_public_dashboard": false,
        "creator_id": 4,
        "updated_at": "2018-01-12T20:56:15.670Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 6,
            "type": "native",
            "native": {
                "query": "SELECT name\nFROM unnest(ARRAY[\n  'Louie''s 🍔',\n  'Uno 🌮 Dos 🌮🌮 Tacos 🌮🌮🌮',\n  'North India 🇮🇳',\n  'Henry''s Hunan 🍚',\n  'HRD 🌯',\n  'Gold Club',\n  'Cam''s house'\n]) AS t(name)\nORDER BY random()\nLIMIT 1"
            }
        },
        "id": 81,
        "display": "scalar",
        "visualization_settings": {},
        "collection": null,
        "favorite": false,
        "created_at": "2016-04-08T19:52:22.318Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": null,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time"
            },
            {
                "base_type": "type/Integer",
                "display_name": "Growth",
                "name": "growth"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 4,
        "enable_embedding": false,
        "collection_id": 12,
        "query_type": "native",
        "name": "WoW Active Instance Growth",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-11-02T18:23:56.506Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 4,
            "type": "native",
            "native": {
                "query": "SELECT * FROM \n(SELECT time, 100* (count - lag(count, 1) over (ORDER BY time))/lag(count, 1) over (ORDER BY time) as growth\nFROM (SELECT  date_trunc('week', time) AS \"time\", \n        count(distinct remote_ip) AS \"count\"\n        FROM entries\n        WHERE key like 'version%'\n        GROUP BY 1)foo\nORDER BY 1)b\nWHERE growth IS NOT NULL"
            },
            "parameters": []
        },
        "id": 207,
        "display": "line",
        "visualization_settings": {
            "graph.show_goal": false,
            "graph.goal_value": 2500,
            "graph.y_axis.auto_range": true,
            "graph.y_axis.max": 3000,
            "graph.dimensions": [
                "time"
            ],
            "graph.metrics": [
                "count"
            ],
            "table.column_widths": []
        },
        "collection": {
            "id": 12,
            "name": "Downloads",
            "slug": "downloads",
            "description": null,
            "color": "#F1B556",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-01-27T18:53:23.373Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:pageviews",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 19,
        "query_type": "query",
        "name": "X-ray: card",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-05T17:06:49.596Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:pageviews"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6991
                        ],
                        "xray/card"
                    ]
                ]
            }
        },
        "id": 317,
        "display": "scalar",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ]
        },
        "collection": {
            "id": 19,
            "name": "Release 0.26 usage",
            "slug": "release_0_26_usage",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-02T19:08:46.081Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 6,
        "result_metadata": [
            {
                "base_type": "type/DateTime",
                "display_name": "Time",
                "name": "time",
                "unit": "month"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "kyle@metabase.com",
            "first_name": "Kyle",
            "last_login": "2018-01-15T18:49:03.278Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 5,
            "last_name": "Doherty",
            "date_joined": "2015-10-24T16:00:37.501Z",
            "common_name": "Kyle Doherty"
        },
        "database_id": 2,
        "enable_embedding": false,
        "collection_id": 7,
        "query_type": "query",
        "name": "Xray downloads test",
        "in_public_dashboard": false,
        "creator_id": 5,
        "updated_at": "2017-09-19T00:35:16.927Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 2,
            "type": "query",
            "query": {
                "source_table": 6,
                "aggregation": [
                    [
                        "count"
                    ]
                ],
                "breakout": [
                    [
                        "datetime-field",
                        [
                            "field-id",
                            49
                        ],
                        "month"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "SEGMENT",
                        4
                    ]
                ]
            }
        },
        "id": 309,
        "display": "line",
        "visualization_settings": {},
        "collection": {
            "id": 7,
            "name": "Test Questions",
            "slug": "test_questions",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-09-18T21:24:31.013Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:pageviews",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 19,
        "query_type": "query",
        "name": "X-ray: field",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-05T17:07:34.506Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:pageviews"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6991
                        ],
                        "xray/field"
                    ]
                ]
            }
        },
        "id": 320,
        "display": "scalar",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ]
        },
        "collection": {
            "id": 19,
            "name": "Release 0.26 usage",
            "slug": "release_0_26_usage",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-02T19:12:49.165Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:pageviews",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 19,
        "query_type": "query",
        "name": "X-ray: segment",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-05T17:07:42.892Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:pageviews"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6991
                        ],
                        "xray/segment"
                    ]
                ]
            }
        },
        "id": 319,
        "display": "scalar",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ]
        },
        "collection": {
            "id": 19,
            "name": "Release 0.26 usage",
            "slug": "release_0_26_usage",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-02T19:12:31.281Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:pageviews",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 19,
        "query_type": "query",
        "name": "X-ray: segment comparison",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-05T17:05:42.450Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:pageviews"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6991
                        ],
                        "xray/compare/segment/"
                    ]
                ]
            }
        },
        "id": 323,
        "display": "scalar",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ]
        },
        "collection": {
            "id": 19,
            "name": "Release 0.26 usage",
            "slug": "release_0_26_usage",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-05T17:05:42.450Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 1135,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Acquisition Campaign",
                "name": "ga:pageviews",
                "description": "The campaign through which users were acquired, derived from users' first session."
            }
        ],
        "creator": {
            "email": "maz@metabase.com",
            "first_name": "Maz",
            "last_login": "2018-01-12T18:19:48.804Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 2,
            "last_name": "Ameli",
            "date_joined": "2015-10-24T15:59:35.923Z",
            "common_name": "Maz Ameli"
        },
        "database_id": 13,
        "enable_embedding": false,
        "collection_id": 19,
        "query_type": "query",
        "name": "X-ray: table",
        "in_public_dashboard": false,
        "creator_id": 2,
        "updated_at": "2017-10-05T17:07:23.974Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 13,
            "type": "query",
            "query": {
                "source_table": 1135,
                "aggregation": [
                    [
                        "METRIC",
                        "ga:pageviews"
                    ]
                ],
                "filter": [
                    "AND",
                    [
                        "CONTAINS",
                        [
                            "field-id",
                            6991
                        ],
                        "xray/table"
                    ]
                ]
            }
        },
        "id": 318,
        "display": "scalar",
        "visualization_settings": {
            "graph.dimensions": [
                "ga:date",
                "ga:eventLabel"
            ],
            "graph.metrics": [
                "ga:totalEvents"
            ]
        },
        "collection": {
            "id": 19,
            "name": "Release 0.26 usage",
            "slug": "release_0_26_usage",
            "description": null,
            "color": "#EF8C8C",
            "archived": false
        },
        "favorite": false,
        "created_at": "2017-10-02T19:12:06.999Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 18,
        "result_metadata": null,
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 13,
        "query_type": "query",
        "name": "Yesterday's Contact Form Messages",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2017-04-06T23:11:45.953Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 18,
                "aggregation": [
                    "rows"
                ],
                "breakout": [],
                "filter": [
                    "AND",
                    [
                        "=",
                        191,
                        [
                            "relative_datetime",
                            -1,
                            "day"
                        ]
                    ]
                ]
            }
        },
        "id": 59,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 13,
            "name": "User Communications",
            "slug": "user_communications",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-25T01:31:57.334Z",
        "public_uuid": null,
        spaces: [2]
    },
    {
        "description": null,
        "archived": false,
        "labels": [],
        "table_id": 18,
        "result_metadata": [
            {
                "base_type": "type/Text",
                "display_name": "Interested In",
                "name": "interested_in",
                "special_type": "type/Category"
            },
            {
                "base_type": "type/Integer",
                "display_name": "count",
                "name": "count",
                "special_type": "type/Number"
            }
        ],
        "creator": {
            "email": "sameer@metabase.com",
            "first_name": "Sameer",
            "last_login": "2018-01-02T21:09:06.028Z",
            "is_qbnewb": false,
            "is_superuser": true,
            "id": 3,
            "last_name": "Al-Sakran",
            "date_joined": "2015-10-24T15:59:51.418Z",
            "common_name": "Sameer Al-Sakran"
        },
        "database_id": 7,
        "enable_embedding": false,
        "collection_id": 13,
        "query_type": "query",
        "name": "Yesterdays Contact Form Responses by Type",
        "in_public_dashboard": false,
        "creator_id": 3,
        "updated_at": "2018-01-16T16:00:09.449Z",
        "made_public_by_id": null,
        "embedding_params": null,
        "cache_ttl": null,
        "dataset_query": {
            "database": 7,
            "type": "query",
            "query": {
                "source_table": 18,
                "aggregation": [
                    "count"
                ],
                "breakout": [
                    187
                ],
                "filter": [
                    "AND",
                    [
                        "=",
                        191,
                        [
                            "relative_datetime",
                            -1,
                            "day"
                        ]
                    ]
                ]
            }
        },
        "id": 61,
        "display": "table",
        "visualization_settings": {},
        "collection": {
            "id": 13,
            "name": "User Communications",
            "slug": "user_communications",
            "description": null,
            "color": "#509EE3",
            "archived": false
        },
        "favorite": false,
        "created_at": "2016-02-25T01:47:31.328Z",
        "public_uuid": null,
        spaces: [2]
    }
]
