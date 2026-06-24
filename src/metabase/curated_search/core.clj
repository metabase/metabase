(ns metabase.curated-search.core
  "Public API of the `curated-search` module.

  The library entity index is a pgvector index of every library entity's name/description plus its OSI
  `ai_context` synonyms/examples (see [[metabase.curated-search.models.osi-ai-context]]).
  [[search]] matches a natural-language request against it by vector similarity (enterprise; returns []
  in OSS). [[ai-context-instructions]] reads curator instructions live from the appdb."
  (:require
   [clojure.string :as str]
   [metabase.curated-search.mirror]
   [metabase.util :as u]
   [potemkin :as p]
   [toucan2.core :as t2]))

(comment metabase.curated-search.mirror/keep-me)

(p/import-vars
 [metabase.curated-search.mirror
  search])

(defn ai-context-instructions
  "Map of `[entity-model entity-id] -> instructions` for the given entity refs, read live from
  `osi_ai_context`.
  Refs with no row, or with blank instructions, are omitted.
  Reading here (rather than storing in the index) means the agent always sees the current text."
  [entity-refs]
  (let [wanted  (into #{} (map (juxt :model :id)) entity-refs)
        ref-key (fn [{e :entity}] [(:model e) (:id e)])]
    (u/index-by ref-key (comp :instructions :ai_context)
                (filter (fn [{ac :ai_context :as row}]
                          (and (wanted (ref-key row))
                               (not (str/blank? (:instructions ac)))))
                        (t2/select [:model/OsiAiContext :entity :ai_context])))))
