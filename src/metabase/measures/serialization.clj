(ns metabase.measures.serialization
  "The SerDes of Measures."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

(defn- import-definitions
  "Imports the definitions `queries` of Measures, normalizing the ones that are not empty."
  [store _entities queries opts]
  (mapv #(cond-> % (seq %) lib-be/normalize-query)
        (serialization/import-mbql store queries opts)))

(def definition-transform
  "The transform of the `definition` of Measures."
  (assoc serialization/mbql-transform :import import-definitions))

(defn import-dependencies
  "The dependencies of the definition of each of the Measure `entities`."
  [entities]
  (mapv (fn [{:keys [definition]}]
          (serialization/import-mbql-dependencies definition))
        entities))

(defn storage-paths
  "The storage path of each of the Measure `entities`, under `measures/` of the Table its definition queries."
  [entities _ctx]
  (mapv (fn [measure]
          (let [table-path (-> measure :definition serialization/serialized-query-source-table)]
            (into (serialization/storage-path-prefixes table-path)
                  [{:label "measures"} {:label (:name measure) :key (:entity_id measure)}])))
        entities))
