(ns metabase.channel.shared
  (:require
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn defaulted-timezone :- :string
  "Returns the timezone ID for the given `card`. Either the report timezone (if applicable) or the JVM timezone."
  [card]
  (or (some->> card :database_id (t2/select-one :model/Database :id) qp.timezone/results-timezone-id)
      (qp.timezone/system-timezone-id)))
