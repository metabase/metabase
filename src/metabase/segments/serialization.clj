(ns metabase.segments.serialization
  "The SerDes of Segments."
  (:require
   [metabase.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

(defn import-dependencies
  "The dependencies of the definition of each of the Segment `entities`."
  [entities]
  (mapv (fn [{:keys [definition]}]
          (serialization/import-mbql-dependencies definition))
        entities))

(defn storage-paths
  "The storage path of each of the Segment `entities`, under `segments/` of the Table its definition queries."
  [entities _ctx]
  (mapv (fn [segment]
          (let [table-path (-> segment :definition serialization/serialized-query-source-table)]
            (into (serialization/storage-path-prefixes table-path)
                  [{:label "segments"} {:label (:name segment) :key (:entity_id segment)}])))
        entities))
