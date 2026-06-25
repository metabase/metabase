(ns metabase.curated-search.core
  "Public API of the `curated-search` module.

  The curated search index is a hand-curated library of saved search prompts, each mapped to the entity that
  answers it (see [[metabase.curated-search.models.curated-search-entry]]).
  [[search]] matches a natural-language request against it by vector similarity (enterprise; returns []
  in OSS)."
  (:require
   [metabase.curated-search.mirror]
   [potemkin :as p]))

(comment metabase.curated-search.mirror/keep-me)

(p/import-vars
 [metabase.curated-search.mirror
  search])
