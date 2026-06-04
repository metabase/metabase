(ns metabase.semantic-layer-search.core
  "Public API of the `semantic-layer-search` module.

  The semantic layer is a hand-curated library of saved search prompts, each mapped to the entity that
  answers it (see [[metabase.semantic-layer-search.models.semantic-layer-index]]).
  [[search]] matches a natural-language request against it by vector similarity (enterprise; returns []
  in OSS)."
  (:require
   [metabase.semantic-layer-search.mirror]
   [potemkin :as p]))

(comment metabase.semantic-layer-search.mirror/keep-me)

(p/import-vars
 [metabase.semantic-layer-search.mirror
  search])
