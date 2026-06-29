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
  "The real entity_type strings the CRUD and tool APIs speak that all denote a Card: `question`/`metric`/
  `model`. (`card` itself is not one of these — it's the generic bucket their `ai_context` rows collapse to
  for storage; see [[normalize-entity-type]].)"
  #{"question" "metric" "model"})

(defn normalize-entity-type
  "Canonical `entity_type` for `osi_ai_context` storage: every card flavor collapses to `card` so one row
  per Card survives a question/metric/model relabel; non-card types pass through unchanged.
  The CRUD/tool APIs still speak question/metric/model — only the stored key is normalized."
  [entity-type]
  (if (card-entity-types entity-type) "card" entity-type))

(defn card-entity-type?
  "True if `entity-type` denotes a Card — a question/metric/model flavor, or the stored `card` bucket."
  [entity-type]
  (= "card" (normalize-entity-type entity-type)))

(defn entity-class
  "Equivalence class `[class entity-local-id]` for an entity ref, so a card's `ai_context` row (stored as
  `card`) and its index docs (keyed by the card's live metric/model type) collapse together.
  Card flavors and `card` map to the `card` class; any other entity_type stays itself."
  [entity-type entity-local-id]
  [(normalize-entity-type entity-type) entity-local-id])

(def max-instructions-len
  "Cap on a curator `instructions` string. Instructions aren't embedded; this bounds the appdb row (enforced
  by the write API) and — since [[ai-context-instructions]] truncates to it — the text injected into the
  retrieve_library_entities agent prompt, so a row that bypassed the API schema (serdes, direct write, or a
  pre-cap row) can't bloat the prompt."
  5000)

(defn ai-context-instructions
  "Map of `[entity-type entity-local-id] -> instructions` for the given entity refs (search-result shape
  `{:model :id}`, where `:model` is the entity_type), read live from `osi_ai_context`.
  Refs with no row, or with blank instructions, are omitted; each instruction is truncated to
  [[max-instructions-len]] so an oversized row can't bloat the agent prompt.
  Reading here (rather than storing in the index) means the agent always sees the current text.
  The lookup matches by entity class, so a card's instructions are found even when its current type (the
  ref's) differs from the type it was curated under (a card-flavor relabel)."
  [entity-refs]
  (if-let [wanted (seq (into #{} (map (juxt :model :id)) entity-refs))]
    ;; row-value IN isn't portable across our app DBs, so match the wanted (type, id) pairs with OR-of-ANDs.
    ;; Normalize each ref's type to the stored key, so a card ref (metric/model) matches its `card` row.
    (let [clause   (into [:or]
                         (map (fn [[t id]]
                                [:and
                                 [:= :entity_type (normalize-entity-type t)]
                                 [:= :entity_local_id id]]))
                         wanted)
          by-class (into {} (remove (comp str/blank? val))
                         (t2/select-fn->fn #(entity-class (:entity_type %) (:entity_local_id %))
                                           (comp :instructions :ai_context)
                                           :model/OsiAiContext {:where clause}))]
      ;; key the result back by the caller's original [type id] ref
      (into {} (keep (fn [[t id]]
                       (when-let [instr (by-class (entity-class t id))]
                         [[t id] (cond-> instr (> (count instr) max-instructions-len) (subs 0 max-instructions-len))])))
            wanted))
    {}))
