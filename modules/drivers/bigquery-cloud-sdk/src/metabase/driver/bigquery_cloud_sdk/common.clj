(ns metabase.driver.bigquery-cloud-sdk.common)

(def ^:dynamic ^String *bigquery-timezone-id*
  "BigQuery stores all of it's timestamps in UTC. That timezone can be changed via a SQL function invocation in a
  native query, but that change in timezone is not conveyed through the BigQuery API. In most situations
  `*bigquery-timezone-id*` will just be UTC. If the user is always changing the timezone via native SQL function
  invocation, they can set their JVM TZ to the correct timezone, mark `use-jvm-timezone` to `true` and that will bind
  this dynamic var to the JVM TZ rather than UTC"
  "UTC")
