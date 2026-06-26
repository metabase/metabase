(ns metabase.entity-retrieval.core
  "Public API of the `entity-retrieval` module.

  The library entity index is a pgvector index of every library entity's name/description plus its OSI
  `ai_context` synonyms/examples (see [[metabase.osi.models.osi-ai-context]]).
  [[search]] matches a natural-language request against it by vector similarity (enterprise; returns []
  in OSS). [[ai-context-instructions]] reads curator instructions live from the appdb."
  (:require
   [clojure.string :as str]
   [metabase.entity-retrieval.mirror]
   [potemkin :as p]
   [toucan2.core :as t2]))

(comment metabase.entity-retrieval.mirror/keep-me)

(p/import-vars
 [metabase.entity-retrieval.mirror
  entity-retrieval-available?
  force-reconcile!
  library-entity-keys
  search])

(def card-entity-types
  "osi_ai_context `entity_type` strings that all denote a Card: `question`/`metric`/`model` are
  interchangeable labels for the same underlying Card.
  They collapse to one [[entity-class]], so a card's index docs and curated `ai_context` stay matched
  across a relabel between these types."
  #{"question" "metric" "model"})

(defn entity-class
  "Equivalence class `[class entity-local-id]` for an entity ref.
  Card flavors collapse to `::card`; any other entity_type stays itself, so a same-id entity of a
  different type is never conflated."
  [entity-type entity-local-id]
  [(if (card-entity-types entity-type) ::card entity-type) entity-local-id])

(defn ai-context-instructions
  "Map of `[entity-type entity-local-id] -> instructions` for the given entity refs (search-result shape
  `{:model :id}`, where `:model` is the entity_type), read live from `osi_ai_context`.
  Refs with no row, or with blank instructions, are omitted.
  Reading here (rather than storing in the index) means the agent always sees the current text.
  The lookup matches by entity class, so a card's instructions are found even when its current type (the
  ref's) differs from the type it was curated under (a card-flavor relabel)."
  [entity-refs]
  (if-let [wanted (seq (into #{} (map (juxt :model :id)) entity-refs))]
    ;; row-value IN isn't portable across our app DBs, so match the wanted (type, id) pairs with OR-of-ANDs;
    ;; a card ref matches any card-type row for that id.
    (let [clause   (into [:or]
                         (map (fn [[t id]]
                                [:and
                                 (if (card-entity-types t)
                                   [:in :entity_type card-entity-types]
                                   [:= :entity_type t])
                                 [:= :entity_local_id id]]))
                         wanted)
          ;; ascending order so the most-recently-updated row wins per class (last assoc wins) when a relabel
          ;; left two card rows for one id; drop blanks *after* collapsing, so clearing the latest row's
          ;; instructions doesn't resurrect an older row's text.
          by-class (into {} (remove (comp str/blank? val))
                         (t2/select-fn->fn #(entity-class (:entity_type %) (:entity_local_id %))
                                           (comp :instructions :ai_context)
                                           :model/OsiAiContext
                                           {:where clause :order-by [[:updated_at :asc] [:id :asc]]}))]
      ;; key the result back by the caller's original [type id] ref
      (into {} (keep (fn [[t id]] (when-let [instr (by-class (entity-class t id))] [[t id] instr]))) wanted))
    {}))
