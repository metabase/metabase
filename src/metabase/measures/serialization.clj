(ns metabase.measures.serialization
  "The SerDes of Measures."
  (:require
   [clojure.set :as set]
   [metabase.lib-be.core :as lib-be]
   [metabase.metrics.core :as metrics]
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

(defn- export-api-dimensions
  "Exports the `dimensions` values `xs` of Measures in the API's shape with references in place of ids."
  [store _measures xs _opts]
  (serialization/export-in-bulk store xs metrics/walk-export-dimensions))

(defn- walk-export-api-dimension-mappings
  "The `dimension_mappings` `mappings` of a Measure in the API's shape, whose keys are snake case, with references in
  place of ids."
  [visit mappings]
  (some->> mappings
           (mapv #(set/rename-keys % {:table_id :table-id}))
           (metrics/walk-export-dimension-mappings visit)
           (mapv #(set/rename-keys % {:table-id :table_id}))))

(defn- export-api-dimension-mappings
  "Exports the `dimension_mappings` values `xs` of Measures in the API's shape with references in place of ids."
  [store _measures xs _opts]
  (serialization/export-in-bulk store xs walk-export-api-dimension-mappings))

(def api-dimensions-transform
  "The export of the `dimensions` of Measures as the API gives them. Serialization skips the column, as an import
  derives it from the definition."
  {:export export-api-dimensions})

(def api-dimension-mappings-transform
  "The export of the `dimension_mappings` of Measures as the API gives them. Serialization skips the column, as an
  import derives it from the definition."
  {:export export-api-dimension-mappings})

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
