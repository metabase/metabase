(ns metabase.analytics.core
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.sdk :as sdk]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.analytics.stats :as stats]
   [potemkin :as p]))

(comment
  analytics.settings/keep-me
  prometheus/keep-me
  sdk/keep-me
  snowplow/keep-me
  stats/keep-me)

(p/import-vars
 [prometheus

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

 [analytics.settings

  analytics-uuid
  prometheus-server-port
  snowplow-available
  snowplow-available!
  snowplow-enabled
  snowplow-url
  snowplow-url!]

 [snowplow

  instance-creation
  track-event!]

 [stats

  environment-type
  legacy-anonymous-usage-stats
  phone-home-stats!])
