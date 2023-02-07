(ns metabase-enterprise.serialization.v2.backfill-ids
  "Finds all models with `:entity_id` columns, scans them for anything without a blank ID, and
  generates consistent entity_id based on their hashes.

  Note that cross-JVM portability is required - but that's specified for [[java.util.Random]],
  so this should produce identical IDs on all platforms and JVM implementations."
  (:require
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan.db :as db]
   [toucan.models :as models]))

(defn backfill-ids-for
  "Updates all rows of a particular model to have `:entity_id` set, based on the [[serdes.hash/identity-hash]]."
  [model]
  (let [missing (db/select model :entity_id nil)
        pk      (models/primary-key model)]
    (when (seq missing)
      (log/info (trs "Backfilling entity_id for {0} rows of {1}" (pr-str (count missing)) (name model)))
      (doseq [entity missing
              :let [hashed (serdes.hash/identity-hash entity)
                    eid    (u/generate-nano-id hashed)]]
        (db/update! model (get entity pk) :entity_id eid)))))

(defn- has-entity-id? [model]
  (:entity_id (models/properties model)))

(defn backfill-ids
  "Updates all rows of all models that are (a) serialized and (b) have `entity_id` columns to have the
  `entity_id` set. If the `entity_id` is NULL, it is set based on the [[serdes.hash/identity-hash]] for that
  row."
  []
  (doseq [model-name (concat serdes.models/exported-models serdes.models/inlined-models)
          :let [model (db/resolve-model (symbol model-name))]
          :when (has-entity-id? model)]
    (backfill-ids-for model)))
