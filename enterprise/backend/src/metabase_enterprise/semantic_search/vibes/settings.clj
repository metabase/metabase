(ns metabase-enterprise.semantic-search.vibes.settings
  "Settings for \"order by vibes\": reranking SQLite semantic search candidates with a TypeSafe Jev call. All are
  env-configurable as `MB_VIBES_*`."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting vibes-enabled
  (deferred-tru "Rerank semantic search results by vibes (a TypeSafe Jev relevance judgement). Hackathon.")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :export?    false
  :doc        false)

(defsetting vibes-api-key
  (deferred-tru "TypeSafe API key used for the vibes reranker.")
  :type       :string
  :encryption :when-encryption-key-set
  :sensitive? true
  :visibility :admin
  :export?    false
  :doc        false)

(defsetting vibes-api-url
  (deferred-tru "TypeSafe System One endpoint used for the vibes reranker.")
  :type       :string
  :default    "https://api.typesafe.ai/v1/systemone"
  :encryption :no
  :visibility :admin
  :export?    false
  :doc        false)

(defsetting vibes-model
  (deferred-tru "TypeSafe model used for the vibes reranker.")
  :type       :string
  :default    "jev-latest"
  :encryption :no
  :visibility :admin
  :export?    false
  :doc        false)

(defsetting vibes-rerank-k
  (deferred-tru "How many nearest semantic search candidates are reranked by vibes.")
  :type       :integer
  :default    50
  :encryption :no
  :visibility :admin
  :export?    false
  :doc        false)

(defsetting vibes-timeout-ms
  (deferred-tru "Time budget for one vibes reranking call, in milliseconds. On timeout results keep their vector order.")
  :type       :integer
  :default    2000
  :encryption :no
  :visibility :admin
  :export?    false
  :doc        false)
