SELECT
  "__mb_source"."page_view_start" AS "page_view_start",
  SUM(
    "Monthly Form Submission - breakdown by converted pl_1b96ff3f"."count"
  ) AS "Sum of Form Fill",
  AVG(CAST("__mb_source"."Page Views" AS FLOAT)) AS "Sum of Page Views",
  CAST(
    SUM(
      "Monthly Form Submission - breakdown by converted pl_1b96ff3f"."count"
    ) AS DOUBLE PRECISION
  ) / NULLIF(
    CAST(
      AVG(CAST("__mb_source"."Page Views" AS FLOAT)) AS DOUBLE PRECISION
    ),
    0.0
  ) AS "Pricing-to-Form Rate"
FROM
  (
    SELECT
      DATE_TRUNC('month', "__mb_source"."page_view_start") AS "page_view_start",
      COUNT(*) AS "Page Views"
    FROM
      (
        SELECT
          "dbt_models"."page_view_anonymous"."page_view_id" AS "page_view_id",
          "dbt_models"."page_view_anonymous"."page_view_start" AS "page_view_start",
          "dbt_models"."page_view_anonymous"."page_url" AS "page_url",
          "dbt_models"."page_view_anonymous"."page_url_query" AS "page_url_query",
          "dbt_models"."page_view_anonymous"."page_title" AS "page_title",
          "dbt_models"."page_view_anonymous"."site_area" AS "site_area",
          "dbt_models"."page_view_anonymous"."referer_medium" AS "referer_medium",
          "dbt_models"."page_view_anonymous"."referer_source" AS "referer_source",
          "dbt_models"."page_view_anonymous"."utm_medium" AS "utm_medium",
          "dbt_models"."page_view_anonymous"."utm_source" AS "utm_source",
          "dbt_models"."page_view_anonymous"."utm_campaign" AS "utm_campaign",
          "dbt_models"."page_view_anonymous"."utm_term" AS "utm_term",
          "dbt_models"."page_view_anonymous"."utm_content" AS "utm_content",
          "dbt_models"."page_view_anonymous"."time_engaged_in_s" AS "time_engaged_in_s",
          "dbt_models"."page_view_anonymous"."time_engaged_in_s_tier" AS "time_engaged_in_s_tier",
          "dbt_models"."page_view_anonymous"."vertical_percentage_scrolled_tier" AS "vertical_percentage_scrolled_tier",
          "dbt_models"."page_view_anonymous"."browser_name" AS "browser_name",
          "dbt_models"."page_view_anonymous"."os_name" AS "os_name",
          "dbt_models"."page_view_anonymous"."device" AS "device",
          "dbt_models"."page_view_anonymous"."browser_window_width" AS "browser_window_width",
          "dbt_models"."page_view_anonymous"."browser_window_height" AS "browser_window_height",
          "dbt_models"."page_view_anonymous"."browser_language" AS "browser_language",
          "dbt_models"."page_view_anonymous"."os_timezone" AS "os_timezone",
          "dbt_models"."page_view_anonymous"."page_view_end" AS "page_view_end",
          "dbt_models"."page_view_anonymous"."referer_url_host" AS "referer_url_host",
          "dbt_models"."page_view_anonymous"."referer_url" AS "referer_url",
          "dbt_models"."page_view_anonymous"."referer_url_path" AS "referer_url_path",
          "dbt_models"."page_view_anonymous"."referer_url_query" AS "referer_url_query",
          "dbt_models"."page_view_anonymous"."page_url_host" AS "page_url_host",
          "dbt_models"."page_view_anonymous"."page_url_path" AS "page_url_path",
          "dbt_models"."page_view_anonymous"."page_url_fragment" AS "page_url_fragment",
          "dbt_models"."page_view_anonymous"."event_id" AS "event_id",
          "dbt_models"."page_view_anonymous"."app_id" AS "app_id",
          "dbt_models"."page_view_anonymous"."stripe_subscription_id" AS "stripe_subscription_id",
          "dbt_models"."page_view_anonymous"."paid_campaign_keyword_id" AS "paid_campaign_keyword_id"
        FROM
          "dbt_models"."page_view_anonymous"
      ) AS "__mb_source"
    WHERE
      (
        "__mb_source"."page_view_start" >= CAST(? AS timestamp)
      )
      AND (
        "__mb_source"."page_view_start" < CAST(? AS timestamp)
      )
      AND ("__mb_source"."page_title" = ?)
    GROUP BY
      DATE_TRUNC('month', "__mb_source"."page_view_start")
    ORDER BY
      DATE_TRUNC('month', "__mb_source"."page_view_start") ASC
  ) AS "__mb_source"
  LEFT JOIN (
    SELECT
      "__mb_source"."page_view_start" AS "page_view_start",
      "__mb_source"."converted_plan" AS "converted_plan",
      "__mb_source"."count" AS "count",
      "__mb_source"."Δ from Prior Month" AS "Δ from Prior Month"
    FROM
      (
        SELECT
          "__mb_source"."page_view_start" AS "page_view_start",
          "__mb_source"."converted_plan" AS "converted_plan",
          count(distinct "__mb_source"."cookie_id") AS "count",
          (
            CAST(
              count(distinct "__mb_source"."cookie_id") AS DOUBLE PRECISION
            ) / NULLIF(
              CAST(
                LAG(count(distinct "__mb_source"."cookie_id"), 1) OVER (
                  PARTITION BY "__mb_source"."converted_plan"
                  ORDER BY
                    "__mb_source"."page_view_start" ASC,
                    "__mb_source"."converted_plan" ASC
                ) AS DOUBLE PRECISION
              ),
              0.0
            )
          ) - 1 AS "Δ from Prior Month"
        FROM
          (
            SELECT
              DATE_TRUNC('month', "__mb_source"."page_view_start") AS "page_view_start",
              "__mb_source"."converted_plan" AS "converted_plan",
              "__mb_source"."cookie_id" AS "cookie_id"
            FROM
              (
                with all_form_sessions as (
                  select
                    distinct session_id
                  from
                    snowplow.dbt_models.page_view
                  where
                    (
                      page_url in (
                        'www.metabase.com/talk-to-a-person/talk-to-a-person-form-submitted',
                        'www.metabase.com/sales/sales-form-submitted',
                        'www.metabase.com/sales/sales-form-submitted-sales'
                      )
                      or page_title in ('Talk to sales', 'Talk to person')
                    )
                    and page_view_start >= timestamp '2024-01-01 00:00:00.000'
                ),
                form_sub_sessions as (
                  select
                    distinct session_id,
                    page_view_start
                  from
                    snowplow.dbt_models.page_view
                  where
                    (
                      page_url in (
                        'www.metabase.com/talk-to-a-person/talk-to-a-person-form-submitted',
                        'www.metabase.com/sales/sales-form-submitted',
                        'www.metabase.com/sales/sales-form-submitted-sales'
                      )
                    )
                    and page_view_start >= timestamp '2024-01-01 00:00:00.000'
                )
                select
                  a.page_view_index,
                  a.session_index,
                  a.page_view_in_session_index,
                  a.page_view_id,
                  a.session_id,
                  a.cookie_id,
                  a.page_view_start,
                  a.converted_at,
                  c.session_id is not null as has_submitted_form_session,
                  c.page_view_start form_sub_time,
                  a.page_title,
                  a.page_url,
                  a.page_url_path,
                  a.converted_plan
                from
                  snowplow.dbt_models.page_view a
                  inner join all_form_sessions b on a.session_id = b.session_id
                  left join form_sub_sessions c on a.session_id = c.session_id
                where
                  true -- and a.cookie_id ='bc32e797-7361-4463-8314-70875c48d3cc' -- talk to sales as only page_view
                  and a.geo_country not in ('China')
                  and (
                    c.session_id is null
                    or a.page_view_start <= c.page_view_start
                  )
                order by
                  a.cookie_id,
                  a.page_view_index
              ) AS "__mb_source"
            WHERE
              ("__mb_source"."has_submitted_form_session" = TRUE)
              AND (
                "__mb_source"."page_view_start" >= CAST(? AS timestamp)
              )
              AND (
                "__mb_source"."page_view_start" < CAST(? AS timestamp)
              )
          ) AS "__mb_source"
        GROUP BY
          "__mb_source"."page_view_start",
          "__mb_source"."converted_plan"
        ORDER BY
          "__mb_source"."page_view_start" ASC,
          "__mb_source"."converted_plan" ASC
      ) AS "__mb_source"
  ) AS "Monthly Form Submission - breakdown by converted pl_1b96ff3f" ON "__mb_source"."page_view_start" = "Monthly Form Submission - breakdown by converted pl_1b96ff3f"."page_view_start"
GROUP BY
  "__mb_source"."page_view_start"
ORDER BY
  "__mb_source"."page_view_start" ASC
