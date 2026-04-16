(ns metabase.metabot.search-models
  "Shared mapping between Metabot entity-type names and the `model` strings stored in the search index
  (e.g., Metabot's \"model\" corresponds to search's \"dataset\").

  Centralised here so every caller — search tooling, semantic-layer analysis, and future AI features —
  uses the same translation instead of redefining it locally.

  Must stay in sync with the search spec: the right-hand values here should all be members of
  `metabase.search.spec/search-models`.
  A test in `metabase.metabot.search-models-test` asserts this."
  (:require
   [metabase.util :as u]))

(def search-model-mappings
  "Metabot entity-type strings that differ from the search-engine `model` string.
  Entities whose Metabot name matches the search name exactly (e.g., `table`, `metric`) are absent
  from this map."
  {"model"    "dataset"
   "question" "card"})

(def ^:private search-model->entity-type-mapping
  (u/for-map [[k v] search-model-mappings] [v k]))

(defn entity-type->search-model
  "Translate a Metabot entity-type (string like \"model\" or keyword like `:model`) to the search-engine
  `model` string stored in the pgvector index.
  Types that match between the two conventions (`table`, `metric`, `dashboard`, …) are returned
  unchanged."
  [entity-type]
  (let [s (if (keyword? entity-type) (name entity-type) (str entity-type))]
    (get search-model-mappings s s)))

(defn search-model->entity-type
  "Inverse of [[entity-type->search-model]]: translate a search-engine `model` string back to the
  Metabot entity-type string."
  [search-model]
  (get search-model->entity-type-mapping search-model search-model))
