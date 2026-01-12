(ns metabase.lib.metadata.column
  (:require
   [medley.core :as m]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::column-unique-key
  [:re
   #"^column-unique-key-v\d+\$.+$"])

(mr/def ::column-unique-key-version
  nat-int?)

(mu/defn- pack-unique-key :- ::column-unique-key
  [version    :- ::column-unique-key-version
   column-key :- :string]
  (str "column-unique-key-v" version "$" column-key))

(mu/defn- unpack-unique-key :- [:tuple #_version ::column-unique-key-version #_rest :string]
  [unique-key :- ::column-unique-key]
  (let [[_match version-string column-key] (re-find #"^column-unique-key-v(\d+)\$(.+$)" unique-key)]
    [(parse-long version-string) column-key]))

(mu/defn column-unique-key :- ::column-unique-key
  "Create a unique key for returned column metadata. Treat this key as opaque!"
  [col :- ::lib.metadata.calculation/returned-column]
  (pack-unique-key 1 (:lib/desired-column-alias col)))

(mu/defn column-with-unique-key :- [:maybe ::lib.metadata.calculation/returned-column]
  "Get metadata for the returned column with `unique-key`."
  ([query unique-key]
   (column-with-unique-key query -1 unique-key))
  ([query        :- ::lib.schema/query
    stage-number :- :int
    unique-key   :- ::column-unique-key]
   (let [[version column-key] (unpack-unique-key unique-key)]
     (m/find-first
      (case version
        1 #(= (:lib/desired-column-alias %) column-key))
      (lib.metadata.calculation/returned-columns query stage-number)))))
