(ns metabase.bigquery-oauth.settings
  "Settings for per-user Google OAuth authentication against BigQuery."
  (:require
   [metabase.settings.core :refer [defsetting]]))

(set! *warn-on-reflection* true)

(defsetting google-bigquery-oauth-client-id
  "Google OAuth 2.0 client ID used for per-user BigQuery authentication. Set via MB_GOOGLE_BIGQUERY_OAUTH_CLIENT_ID env var."
  :visibility :internal
  :setter     :none
  :type       :string)

(defsetting google-bigquery-oauth-client-secret
  "Google OAuth 2.0 client secret used for per-user BigQuery authentication. Set via MB_GOOGLE_BIGQUERY_OAUTH_CLIENT_SECRET env var."
  :visibility :internal
  :setter     :none
  :sensitive? true
  :type       :string)
