(ns metabase.osi.serialization
  "The SerDes of OsiAiContexts, which a row identifies by the entity it describes rather than by its entity id."
  (:require
   [clojure.string :as str]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private entity-type->toucan
  "The model each `entity_type` but `table` resolves to, every card flavor mapping to Card."
  {"card"     :model/Card
   "model"    :model/Card
   "metric"   :model/Card
   "question" :model/Card
   "measure"  :model/Measure
   "segment"  :model/Segment})

(defn storage-paths
  "The storage path of each of the OsiAiContext `entities`, under `osi_ai_context/` by the entity it describes."
  [entities _ctx]
  (mapv (fn [{:keys [entity_type entity_local_id]}]
          (let [ids (if (sequential? entity_local_id) entity_local_id [entity_local_id])]
            [{:label "osi_ai_context"}
             {:label (u/slugify (str/join "-" ids) {:unicode? true})
              :key   (pr-str [entity_type entity_local_id])}]))
        entities))

(defn walk-local-id
  "The `entity_local_id` of a row or entity resolved by `visit`, by Table reference or entity id, or as it is for an
  unmapped type."
  [visit {:keys [entity_type entity_local_id]}]
  (cond
    (= entity_type "table")           (visit :model/Table entity_local_id)
    (entity-type->toucan entity_type) (visit (entity-type->toucan entity_type) entity_local_id)
    :else                             entity_local_id))

(defn export-local-ids
  "Exports the `entity_local_id` of each of `rows` as the reference of the entity it describes."
  [store rows _ids _opts]
  (serialization/export-in-bulk store rows walk-local-id))

(defn import-local-ids
  "Imports the `entity_local_id` of each of `entities` as the local id of the entity it describes."
  [store entities _refs opts]
  (serialization/import-in-bulk store entities opts walk-local-id))

(defn import-dependencies
  "The Table, Card, Measure or Segment each of the OsiAiContext `entities` describes."
  [entities]
  (mapv (fn [{:keys [entity_type entity_local_id]}]
          (cond
            (= entity_type "table")           #{[:model/Table entity_local_id]}
            (entity-type->toucan entity_type) #{[(entity-type->toucan entity_type) entity_local_id]}))
        entities))
