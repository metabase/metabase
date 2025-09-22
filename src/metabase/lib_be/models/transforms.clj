(ns metabase.lib-be.models.transforms
  (:require
   [metabase.lib-be.metadata.bootstrap :as lib-be.bootstrap]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]))

(mu/defn normalize-query
  "Normalize an MBQL `query` to MBQL 5 and attach a metadata provider."
  [query :- [:maybe :map]]
  (cond
    (empty? query)
    {}

    (lib/cached-metadata-provider-with-cache? (:lib/metadata query))
    query

    :else
    (->> query
         lib-be.bootstrap/resolve-database
         (lib/query lib.metadata.jvm/application-database-metadata-provider))))

(def transform-query
  "Toucan 2 transform spec for Card `dataset_query` and other columns that store MBQL."
  {:in  (comp mi/json-in lib/prepare-for-serialization normalize-query)
   :out (comp (mi/catch-normalization-exceptions normalize-query) mi/json-out-without-keywordization)})
