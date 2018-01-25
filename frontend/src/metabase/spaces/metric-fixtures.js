export const METRICS = [
    {
        "description": "Installations or instances of Metabase that we know of because they accessed a static asset that we host. ",
        "table_id": 9,
        "definition": {
            "aggregation": [
                [
                    "/",
                    [
                        "count"
                    ],
                    2
                ]
            ],
            "source_table": 9,
            "filter": [
                "and",
                [
                    "STARTS_WITH",
                    [
                        "field-id",
                        72
                    ],
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
            ]
        },
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
        "show_in_getting_started": true,
        "name": "Active Instances",
        "is_active": true,
        "caveats": "We take the count of entries and divide it by 2 because each instance checks in twice a day. So sometimes you'll see this metric have an extra 1/2 in the result.",
        "creator_id": 2,
        "updated_at": "2017-12-22T20:00:21.464Z",
        "id": 17,
        "how_is_this_calculated": "We divide the count of rows of entries by two because we poll twice a day. This is more accurate than simply counting distinct IPs; we've seen tons of variance in that metric, probably due to weird nat and reverse proxying going on.",
        "created_at": "2017-09-18T21:29:37.448Z",
        "points_of_interest": "This is our best measurement of how many companies are actively using us on a regular basis.",
        spaces: [2]
    },
    {
        "description": "Average of the subtotal field.",
        "table_id": 1,
        "definition": {
            "aggregation": [
                "avg",
                15
            ],
            "filter": [],
            "source_table": 1
        },
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
        "show_in_getting_started": false,
        "name": "Avg Order Price",
        "is_active": true,
        "caveats": null,
        "creator_id": 2,
        "updated_at": "2016-02-12T22:44:09.862Z",
        "id": 7,
        "how_is_this_calculated": null,
        "created_at": "2016-02-12T22:44:09.862Z",
        "points_of_interest": null,
        spaces: [5]
    },
    {
        "description": "???",
        "table_id": 1,
        "definition": {
            "aggregation": [
                "count"
            ],
            "filter": [
                "AND",
                [
                    "=",
                    [
                        "fk->",
                        10,
                        16
                    ],
                    "Doohickey"
                ]
            ],
            "source_table": 1
        },
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
        "show_in_getting_started": false,
        "name": "count of doohickeys",
        "is_active": true,
        "caveats": null,
        "creator_id": 4,
        "updated_at": "2016-11-04T07:15:28.209Z",
        "id": 12,
        "how_is_this_calculated": null,
        "created_at": "2016-11-04T07:15:28.209Z",
        "points_of_interest": null,
        spaces: [5]
    },
    {
        "description": "the number of gadgets",
        "table_id": 1,
        "definition": {
            "aggregation": [
                "count"
            ],
            "filter": [
                "AND",
                [
                    "=",
                    [
                        "fk->",
                        10,
                        16
                    ],
                    "Gadget"
                ]
            ],
            "source_table": 1
        },
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
        "show_in_getting_started": false,
        "name": "Count of Gadgets",
        "is_active": true,
        "caveats": null,
        "creator_id": 3,
        "updated_at": "2016-12-23T20:14:27.348Z",
        "id": 13,
        "how_is_this_calculated": null,
        "created_at": "2016-12-23T20:14:27.348Z",
        "points_of_interest": null,
        spaces: [5]
    },
    {
        "description": "Max(Ranking)",
        "table_id": 1258,
        "definition": {
            "aggregation": [
                [
                    "named",
                    [
                        "max",
                        [
                            "field-id",
                            7760
                        ]
                    ],
                    "Derp"
                ]
            ],
            "source_table": 1258
        },
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
        "database_id": 15,
        "show_in_getting_started": false,
        "name": "Max ranking of Hacker News comment",
        "is_active": true,
        "caveats": null,
        "creator_id": 5,
        "updated_at": "2017-09-18T21:25:42.553Z",
        "id": 16,
        "how_is_this_calculated": null,
        "created_at": "2017-05-18T00:02:13.788Z",
        "points_of_interest": null,
        spaces: [5]
    },
    {
        "description": "How many people have filled out the contact form on Metabase.com, not including email addresses from @metabase.com",
        "table_id": 18,
        "definition": {
            "aggregation": [
                "count"
            ],
            "filter": [
                "AND",
                [
                    "DOES_NOT_CONTAIN",
                    185,
                    "@metabase.com"
                ]
            ],
            "source_table": 18
        },
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
        "show_in_getting_started": false,
        "name": "Number of Contacts",
        "is_active": true,
        "caveats": "",
        "creator_id": 2,
        "updated_at": "2016-10-10T20:47:43.114Z",
        "id": 8,
        "how_is_this_calculated": null,
        "created_at": "2016-02-26T18:09:55.409Z",
        "points_of_interest": "",
        spaces: [2]
    },
    {
        "description": "Number of distinct values of user logins.",
        "table_id": 7,
        "definition": {
            "aggregation": [
                "distinct",
                60
            ],
            "filter": [
                "AND",
                [
                    "SEGMENT",
                    3
                ]
            ],
            "source_table": 7
        },
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
        "show_in_getting_started": false,
        "name": "Number of distinct GH users",
        "is_active": true,
        "caveats": "",
        "creator_id": 2,
        "updated_at": "2017-12-22T19:57:36.427Z",
        "id": 1,
        "how_is_this_calculated": null,
        "created_at": "2016-01-26T17:55:46.654Z",
        "points_of_interest": "It helps us keep tabs on how many individuals are commenting or contributing to Metabase on GitHub.",
        spaces: [2]
    },
    {
        "description": "Count of valid downloads.",
        "table_id": 6,
        "definition": {
            "aggregation": [
                "count"
            ],
            "filter": [
                "AND",
                [
                    "SEGMENT",
                    4
                ]
            ],
            "source_table": 6
        },
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
        "show_in_getting_started": false,
        "name": "Num Downloads",
        "is_active": true,
        "caveats": "",
        "creator_id": 1,
        "updated_at": "2017-08-22T23:44:51.069Z",
        "id": 2,
        "how_is_this_calculated": null,
        "created_at": "2016-01-26T20:08:00.491Z",
        "points_of_interest": "All the downloadz!",
        spaces: [2]
    },
    {
        "description": "Gives a better idea than raw download numbers",
        "table_id": 6,
        "definition": {
            "aggregation": [
                [
                    "distinct",
                    [
                        "field-id",
                        45
                    ]
                ]
            ],
            "source_table": 6,
            "filter": [
                "SEGMENT",
                4
            ]
        },
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
        "show_in_getting_started": false,
        "name": "Num of distinct download IPs",
        "is_active": true,
        "caveats": null,
        "creator_id": 2,
        "updated_at": "2017-09-28T21:41:55.114Z",
        "id": 19,
        "how_is_this_calculated": null,
        "created_at": "2017-09-28T21:41:28.944Z",
        "points_of_interest": null,
        spaces: [2]
    },
    {
        "description": "Average of Speed from the Cat Wheel table",
        "table_id": 13,
        "definition": {
            "aggregation": [
                "avg",
                102
            ],
            "filter": [
                "AND",
                [
                    "SEGMENT",
                    7
                ]
            ],
            "source_table": 13
        },
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
        "show_in_getting_started": false,
        "name": "Quinnie's Average Cat Wheel Speed",
        "is_active": true,
        "caveats": null,
        "creator_id": 3,
        "updated_at": "2017-09-18T23:40:28.637Z",
        "id": 5,
        "how_is_this_calculated": null,
        "created_at": "2016-01-30T00:22:20.210Z",
        "points_of_interest": null,
        spaces: [5]
    },
    {
        "description": "Sum of distance, invalid laps filtered out",
        "table_id": 13,
        "definition": {
            "aggregation": [
                "sum",
                101
            ],
            "filter": [
                "AND",
                [
                    "SEGMENT",
                    8
                ]
            ],
            "source_table": 13
        },
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
        "show_in_getting_started": false,
        "name": "Quinnie's Total Distance Run on Cat Wheel",
        "is_active": true,
        "caveats": null,
        "creator_id": 4,
        "updated_at": "2017-09-18T23:40:53.567Z",
        "id": 6,
        "how_is_this_calculated": null,
        "created_at": "2016-02-01T19:24:55.598Z",
        "points_of_interest": null,
        spaces: [5]
    },
    {
        "description": "Sum of subtotal",
        "table_id": 1,
        "definition": {
            "aggregation": [
                [
                    "sum",
                    [
                        "field-id",
                        15
                    ]
                ]
            ],
            "source_table": 1
        },
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
        "show_in_getting_started": false,
        "name": "Revenue",
        "is_active": true,
        "caveats": null,
        "creator_id": 2,
        "updated_at": "2017-12-07T19:49:21.650Z",
        "id": 20,
        "how_is_this_calculated": null,
        "created_at": "2017-12-07T19:49:21.650Z",
        "points_of_interest": null,
        spaces: [5]
    },
    {
        "description": "Revenue from Octogenarians",
        "table_id": 1,
        "definition": {
            "aggregation": [
                [
                    "sum",
                    [
                        "field-id",
                        15
                    ]
                ]
            ],
            "source_table": 1,
            "filter": [
                "<",
                [
                    "fk->",
                    5,
                    17
                ],
                "1938-01-01"
            ]
        },
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
        "show_in_getting_started": false,
        "name": "Revenue from Octogenarians",
        "is_active": true,
        "caveats": null,
        "creator_id": 2,
        "updated_at": "2017-09-19T18:07:43.095Z",
        "id": 18,
        "how_is_this_calculated": null,
        "created_at": "2017-09-19T18:07:43.095Z",
        "points_of_interest": null,
        spaces: [5]
    },
    {
        "description": "Sup",
        "table_id": 61,
        "definition": {
            "aggregation": [
                "count"
            ],
            "filter": [
                "AND",
                [
                    "TIME_INTERVAL",
                    620,
                    "last",
                    "year"
                ]
            ],
            "source_table": 61
        },
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
        "show_in_getting_started": false,
        "name": "Yo",
        "is_active": true,
        "caveats": null,
        "creator_id": 5,
        "updated_at": "2016-09-01T00:06:32.983Z",
        "id": 11,
        "how_is_this_calculated": null,
        "created_at": "2016-09-01T00:06:32.983Z",
        "points_of_interest": null,
        spaces: [5]
    }
]
