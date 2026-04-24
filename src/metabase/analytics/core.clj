(ns metabase.analytics.core
  (:require
   [metabase.analytics.llm-token-usage]
   [metabase.analytics.prometheus]
   [metabase.analytics.quartz]
   [metabase.analytics.sdk]
   [metabase.analytics.settings]
   [metabase.analytics.snowplow]
   [metabase.analytics.stats]
   [metabase.analytics.util]
   [potemkin :as p]))

(comment
  metabase.analytics.llm-token-usage/keep-me
  metabase.analytics.prometheus/keep-me
  metabase.analytics.quartz/keep-me
  metabase.analytics.sdk/keep-me
  metabase.analytics.settings/keep-me
  metabase.analytics.snowplow/keep-me
  metabase.analytics.stats/keep-me
  metabase.analytics.util/keep-me)

(p/import-vars
 [metabase.analytics.llm-token-usage

  track-snowplow!
  track-prometheus!
  track-token-usage!]

 [metabase.analytics.util

  hashed-metabase-token-or-uuid
  uuid->ai-service-hex-uuid]

 [metabase.analytics.prometheus

  known-labels
  initial-value
  connection-pool-info
  setup!
  shutdown!]

 [metabase.analytics.quartz

  add-listeners-to-scheduler!]

 [metabase.analytics.sdk

  embedding-context?
  embedding-mw
  extract-hostname
  extract-path
  include-sdk-info
  pii-request-info
  with-auth-method! get-auth-method
  get-client
  get-route
  get-version]

 [metabase.analytics.settings

  anon-tracking-enabled
  anon-tracking-enabled!
  instance-creation]

 [metabase.analytics.snowplow

  track-event!]

 [metabase.analytics.stats

  environment-type
  legacy-anonymous-usage-stats
  phone-home-stats!])
