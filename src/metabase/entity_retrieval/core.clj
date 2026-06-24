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
  search])

(defn ai-context-instructions
  "Map of `[entity-type entity-local-id] -> instructions` for the given entity refs (search-result shape
  `{:model :id}`, where `:model` is the entity_type), read live from `osi_ai_context`.
  Refs with no row, or with blank instructions, are omitted.
  Reading here (rather than storing in the index) means the agent always sees the current text."
  [entity-refs]
  (if-let [wanted (seq (into #{} (map (juxt :model :id)) entity-refs))]
    ;; row-value IN isn't portable across our app DBs, so match the wanted (type, id) pairs with OR-of-ANDs.
    (let [clause (into [:or] (map (fn [[t id]] [:and [:= :entity_type t] [:= :entity_local_id id]])) wanted)]
      (into {} (remove (comp str/blank? val))
            (t2/select-fn->fn (juxt :entity_type :entity_local_id) (comp :instructions :ai_context)
                              :model/OsiAiContext {:where clause})))
    {}))
