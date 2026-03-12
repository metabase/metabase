(ns metabase.analytics.core
  (:require
   [metabase.analytics.prometheus]
   [metabase.analytics.quartz]
   [metabase.analytics.sdk]
   [metabase.analytics.settings]
   [metabase.analytics.snowplow]
   [metabase.analytics.stats]
   [potemkin :as p]))

(comment
  metabase.analytics.prometheus/keep-me
  metabase.analytics.quartz/keep-me
  metabase.analytics.sdk/keep-me
  metabase.analytics.settings/keep-me
  metabase.analytics.snowplow/keep-me
  metabase.analytics.stats/keep-me)

(p/import-vars
 [metabase.analytics.prometheus

  known-labels
  initial-value
  clear!
  connection-pool-info
  inc!
  observe!
  set!
  setup!
  shutdown!]

 [metabase.analytics.quartz

  add-listeners-to-scheduler!]

 [metabase.analytics.sdk

  embedding-context?
  embedding-mw
  include-sdk-info
  with-client! get-client
  with-version! get-version]

 [metabase.analytics.settings

  analytics-uuid
  anon-tracking-enabled
  anon-tracking-enabled!
  instance-creation]

 [metabase.analytics.snowplow

  track-event!]

 [metabase.analytics.stats

  environment-type
  legacy-anonymous-usage-stats
  phone-home-stats!])
