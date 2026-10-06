(ns metabase.glossary.models.glossary
  (:require
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.schema]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Glossary [_model] :glossary)

(doto :model/Glossary
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(methodical/defmethod t2/batched-hydrate [:model/Glossary :creator]
  "Add creator (user) to a glossary entry"
  [_model _k glossary-entries]
  (if-not (seq glossary-entries)
    glossary-entries
    (let [creator-ids (into #{} (map :creator_id) glossary-entries)
          id->creator (glossary.db/users-by-id creator-ids)]
      (for [entry glossary-entries]
        (assoc entry :creator (get id->creator (:creator_id entry)))))))

(def GlossaryEntry
  "Schema for a glossary entry."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:term       ms/NonBlankString]
   [:definition ms/NonBlankString]])

;;; ---------------------- Serialization ----------------------------

(defmethod serdes/load-find-local "Glossary"
  [path]
  ;; Files exported before `entity_id` existed are keyed by term, and a term can itself be 21 nano-id characters,
  ;; so try both lookups rather than discriminating on shape.
  (let [{:keys [id]} (last path)]
    (or (serdes/lookup-by-id :model/Glossary id)
        (glossary.db/glossary-entry-by-term id))))

(defmethod serdes/load-one! "Glossary"
  [ingested maybe-local]
  ;; `term` is unique, so a file whose entity_id matches no local row is matched on its term instead: two instances
  ;; can each create the same term under different entity_ids. That local row is updated in place (same primary
  ;; key) and adopts the file's entity_id and definition; its own entity_id is discarded, nothing references it.
  ;; A term-keyed file (exported before entity_id existed) gets a throwaway entity_id from the loader, so the local
  ;; row keeps its identity in that case.
  (let [local       (or maybe-local (glossary.db/glossary-entry-by-term (:term ingested)))
        term-keyed? (not= (-> ingested serdes/path last :id) (:entity_id ingested))]
    (serdes/default-load-one! (cond-> ingested
                                (and local term-keyed?) (assoc :entity_id (:entity_id local)))
                              local)))

(defmethod serdes/make-spec "Glossary" [_model-name _opts]
  {:copy      [:entity_id :term :definition]
   :transform {:created_at (serdes/date)
               :creator_id (serdes/fk :model/User)}})

(defmethod serdes/storage-path "Glossary" [item _]
  [{:label "glossary"} {:label (:term item) :key (:entity_id item)}])
