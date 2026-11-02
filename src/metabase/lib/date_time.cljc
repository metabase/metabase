(ns metabase.lib.date-time
  "Time configuration at the query boundary. This keeps metadata settings out of lower-level date utilities."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(mu/defn config :- ::lib.schema.common/time-config
  "Return the time config for a query or metadata provider."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable]
  {:start-of-week (or (some-> (lib.metadata/setting metadata-providerable :start-of-week) keyword)
                      :sunday)})
