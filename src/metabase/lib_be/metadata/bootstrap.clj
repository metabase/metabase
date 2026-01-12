(ns metabase.lib-be.metadata.bootstrap
  (:require
   [clojure.set :as set]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mu/defn- source-card-id-for-mbql5-query :- [:maybe ::lib.schema.id/card]
  [query :- :map]
  (-> query :stages first :source-card))

(mu/defn- source-card-id-for-legacy-query :- [:maybe ::lib.schema.id/card]
  [query :- :map]
  (let [inner-query         (:query query)
        deepest-inner-query (loop [inner-query inner-query]
                              (let [source-query (:source-query inner-query)]
                                (if source-query
                                  (recur source-query)
                                  inner-query)))
        source-table        (:source-table deepest-inner-query)]
    (lib.util/legacy-string-table-id->card-id source-table)))

(defn- bootstrap-metadatas [{metadata-type :lib/type, id-set :id, :as _metadata-spec}]
  (when (and (seq id-set)
             (= metadata-type :metadata/card))
    (t2/select-fn-vec
     (fn [card]
       {:lib/type    :metadata/card
        :id          (:id card)
        :name        (format "Card #%d" (:id card))
        :database-id (:database_id card)})
     [:model/Card :id :database_id :card_schema]
     :id [:in (set id-set)])))

(deftype ^:private BootstrapMetadataProvider []
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    nil)
  (metadatas [_this metadata-spec]
    (bootstrap-metadatas metadata-spec))
  (setting [_this _setting-key]
    nil))

(mu/defn- bootstrap-metadata-provider :- ::lib.schema.metadata/metadata-provider
  "A super-basic metadata provider used only for resolving the database ID associated with a source Card, only for
  queries that use the [[lib.schema.id/saved-questions-virtual-database-id]] e.g.

    {:database -1337, :type :query, :query {:source-table \"card__1\"}}

  Once the *actual* Database ID is resolved, we will create a
  real [[metabase.lib-be.metadata.jvm/application-database-metadata-provider]]. (The App DB provider needs to be
  initialized with an actual Database ID).

  Note that the virtual DB ID is only allowed in legacy MBQL queries, and MBQL 5 queries do not use it."
  []
  (->BootstrapMetadataProvider))

(mu/defn- resolve-database-id-for-source-card :- ::lib.schema.id/database
  [metadata-provider :- [:maybe ::lib.metadata.protocols/metadata-provider]
   source-card-id    :- ::lib.schema.id/card]
  (let [card (or (lib.metadata.protocols/card (or metadata-provider (bootstrap-metadata-provider)) source-card-id)
                 (throw (ex-info (i18n/tru "Card {0} does not exist." source-card-id)
                                 {:card-id source-card-id, :type :invalid-query, :status-code 404})))]
    (:database-id card)))

(mu/defn- source-card-id :- ::lib.schema.id/card
  [query :- :map]
  (case (lib/normalized-query-type query)
    :mbql/query
    (source-card-id-for-mbql5-query query)

    (:query :native)
    (source-card-id-for-legacy-query query)

    #_else
    (throw (ex-info (i18n/tru "Invalid query: cannot use the Saved Questions Virtual Database ID unless query has a source Card")
                    {:query query, :type :invalid-query}))))

(mu/defn- resolved-database-id :- [:maybe ::lib.schema.id/database]
  [metadata-provider :- [:maybe ::lib.metadata.protocols/metadata-provider]
   query             :- :map]
  (let [database-id (:database query)]
    (cond
      (pos-int? database-id)
      database-id

      (= database-id lib.schema.id/saved-questions-virtual-database-id)
      (resolve-database-id-for-source-card metadata-provider (source-card-id query))

      :else
      (throw (ex-info (i18n/tru "Invalid query: missing or invalid Database ID (:database)")
                      {:query query, :type :invalid-query})))))

(mr/def ::empty-map
  [:= {:description "empty map"} {}])

(mr/def ::maybe-unresolved-database-id
  [:or
   ::lib.schema.id/database
   ::lib.schema.id/saved-questions-virtual-database])

(mu/defn resolve-database :- [:maybe
                              [:or
                               ::empty-map
                               [:map
                                [:database ::lib.schema.id/database]]]]
  "If query has `:database` `-1337` (the legacy database ID for queries using a source Card that had an unknown
  database), resolve the correct database ID and assoc it into the query."
  ([query]
   (resolve-database nil query))

  ([metadata-provider :- [:maybe ::lib.metadata.protocols/metadata-provider]
    query             :- [:maybe
                          [:or
                           ::empty-map
                           [:map
                            [:database ::maybe-unresolved-database-id]]
                           [:map
                            ["database" ::maybe-unresolved-database-id]]]]]
   (when (seq query)
     (if (pos-int? (:database query))
       query
       (let [query       (set/rename-keys query {"database" :database})
             database-id (resolved-database-id metadata-provider query)]
         (cond-> query
           database-id (assoc :database database-id)))))))
