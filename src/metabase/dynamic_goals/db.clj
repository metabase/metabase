(ns metabase.dynamic-goals.db
  "App-DB reads of the dynamic-goals module."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn entities :- [:sequential :map]
  "The rows of `model` with `ids`."
  [model :- :keyword
   ids   :- [:set ms/PositiveInt]]
  (mdb/select-batched #(t2/select model :id [:in %]) ids))
