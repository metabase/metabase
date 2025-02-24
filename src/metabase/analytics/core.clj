(ns metabase.analytics.core
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.sdk :as sdk]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.analytics.stats :as stats]
   [potemkin :as p]))

(comment
  prometheus/keep-me
  sdk/keep-me
  snowplow/keep-me
  stats/keep-me)

(p/import-vars
 [prometheus

  known-labels
  initial-value
  connection-pool-info
  inc!
  set!
  setup!
  shutdown!]

 [sdk

  embedding-mw
  include-sdk-info
  with-client! get-client
  with-version! get-version]

 [snowplow

  instance-creation
  track-event!]

 [stats

  environment-type
  legacy-anonymous-usage-stats
  phone-home-stats!])
