(ns metabase.lib-be.models.transforms
  (:require
   [metabase.lib-be.metadata.bootstrap :as lib-be.bootstrap]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn normalize-query :- [:maybe
                             [:multi {:dispatch (comp boolean empty?)}
                              [true  [:= {:description "empty map"} {}]]
                              [false ::lib.schema/query]]]
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
       (lib/normalize ::lib.schema/query query)

       :else
       (->> query
            (lib-be.bootstrap/resolve-database (when (lib/metadata-provider? metadata-providerable)
                                                 metadata-providerable))
            (lib/query metadata-providerable))))))

(defn- transform-query-in [query]
  (when-not (map? query)
    (throw (ex-info (format "Query must be a map, got ^%s %s" (.getCanonicalName (class query)) (pr-str query))
                    {:query query, :status-code 400})))
  (-> query
      normalize-query
      lib/prepare-for-serialization
      mi/json-in))

(defn- transform-query-out [s]
  (when (some? s)
    (try
      (let [query (mi/json-out-without-keywordization s)]
        (assert (map? query)
                (format "Expected deserialized query to be a map, got ^%s %s" (.getCanonicalName (class query)) (pr-str query)))
        (normalize-query query))
      (catch Throwable e
        (log/errorf e "Error deserializing dataset_query from app DB: %s" (ex-message e))
        nil))))

(def transform-query
  "Toucan 2 transform spec for Card `dataset_query` and other columns that store MBQL."
  {:in transform-query-in, :out transform-query-out})
