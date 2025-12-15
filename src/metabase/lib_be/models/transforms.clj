(ns metabase.lib-be.models.transforms
  (:refer-clojure :exclude [some empty?])
  (:require
   [metabase.lib-be.metadata.bootstrap :as lib-be.bootstrap]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [some empty?]]))

(set! *warn-on-reflection* true)

(defn- has-normalized-key? [m k]
  (or (get m k)
      (get m (u/qualified-name k))))

(defn- has-any-of-these-normalized-keys? [m ks]
  (some (partial has-normalized-key? m) ks))

(mu/defn normalize-query :- [:maybe
                             [:multi {:dispatch (comp boolean empty?)}
                              [true  [:= {:description "empty map"} {}]]
                              [false ::lib.schema/query]]]
  "Normalize an MBQL `query` to MBQL 5 and attach a metadata provider."
  ([query]
   (normalize-query nil query))

  ([metadata-providerable query]
   (normalize-query metadata-providerable query nil))

  ([metadata-providerable :- [:maybe ::lib.metadata.protocols/metadata-providerable]
    query                 :- [:maybe :map]
    {:keys [strict?]}     :- [:maybe
                              [:map
                               {:closed true}
                               [:strict? {:optional true, :default false} [:maybe :boolean]]]]]
   (try
     (let [metadata-providerable (or metadata-providerable
                                     (when-let [mp (:lib/metadata query)]
                                       (when (lib/metadata-provider? mp)
                                         mp))
                                     lib.metadata.jvm/application-database-metadata-provider)]
       (cond
         (empty? query)
         {}

         (not (has-normalized-key? query :database))
         (throw (ex-info "Query must include :database" {:query query}))

         (not (has-any-of-these-normalized-keys? query #{:lib/type :type}))
         (throw (ex-info "Query must include :lib/type or :type" {:query query}))

         (and (has-normalized-key? query :lib/type)
              (has-any-of-these-normalized-keys? query #{:type :query :native}))
         (throw (ex-info "MBQL 4 keys like :type, :query, or :native are not allowed in MBQL 5 queries with :lib/type"
                         {:query query}))

         (and (has-normalized-key? query :type)
              (has-normalized-key? query :stages))
         (throw (ex-info "MBQL 5 :stages is not allowed in an MBQL 4 query with :type" {:query query}))

         (lib/cached-metadata-provider-with-cache? (:lib/metadata query))
         (lib/normalize ::lib.schema/query query)

         :else
         (->> query
              (lib-be.bootstrap/resolve-database (when (lib/metadata-provider? metadata-providerable)
                                                   metadata-providerable))
              (lib/query metadata-providerable))))
     ;; return an empty map if we are unable to normalize the query correctly to prevent breaking things downstream,
     ;; unless strict mode is on (when we are saving a query)
     (catch Throwable e
       (when strict?
         (throw e))
       (log/errorf e "Error normalizing query %s" (pr-str query))
       {}))))

(defn- transform-query-in [query]
  (when-not (map? query)
    (throw (ex-info (format "Query must be a map, got ^%s %s" (.getCanonicalName (class query)) (pr-str query))
                    {:query query, :status-code 400})))
  (-> query
      (as-> $query (normalize-query nil $query {:strict? true}))
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
        {}))))

(def transform-query
  "Toucan 2 transform spec for Card `dataset_query` and other columns that store MBQL."
  {:in transform-query-in, :out transform-query-out})
