SELECT
  "__mb_source"."created_at" AS "created_at",
  "__mb_source"."count" AS "count",
  "New tickets 6 week rolling average - Created At: Week"."created_at" AS "New tickets 6 week rolling average - Created At: We_d5983d8d",
  "New tickets 6 week rolling average - Created At: Week"."avg last six weeks" AS "New tickets 6 week rolling average - Created At: We_5a1ee313"
FROM
  (
    SELECT
      (
        CAST(
          DATE_TRUNC(
            'week',
            ("__mb_source"."created_at" + INTERVAL '1 day')
          ) AS timestamp
        ) + INTERVAL '-1 day'
      ) AS "created_at",
      COUNT(*) AS "count"
    FROM
      (
        SELECT
          "__mb_source"."ticket_id" AS "ticket_id",
          "__mb_source"."created_at" AS "created_at",
          "__mb_source"."solved_at" AS "solved_at",
          "__mb_source"."assignee_updated_at" AS "assignee_updated_at",
          "__mb_source"."reopens" AS "reopens",
          "__mb_source"."replies" AS "replies",
          "__mb_source"."reply_time_in_minutes_calendar" AS "reply_time_in_minutes_calendar",
          "__mb_source"."reply_time_in_minutes_business" AS "reply_time_in_minutes_business",
          "__mb_source"."first_resolution_time_in_minutes_calendar" AS "first_resolution_time_in_minutes_calendar",
          "__mb_source"."first_resolution_time_in_minutes_business" AS "first_resolution_time_in_minutes_business",
          "__mb_source"."full_resolution_time_in_minutes_calendar" AS "full_resolution_time_in_minutes_calendar",
          "__mb_source"."full_resolution_time_in_minutes_business" AS "full_resolution_time_in_minutes_business",
          "__mb_source"."full_resolution_time_in_hours_calendar" AS "full_resolution_time_in_hours_calendar",
          "__mb_source"."full_resolution_time_in_hours_business" AS "full_resolution_time_in_hours_business",
          "__mb_source"."assignee_stations" AS "assignee_stations",
          "__mb_source"."group_stations" AS "group_stations",
          "pylon_ticket__via__ticket_id"."ticket_reason" AS "pylon_ticket__via__ticket_id__ticket_reason"
        FROM
          (
            SELECT
              "dbt_models_pylon"."pylon_ticket_metric"."ticket_id" AS "ticket_id",
              "dbt_models_pylon"."pylon_ticket_metric"."created_at" AS "created_at",
              "dbt_models_pylon"."pylon_ticket_metric"."solved_at" AS "solved_at",
              "dbt_models_pylon"."pylon_ticket_metric"."assignee_updated_at" AS "assignee_updated_at",
              "dbt_models_pylon"."pylon_ticket_metric"."reopens" AS "reopens",
              "dbt_models_pylon"."pylon_ticket_metric"."replies" AS "replies",
              "dbt_models_pylon"."pylon_ticket_metric"."reply_time_in_minutes_calendar" AS "reply_time_in_minutes_calendar",
              "dbt_models_pylon"."pylon_ticket_metric"."reply_time_in_minutes_business" AS "reply_time_in_minutes_business",
              "dbt_models_pylon"."pylon_ticket_metric"."first_resolution_time_in_minutes_calendar" AS "first_resolution_time_in_minutes_calendar",
              "dbt_models_pylon"."pylon_ticket_metric"."first_resolution_time_in_minutes_business" AS "first_resolution_time_in_minutes_business",
              "dbt_models_pylon"."pylon_ticket_metric"."full_resolution_time_in_minutes_calendar" AS "full_resolution_time_in_minutes_calendar",
              "dbt_models_pylon"."pylon_ticket_metric"."full_resolution_time_in_minutes_business" AS "full_resolution_time_in_minutes_business",
              "dbt_models_pylon"."pylon_ticket_metric"."full_resolution_time_in_hours_calendar" AS "full_resolution_time_in_hours_calendar",
              "dbt_models_pylon"."pylon_ticket_metric"."full_resolution_time_in_hours_business" AS "full_resolution_time_in_hours_business",
              "dbt_models_pylon"."pylon_ticket_metric"."assignee_stations" AS "assignee_stations",
              "dbt_models_pylon"."pylon_ticket_metric"."group_stations" AS "group_stations"
            FROM
              "dbt_models_pylon"."pylon_ticket_metric"
          ) AS "__mb_source"
          LEFT JOIN (
            SELECT
              "dbt_models_pylon"."pylon_ticket"."id" AS "id",
              "dbt_models_pylon"."pylon_ticket"."subject" AS "subject",
              "dbt_models_pylon"."pylon_ticket"."organization_name" AS "organization_name",
              "dbt_models_pylon"."pylon_ticket"."assignee_name" AS "assignee_name",
              "dbt_models_pylon"."pylon_ticket"."requester_email" AS "requester_email",
              "dbt_models_pylon"."pylon_ticket"."cc_emails" AS "cc_emails",
              "dbt_models_pylon"."pylon_ticket"."domain" AS "domain",
              "dbt_models_pylon"."pylon_ticket"."created_at" AS "created_at",
              "dbt_models_pylon"."pylon_ticket"."assignee_updated_at" AS "assignee_updated_at",
              "dbt_models_pylon"."pylon_ticket"."updated_at" AS "updated_at",
              "dbt_models_pylon"."pylon_ticket"."survey_created_at" AS "survey_created_at",
              "dbt_models_pylon"."pylon_ticket"."assignee_group_name" AS "assignee_group_name",
              "dbt_models_pylon"."pylon_ticket"."ticket_group" AS "ticket_group",
              "dbt_models_pylon"."pylon_ticket"."is_open" AS "is_open",
              "dbt_models_pylon"."pylon_ticket"."status" AS "status",
              "dbt_models_pylon"."pylon_ticket"."type" AS "type",
              "dbt_models_pylon"."pylon_ticket"."priority" AS "priority",
              "dbt_models_pylon"."pylon_ticket"."ticket_reason" AS "ticket_reason",
              "dbt_models_pylon"."pylon_ticket"."biz_ops_area" AS "biz_ops_area",
              "dbt_models_pylon"."pylon_ticket"."product_area" AS "product_area",
              "dbt_models_pylon"."pylon_ticket"."metabase_version" AS "metabase_version",
              "dbt_models_pylon"."pylon_ticket"."sent_survey" AS "sent_survey",
              "dbt_models_pylon"."pylon_ticket"."satisfaction_rating_score" AS "satisfaction_rating_score",
              "dbt_models_pylon"."pylon_ticket"."satisfaction_rating_value" AS "satisfaction_rating_value",
              "dbt_models_pylon"."pylon_ticket"."satisfaction_rating_comment" AS "satisfaction_rating_comment",
              "dbt_models_pylon"."pylon_ticket"."via_channel" AS "via_channel",
              "dbt_models_pylon"."pylon_ticket"."recipient" AS "recipient",
              "dbt_models_pylon"."pylon_ticket"."submitter_name" AS "submitter_name",
              "dbt_models_pylon"."pylon_ticket"."has_incidents" AS "has_incidents",
              "dbt_models_pylon"."pylon_ticket"."problem_id" AS "problem_id",
              "dbt_models_pylon"."pylon_ticket"."url" AS "url",
              "dbt_models_pylon"."pylon_ticket"."tags" AS "tags",
              "dbt_models_pylon"."pylon_ticket"."description" AS "description",
              "dbt_models_pylon"."pylon_ticket"."system_source" AS "system_source",
              "dbt_models_pylon"."pylon_ticket"."organization_id" AS "organization_id",
              "dbt_models_pylon"."pylon_ticket"."customer_id" AS "customer_id",
              "dbt_models_pylon"."pylon_ticket"."account_id" AS "account_id",
              "dbt_models_pylon"."pylon_ticket"."zendesk_ticket_id" AS "zendesk_ticket_id",
              "dbt_models_pylon"."pylon_ticket"."zendesk_ticket_url" AS "zendesk_ticket_url",
              "dbt_models_pylon"."pylon_ticket"."group_id" AS "group_id",
              "dbt_models_pylon"."pylon_ticket"."assignee_id" AS "assignee_id",
              "dbt_models_pylon"."pylon_ticket"."requester_id" AS "requester_id",
              "dbt_models_pylon"."pylon_ticket"."submitter_id" AS "submitter_id",
              "dbt_models_pylon"."pylon_ticket"."satisfaction_rating_id" AS "satisfaction_rating_id"
            FROM
              "dbt_models_pylon"."pylon_ticket"
          ) AS "pylon_ticket__via__ticket_id" ON "__mb_source"."ticket_id" = "pylon_ticket__via__ticket_id"."id"
        WHERE
          "pylon_ticket__via__ticket_id"."assignee_group_name" = ?
      ) AS "__mb_source"
    WHERE
      (
        "__mb_source"."created_at" >= (
          DATE_TRUNC(
            'week',
            ((NOW() + INTERVAL '-16 week') + INTERVAL '1 day')
          ) + INTERVAL '-1 day'
        )
      )
      AND (
        "__mb_source"."created_at" < (
          DATE_TRUNC(
            'week',
            ((NOW() + INTERVAL '1 week') + INTERVAL '1 day')
          ) + INTERVAL '-1 day'
        )
      )
      AND (
        NOT (
          LOWER(
            "__mb_source"."pylon_ticket__via__ticket_id__ticket_reason"
          ) LIKE ?
        )
        OR (
          "__mb_source"."pylon_ticket__via__ticket_id__ticket_reason" IS NULL
        )
      )
    GROUP BY
      (
        CAST(
          DATE_TRUNC(
            'week',
            ("__mb_source"."created_at" + INTERVAL '1 day')
          ) AS timestamp
        ) + INTERVAL '-1 day'
      )
    ORDER BY
      (
        CAST(
          DATE_TRUNC(
            'week',
            ("__mb_source"."created_at" + INTERVAL '1 day')
          ) AS timestamp
        ) + INTERVAL '-1 day'
      ) ASC
  ) AS "__mb_source"
  LEFT JOIN (
    SELECT
      "__mb_source"."created_at" AS "created_at",
      "__mb_source"."avg last six weeks" AS "avg last six weeks"
    FROM
      (
        SELECT
          (
            CAST(
              DATE_TRUNC(
                'week',
                ("__mb_source"."created_at" + INTERVAL '1 day')
              ) AS timestamp
            ) + INTERVAL '-1 day'
          ) AS "created_at",
          CAST(
            SUM("__mb_source"."last week") + SUM("__mb_source"."two weeks ago") + SUM("__mb_source"."three weeks ago") + SUM("__mb_source"."four weeks ago") + SUM("__mb_source"."five weeks ago") + SUM("__mb_source"."six weeks ago") AS DOUBLE PRECISION
          ) / 6.0 AS "avg last six weeks"
        FROM
          (
            SELECT
              "__mb_source"."created_at" AS "created_at",
              COUNT(*) AS "count",
              LAG(COUNT(*), 1) OVER (
                ORDER BY
                  "__mb_source"."created_at" ASC
              ) AS "last week",
              LAG(COUNT(*), 2) OVER (
                ORDER BY
                  "__mb_source"."created_at" ASC
              ) AS "two weeks ago",
              LAG(COUNT(*), 3) OVER (
                ORDER BY
                  "__mb_source"."created_at" ASC
              ) AS "three weeks ago",
              LAG(COUNT(*), 4) OVER (
                ORDER BY
                  "__mb_source"."created_at" ASC
              ) AS "four weeks ago",
              LAG(COUNT(*), 5) OVER (
                ORDER BY
                  "__mb_source"."created_at" ASC
              ) AS "five weeks ago",
              LAG(COUNT(*), 6) OVER (
                ORDER BY
                  "__mb_source"."created_at" ASC
              ) AS "six weeks ago"
            FROM
              (
                SELECT
                  "__mb_source"."created_at" AS "created_at"
                FROM
                  (
                    SELECT
                      (
                        CAST(
                          DATE_TRUNC(
                            'week',
                            ("__mb_source"."created_at" + INTERVAL '1 day')
                          ) AS timestamp
                        ) + INTERVAL '-1 day'
                      ) AS "created_at"
                    FROM
                      (
                        SELECT
                          "__mb_source"."ticket_id" AS "ticket_id",
                          "__mb_source"."created_at" AS "created_at",
                          "__mb_source"."solved_at" AS "solved_at",
                          "__mb_source"."assignee_updated_at" AS "assignee_updated_at",
                          "__mb_source"."reopens" AS "reopens",
                          "__mb_source"."replies" AS "replies",
                          "__mb_source"."reply_time_in_minutes_calendar" AS "reply_time_in_minutes_calendar",
                          "__mb_source"."reply_time_in_minutes_business" AS "reply_time_in_minutes_business",
                          "__mb_source"."first_resolution_time_in_minutes_calendar" AS "first_resolution_time_in_minutes_calendar",
                          "__mb_source"."first_resolution_time_in_minutes_business" AS "first_resolution_time_in_minutes_business",
                          "__mb_source"."full_resolution_time_in_minutes_calendar" AS "full_resolution_time_in_minutes_calendar",
                          "__mb_source"."full_resolution_time_in_minutes_business" AS "full_resolution_time_in_minutes_business",
                          "__mb_source"."full_resolution_time_in_hours_calendar" AS "full_resolution_time_in_hours_calendar",
                          "__mb_source"."full_resolution_time_in_hours_business" AS "full_resolution_time_in_hours_business",
                          "__mb_source"."assignee_stations" AS "assignee_stations",
                          "__mb_source"."group_stations" AS "group_stations"
                        FROM
                          (
                            SELECT
                              "dbt_models_pylon"."pylon_ticket_metric"."ticket_id" AS "ticket_id",
                              "dbt_models_pylon"."pylon_ticket_metric"."created_at" AS "created_at",
                              "dbt_models_pylon"."pylon_ticket_metric"."solved_at" AS "solved_at",
                              "dbt_models_pylon"."pylon_ticket_metric"."assignee_updated_at" AS "assignee_updated_at",
                              "dbt_models_pylon"."pylon_ticket_metric"."reopens" AS "reopens",
                              "dbt_models_pylon"."pylon_ticket_metric"."replies" AS "replies",
                              "dbt_models_pylon"."pylon_ticket_metric"."reply_time_in_minutes_calendar" AS "reply_time_in_minutes_calendar",
                              "dbt_models_pylon"."pylon_ticket_metric"."reply_time_in_minutes_business" AS "reply_time_in_minutes_business",
                              "dbt_models_pylon"."pylon_ticket_metric"."first_resolution_time_in_minutes_calendar" AS "first_resolution_time_in_minutes_calendar",
                              "dbt_models_pylon"."pylon_ticket_metric"."first_resolution_time_in_minutes_business" AS "first_resolution_time_in_minutes_business",
                              "dbt_models_pylon"."pylon_ticket_metric"."full_resolution_time_in_minutes_calendar" AS "full_resolution_time_in_minutes_calendar",
                              "dbt_models_pylon"."pylon_ticket_metric"."full_resolution_time_in_minutes_business" AS "full_resolution_time_in_minutes_business",
                              "dbt_models_pylon"."pylon_ticket_metric"."full_resolution_time_in_hours_calendar" AS "full_resolution_time_in_hours_calendar",
                              "dbt_models_pylon"."pylon_ticket_metric"."full_resolution_time_in_hours_business" AS "full_resolution_time_in_hours_business",
                              "dbt_models_pylon"."pylon_ticket_metric"."assignee_stations" AS "assignee_stations",
                              "dbt_models_pylon"."pylon_ticket_metric"."group_stations" AS "group_stations"
                            FROM
                              "dbt_models_pylon"."pylon_ticket_metric"
                          ) AS "__mb_source"
                          LEFT JOIN (
                            SELECT
                              "dbt_models_pylon"."pylon_ticket"."id" AS "id",
                              "dbt_models_pylon"."pylon_ticket"."subject" AS "subject",
                              "dbt_models_pylon"."pylon_ticket"."organization_name" AS "organization_name",
                              "dbt_models_pylon"."pylon_ticket"."assignee_name" AS "assignee_name",
                              "dbt_models_pylon"."pylon_ticket"."requester_email" AS "requester_email",
                              "dbt_models_pylon"."pylon_ticket"."cc_emails" AS "cc_emails",
                              "dbt_models_pylon"."pylon_ticket"."domain" AS "domain",
                              "dbt_models_pylon"."pylon_ticket"."created_at" AS "created_at",
                              "dbt_models_pylon"."pylon_ticket"."assignee_updated_at" AS "assignee_updated_at",
                              "dbt_models_pylon"."pylon_ticket"."updated_at" AS "updated_at",
                              "dbt_models_pylon"."pylon_ticket"."survey_created_at" AS "survey_created_at",
                              "dbt_models_pylon"."pylon_ticket"."assignee_group_name" AS "assignee_group_name",
                              "dbt_models_pylon"."pylon_ticket"."ticket_group" AS "ticket_group",
                              "dbt_models_pylon"."pylon_ticket"."is_open" AS "is_open",
                              "dbt_models_pylon"."pylon_ticket"."status" AS "status",
                              "dbt_models_pylon"."pylon_ticket"."type" AS "type",
                              "dbt_models_pylon"."pylon_ticket"."priority" AS "priority",
                              "dbt_models_pylon"."pylon_ticket"."ticket_reason" AS "ticket_reason",
                              "dbt_models_pylon"."pylon_ticket"."biz_ops_area" AS "biz_ops_area",
                              "dbt_models_pylon"."pylon_ticket"."product_area" AS "product_area",
                              "dbt_models_pylon"."pylon_ticket"."metabase_version" AS "metabase_version",
                              "dbt_models_pylon"."pylon_ticket"."sent_survey" AS "sent_survey",
                              "dbt_models_pylon"."pylon_ticket"."satisfaction_rating_score" AS "satisfaction_rating_score",
                              "dbt_models_pylon"."pylon_ticket"."satisfaction_rating_value" AS "satisfaction_rating_value",
                              "dbt_models_pylon"."pylon_ticket"."satisfaction_rating_comment" AS "satisfaction_rating_comment",
                              "dbt_models_pylon"."pylon_ticket"."via_channel" AS "via_channel",
                              "dbt_models_pylon"."pylon_ticket"."recipient" AS "recipient",
                              "dbt_models_pylon"."pylon_ticket"."submitter_name" AS "submitter_name",
                              "dbt_models_pylon"."pylon_ticket"."has_incidents" AS "has_incidents",
                              "dbt_models_pylon"."pylon_ticket"."problem_id" AS "problem_id",
                              "dbt_models_pylon"."pylon_ticket"."url" AS "url",
                              "dbt_models_pylon"."pylon_ticket"."tags" AS "tags",
                              "dbt_models_pylon"."pylon_ticket"."description" AS "description",
                              "dbt_models_pylon"."pylon_ticket"."system_source" AS "system_source",
                              "dbt_models_pylon"."pylon_ticket"."organization_id" AS "organization_id",
                              "dbt_models_pylon"."pylon_ticket"."customer_id" AS "customer_id",
                              "dbt_models_pylon"."pylon_ticket"."account_id" AS "account_id",
                              "dbt_models_pylon"."pylon_ticket"."zendesk_ticket_id" AS "zendesk_ticket_id",
                              "dbt_models_pylon"."pylon_ticket"."zendesk_ticket_url" AS "zendesk_ticket_url",
                              "dbt_models_pylon"."pylon_ticket"."group_id" AS "group_id",
                              "dbt_models_pylon"."pylon_ticket"."assignee_id" AS "assignee_id",
                              "dbt_models_pylon"."pylon_ticket"."requester_id" AS "requester_id",
                              "dbt_models_pylon"."pylon_ticket"."submitter_id" AS "submitter_id",
                              "dbt_models_pylon"."pylon_ticket"."satisfaction_rating_id" AS "satisfaction_rating_id"
                            FROM
                              "dbt_models_pylon"."pylon_ticket"
                          ) AS "pylon_ticket__via__ticket_id" ON "__mb_source"."ticket_id" = "pylon_ticket__via__ticket_id"."id"
                        WHERE
                          (
                            "pylon_ticket__via__ticket_id"."assignee_group_name" = ?
                          )
                          AND (
                            NOT (
                              LOWER("pylon_ticket__via__ticket_id"."ticket_reason") LIKE ?
                            )
                            OR (
                              "pylon_ticket__via__ticket_id"."ticket_reason" IS NULL
                            )
                          )
                      ) AS "__mb_source"
                  ) AS "__mb_source"
              ) AS "__mb_source"
            GROUP BY
              "__mb_source"."created_at"
            ORDER BY
              "__mb_source"."created_at" ASC
          ) AS "__mb_source"
        GROUP BY
          (
            CAST(
              DATE_TRUNC(
                'week',
                ("__mb_source"."created_at" + INTERVAL '1 day')
              ) AS timestamp
            ) + INTERVAL '-1 day'
          )
        ORDER BY
          (
            CAST(
              DATE_TRUNC(
                'week',
                ("__mb_source"."created_at" + INTERVAL '1 day')
              ) AS timestamp
            ) + INTERVAL '-1 day'
          ) ASC
      ) AS "__mb_source"
  ) AS "New tickets 6 week rolling average - Created At: Week" ON (
    CAST(
      DATE_TRUNC(
        'week',
        ("__mb_source"."created_at" + INTERVAL '1 day')
      ) AS timestamp
    ) + INTERVAL '-1 day'
  ) = (
    DATE_TRUNC(
      'week',
      (
        "New tickets 6 week rolling average - Created At: Week"."created_at" + INTERVAL '1 day'
      )
    ) + INTERVAL '-1 day'
  )
LIMIT
  1048575
