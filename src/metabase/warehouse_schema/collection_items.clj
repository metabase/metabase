(ns metabase.warehouse-schema.collection-items
  "How the collection items listing shows the tables."
  (:require
   [metabase.api.common :as api]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn hydrate
  "The `rows` of tables of the collection items listing as the API shows them, with their measures when `opts` list the
  measures."
  [_collection {:keys [models]} rows]
  (let [tables (->> (t2/hydrate (map #(-> (t2/instance :model/Table (assoc % :db_id (:database_id %) :is_published true))
                                          (update :archived api/bit->boolean))
                                     rows)
                                :can_write)
                    (map #(dissoc % :db_id :is_published)))]
    (if (contains? models :measure)
      (t2/hydrate tables :measures)
      tables)))
