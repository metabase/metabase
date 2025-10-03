(ns metabase.lib-be.models.transforms
  (:require
   [metabase.lib-be.metadata.bootstrap :as lib-be.bootstrap]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]))

(mu/defn normalize-query
  "Normalize an MBQL `query` to MBQL 5 and attach a metadata provider."
  ([query]
   (normalize-query nil query))

  ([metadata-providerable :- [:maybe ::lib.metadata.protocols/metadata-providerable]
    query                 :- [:maybe :map]]
   (let [metadata-providerable (or metadata-providerable
                                   (when-let [mp (:lib/metadata query)]
                                     (when (lib/metadata-provider? mp)
                                       mp))
                                   lib.metadata.jvm/application-database-metadata-provider)]
     (cond
       (empty? query)
       {}

       (lib/cached-metadata-provider-with-cache? (:lib/metadata query))
       query

       (#{:internal "internal"} (:type query))
       query

       :else
       (->> query
            (lib-be.bootstrap/resolve-database (when (lib/metadata-provider? metadata-providerable)
                                                 metadata-providerable))
            (lib/query metadata-providerable))))))

(def transform-query
  "Toucan 2 transform spec for Card `dataset_query` and other columns that store MBQL."
  {:in  (comp mi/json-in lib/prepare-for-serialization normalize-query)
   :out (comp (mi/catch-normalization-exceptions normalize-query) mi/json-out-without-keywordization)})
