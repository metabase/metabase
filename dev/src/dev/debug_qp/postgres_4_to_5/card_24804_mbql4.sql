SELECT
  "__mb_source"."page_view_in_session_index" AS "page_view_in_session_index",
  COUNT(*) AS "count"
FROM
  (
    SELECT
      "dbt_models_website"."website_page_view"."id" AS "id",
      "dbt_models_website"."website_page_view"."session_id" AS "session_id",
      "dbt_models_website"."website_page_view"."page_view_at" AS "page_view_at",
      "dbt_models_website"."website_page_view"."cookie_first_seen_at" AS "cookie_first_seen_at",
      "dbt_models_website"."website_page_view"."converted_at" AS "converted_at",
      "dbt_models_website"."website_page_view"."page_url" AS "page_url",
      "dbt_models_website"."website_page_view"."page_title" AS "page_title",
      "dbt_models_website"."website_page_view"."site_area" AS "site_area",
      "dbt_models_website"."website_page_view"."converted_plan" AS "converted_plan",
      "dbt_models_website"."website_page_view"."days_until_conversion" AS "days_until_conversion",
      "dbt_models_website"."website_page_view"."country" AS "country",
      "dbt_models_website"."website_page_view"."geo_region_name" AS "geo_region_name",
      "dbt_models_website"."website_page_view"."referer_source" AS "referer_source",
      "dbt_models_website"."website_page_view"."referer_medium" AS "referer_medium",
      "dbt_models_website"."website_page_view"."is_first_page" AS "is_first_page",
      "dbt_models_website"."website_page_view"."is_last_page" AS "is_last_page",
      "dbt_models_website"."website_page_view"."is_gdpr" AS "is_gdpr",
      "dbt_models_website"."website_page_view"."is_top_5_country" AS "is_top_5_country",
      "dbt_models_website"."website_page_view"."is_visited_before_conversion" AS "is_visited_before_conversion",
      "dbt_models_website"."website_page_view"."is_traffic_qualified" AS "is_traffic_qualified",
      "dbt_models_website"."website_page_view"."is_country_with_cookie_policy_restriction" AS "is_country_with_cookie_policy_restriction",
      "dbt_models_website"."website_page_view"."time_engaged_in_s" AS "time_engaged_in_s",
      "dbt_models_website"."website_page_view"."time_engaged_in_s_tier" AS "time_engaged_in_s_tier",
      "dbt_models_website"."website_page_view"."vertical_percentage_scrolled_tier" AS "vertical_percentage_scrolled_tier",
      "dbt_models_website"."website_page_view"."page_view_in_session_index" AS "page_view_in_session_index",
      "dbt_models_website"."website_page_view"."page_url_host" AS "page_url_host",
      "dbt_models_website"."website_page_view"."page_url_path" AS "page_url_path",
      "dbt_models_website"."website_page_view"."page_url_query" AS "page_url_query",
      "dbt_models_website"."website_page_view"."referer_url" AS "referer_url",
      "dbt_models_website"."website_page_view"."referer_url_host" AS "referer_url_host",
      "dbt_models_website"."website_page_view"."referer_url_query" AS "referer_url_query",
      "dbt_models_website"."website_page_view"."utm_medium" AS "utm_medium",
      "dbt_models_website"."website_page_view"."utm_source" AS "utm_source",
      "dbt_models_website"."website_page_view"."utm_campaign" AS "utm_campaign",
      "dbt_models_website"."website_page_view"."utm_content" AS "utm_content",
      "dbt_models_website"."website_page_view"."utm_term" AS "utm_term",
      "dbt_models_website"."website_page_view"."marketing_medium" AS "marketing_medium",
      "dbt_models_website"."website_page_view"."marketing_source" AS "marketing_source",
      "dbt_models_website"."website_page_view"."marketing_campaign" AS "marketing_campaign",
      "dbt_models_website"."website_page_view"."browser_name" AS "browser_name",
      "dbt_models_website"."website_page_view"."browser_language" AS "browser_language",
      "dbt_models_website"."website_page_view"."os_name" AS "os_name",
      "dbt_models_website"."website_page_view"."device" AS "device",
      "dbt_models_website"."website_page_view"."user_snowplow_domain_id" AS "user_snowplow_domain_id",
      "dbt_models_website"."website_page_view"."user_snowplow_crossdomain_id" AS "user_snowplow_crossdomain_id",
      "dbt_models_website"."website_page_view"."app_id" AS "app_id",
      "dbt_models_website"."website_page_view"."stripe_subscription_id" AS "stripe_subscription_id",
      "dbt_models_website"."website_page_view"."paid_campaign_keyword_id" AS "paid_campaign_keyword_id"
    FROM
      "dbt_models_website"."website_page_view"
  ) AS "__mb_source"
WHERE
  ("__mb_source"."page_url" = ?)
  AND ("__mb_source"."page_view_at" >= ?)
  AND ("__mb_source"."utm_source" = ?)
  AND ("__mb_source"."page_view_at" >= ?)
  AND ("__mb_source"."page_view_at" < ?)
  AND ("__mb_source"."page_view_in_session_index" > 1)
GROUP BY
  "__mb_source"."page_view_in_session_index"
ORDER BY
  "__mb_source"."page_view_in_session_index" ASC
