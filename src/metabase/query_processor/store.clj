(ns metabase.query-processor.store
  "The Query Processor Store caches resolved Tables and Fields for the duration of a query execution. Certain middleware
  handles resolving things like the query's source Table and any Fields that are referenced in a query, and saves the
  referenced objects in the store; other middleware and driver-specific query processor implementations use functions
  in the store to fetch those objects as needed.

  For example, a driver might be converting a Field ID clause (e.g. `[:field-id 10]`) to its native query language. It
  can fetch the underlying Metabase FieldInstance by calling `field`:

    (qp.store/field 10) ;; get Field 10

   Of course, it would be entirely possible to call `(t2/select-one Field :id 10)` every time you needed information about that Field,
  but fetching all Fields in a single pass and storing them for reuse is dramatically more efficient than fetching
  those Fields potentially dozens of times in a single query execution."
  (:require
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private uninitialized-store
  (reify
    clojure.lang.IDeref
    (deref [_this]
      (throw (ex-info "Error: Query Processor store is not initialized. Initialize it with qp.store/with-metadata-provider"
                      {})))))

(def ^:private ^:dynamic *store*
  "Dynamic var used as the QP store for a given query execution."
  uninitialized-store)

(def ^:dynamic *TESTS-ONLY-allow-replacing-metadata-provider*
  "This is only for tests! When enabled, [[with-metadata-provider]] can completely replace the current metadata
  provider (and cache) with a new one. This is reset to false after the QP store is replaced the first time."
  false)

;; TODO -- rename this to something like `store-bound?` because the store is not really initialized until the Database
;; ID is set.
(defn initialized?
  "Is the QP store currently initialized?"
  []
  (not (identical? *store* uninitialized-store)))

(mu/defn store-miscellaneous-value!
  "Store a miscellaneous value in a the cache. Persists for the life of this QP invocation, including for recursive
  calls."
  [ks v]
  (swap! *store* assoc-in ks v))

(mu/defn miscellaneous-value
  "Fetch a miscellaneous value from the cache. Unlike other Store functions, does not throw if value is not found."
  ([ks]
   (miscellaneous-value ks nil))

  ([ks not-found]
   (get-in @*store* ks not-found)))

(defn cached-fn
  "Attempt to fetch a miscellaneous value from the cache using key sequence `ks`; if not found, runs `thunk` to get the
  value, stores it in the cache, and returns the value. You can use this to ensure a given function is only ran once
  during the duration of a QP execution.

  See also `cached` macro."
  [ks thunk]
  (let [cached-value (miscellaneous-value ks ::not-found)]
    (if-not (= cached-value ::not-found)
      cached-value
      (let [v (thunk)]
        (store-miscellaneous-value! ks v)
        v))))

(defmacro cached
  "Cache the value of `body` for key(s) for the duration of this QP execution. (Body is only evaluated the once per QP
  run; subsequent calls return the cached result.)

  Note that each use of `cached` generates its own unique first key for cache keyseq; thus while it is not possible to
  share values between multiple `cached` forms, you do not need to worry about conflicts with other places using this
  macro.

    ;; cache lookups of Card.dataset_query
    (qp.store/cached card-id
      (t2/select-one-fn :dataset_query Card :id card-id))"
  {:style/indent 1}
  [k-or-ks & body]
  ;; for the unique key use a gensym prefixed by the namespace to make for easier store debugging if needed
  (let [ks (into [(list 'quote (gensym (str (name (ns-name *ns*)) "/misc-cache-")))] (u/one-or-many k-or-ks))]
    `(cached-fn ~ks (fn [] ~@body))))

(mu/defn metadata-provider :- lib.metadata/MetadataProvider
  "Get the [[metabase.lib.metadata.protocols/MetadataProvider]] that should be used inside the QP. "
  []
  (or (miscellaneous-value [::metadata-provider])
      (throw (ex-info "QP Store Metadata Provider is not initialized yet; initialize it with `qp.store/with-metadata-provider`."
                      {}))))

(mu/defn ^:private ->metadata-provider :- lib.metadata/MetadataProvider
  [database-id-or-metadata-provider :- [:or
                                        ::lib.schema.id/database
                                        lib.metadata/MetadataProvider]]
  (if (integer? database-id-or-metadata-provider)
    (lib.metadata.jvm/application-database-metadata-provider database-id-or-metadata-provider)
    database-id-or-metadata-provider))

(mu/defn ^:private validate-existing-provider
  "Impl for [[with-metadata-provider]]; if there's already a provider, just make sure we're not trying to change the
  Database. We don't need to replace it."
  [database-id-or-metadata-provider :- [:or
                                        ::lib.schema.id/database
                                        lib.metadata/MetadataProvider]]
  (let [old-provider (miscellaneous-value [::metadata-provider])]
    (when-not (identical? old-provider database-id-or-metadata-provider)
      (let [new-database-id      (if (integer? database-id-or-metadata-provider)
                                   database-id-or-metadata-provider
                                   (throw (ex-info "Cannot replace MetadataProvider with another one after it has been bound"
                                                   {:old-provider old-provider, :new-provider database-id-or-metadata-provider})))
            existing-database-id (u/the-id (lib.metadata/database old-provider))]
        (when-not (= new-database-id existing-database-id)
          (throw (ex-info (tru "Attempting to initialize metadata provider with new Database {0}. Queries can only reference one Database. Already referencing: {1}"
                               (pr-str new-database-id)
                               (pr-str existing-database-id))
                          {:existing-id existing-database-id
                           :new-id      new-database-id
                           :type        qp.error-type/invalid-query})))))))

(mu/defn ^:private set-metadata-provider!
  "Create a new metadata provider and save it."
  [database-id-or-metadata-provider :- [:or
                                        ::lib.schema.id/database
                                        lib.metadata/MetadataProvider]]
  (let [new-provider (->metadata-provider database-id-or-metadata-provider)]
    ;; validate the new provider.
    (try
      (lib.metadata/database new-provider)
      (catch Throwable e
        (throw (ex-info (format "Invalid MetadataProvider, failed to return valid Database: %s" (ex-message e))
                        {:metadata-provider new-provider}
                        e))))
    (store-miscellaneous-value! [::metadata-provider] new-provider)))

(defn do-with-metadata-provider
  "Implementation for [[with-metadata-provider]]."
  [database-id-or-metadata-provider thunk]
  (cond
    (or (not (initialized?))
        *TESTS-ONLY-allow-replacing-metadata-provider*)
    (binding [*store*                                        (atom {})
              *TESTS-ONLY-allow-replacing-metadata-provider* false]
      (do-with-metadata-provider database-id-or-metadata-provider thunk))

    ;; existing provider
    (miscellaneous-value [::metadata-provider])
    (do
      (validate-existing-provider database-id-or-metadata-provider)
      (thunk))

    :else
    (do
      (set-metadata-provider! database-id-or-metadata-provider)
      (thunk))))

(defmacro with-metadata-provider
  "Execute `body` with an initialized QP store and metadata provider bound. You can either pass
  a [[metabase.lib.metadata.protocols/MetadataProvider]] directly, or pass a Database ID, for which we will create
  a [[metabase.lib.metadata.jvm/application-database-metadata-provider]].

  If a MetadataProvider is already bound, this is a no-op."
  {:style/indent [:defn]}
  [database-id-or-metadata-provider & body]
  `(do-with-metadata-provider ~database-id-or-metadata-provider (^:once fn* [] ~@body)))

(defn- missing-bulk-metadata-error [metadata-type id]
  (ex-info (tru "Failed to fetch {0} {1}" (pr-str metadata-type) (pr-str id))
           {:status-code       400
            :type              qp.error-type/invalid-query
            :metadata-provider (metadata-provider)
            :metadata-type     metadata-type
            :id                id}))

(mu/defn bulk-metadata :- [:maybe [:sequential [:map
                                                [:lib/type :keyword]
                                                [:id ::lib.schema.common/positive-int]]]]
  "Fetch multiple objects in bulk. If our metadata provider is a bulk provider (e.g., the application database metadata
  provider), does a single fetch with [[lib.metadata.protocols/bulk-metadata]] if not (i.e., if this is a mock
  provider), fetches them with repeated calls to the appropriate single-object method,
  e.g. [[lib.metadata.protocols/field]].

  The order of the returned objects will match the order of `ids`, and the response is guaranteed to contain every
  object referred to by `ids`. Throws an exception if any objects could not be fetched.

  This can also be called for side-effects to warm the cache."
  [metadata-type :- [:enum :metadata/card :metadata/column :metadata/metric :metadata/segment :metadata/table]
   ids           :- [:maybe
                     [:or
                      [:set ::lib.schema.common/positive-int]
                      [:sequential ::lib.schema.common/positive-int]]]]
  (when-let [ids-set (not-empty (set ids))]
    (let [provider   (metadata-provider)
          objects    (vec (if (satisfies? lib.metadata.protocols/BulkMetadataProvider provider)
                            (filter some? (lib.metadata.protocols/bulk-metadata provider metadata-type ids-set))
                            (let [f (case metadata-type
                                      :metadata/card    lib.metadata.protocols/card
                                      :metadata/column  lib.metadata.protocols/field
                                      :metadata/metric  lib.metadata.protocols/metric
                                      :metadata/segment lib.metadata.protocols/segment
                                      :metadata/table   lib.metadata.protocols/table)]
                              (for [id ids-set]
                                (f provider id)))))
          id->object (m/index-by :id objects)]
      (mapv (fn [id]
              (or (get id->object id)
                  (throw (missing-bulk-metadata-error metadata-type id))))
            ids))))

;;;;
;;;; DEPRECATED STUFF
;;;;

(def ^:private ^{:deprecated "0.48.0"} LegacyDatabaseMetadata
  [:map
   [:id       ::lib.schema.id/database]
   [:engine   :keyword]
   [:name     ms/NonBlankString]
   [:details  :map]
   [:settings [:maybe :map]]])

(def ^:private ^{:deprecated "0.48.0"} LegacyTableMetadata
  [:map
   [:schema [:maybe :string]]
   [:name   ms/NonBlankString]])

(def ^:private ^{:deprecated "0.48.0"} LegacyFieldMetadata
  [:map
   [:name          ms/NonBlankString]
   [:table_id      ::lib.schema.common/positive-int]
   [:display_name  ms/NonBlankString]
   [:description   [:maybe :string]]
   [:database_type ms/NonBlankString]
   [:base_type     ms/FieldType]
   [:semantic_type [:maybe ms/FieldSemanticOrRelationType]]
   [:fingerprint   [:maybe :map]]
   [:parent_id     [:maybe ::lib.schema.common/positive-int]]
   [:nfc_path      [:maybe [:sequential ms/NonBlankString]]]
   ;; there's a tension as we sometimes store fields from the db, and sometimes store computed fields. ideally we
   ;; would make everything just use base_type.
   [:effective_type    {:optional true} [:maybe ms/FieldType]]
   [:coercion_strategy {:optional true} [:maybe ms/CoercionStrategy]]])

(defn ->legacy-metadata
  "For compatibility: convert MLv2-style metadata as returned by [[metabase.lib.metadata.protocols]]
  or [[metabase.lib.metadata]] functions
  (with `kebab-case` keys and `:lib/type`) to legacy QP/application database style metadata (with `snake_case` keys
  and Toucan 2 model `:type` metadata).

  Try to avoid using this, we would like to remove this in the near future."
  {:deprecated "0.48.0"}
  [mlv2-metadata]
  (let [model (case (:lib/type mlv2-metadata)
                :metadata/database :model/Database
                :metadata/table :model/Table
                :metadata/column :model/Field)]
    (-> mlv2-metadata
        (dissoc :lib/type)
        (update-keys u/->snake_case_en)
        (vary-meta assoc :type model)
        (m/update-existing :field_ref lib.convert/->legacy-MBQL))))

#_{:clj-kondo/ignore [:deprecated-var]}
(mu/defn database :- LegacyDatabaseMetadata
  "Fetch the Database referenced by the current query from the QP Store. Throws an Exception if valid item is not
  returned.

  Deprecated in favor of [[metabase.lib.metadata/database]] + [[metadata-provider]]."
  {:deprecated "0.48.0"}
  []
  (->legacy-metadata (lib.metadata/database (metadata-provider))))

#_{:clj-kondo/ignore [:deprecated-var]}
(mu/defn ^:deprecated table :- LegacyTableMetadata
  "Fetch Table with `table-id` from the QP Store. Throws an Exception if valid item is not returned.

  Deprecated in favor of [[metabase.lib.metadata/table]] + [[metadata-provider]]."
  {:deprecated "0.48.0"}
  [table-id :- ::lib.schema.id/table]
  (-> (or (lib.metadata.protocols/table (metadata-provider) table-id)
          (throw (ex-info (tru "Failed to fetch Table {0}: Table does not exist, or belongs to a different Database."
                               (pr-str table-id))
                          {:status-code 404
                           :type        qp.error-type/invalid-query
                           :table-id    table-id})))
      ->legacy-metadata))

#_{:clj-kondo/ignore [:deprecated-var]}
(mu/defn ^:deprecated field :- LegacyFieldMetadata
  "Fetch Field with `field-id` from the QP Store. Throws an Exception if valid item is not returned.

  Deprecated in favor of [[metabase.lib.metadata/field]] + [[metadata-provider]]."
  {:deprecated "0.48.0"}
  [field-id :- ::lib.schema.id/field]
  (-> (or (lib.metadata.protocols/field (metadata-provider) field-id)
          (throw (ex-info (tru "Failed to fetch Field {0}: Field does not exist, or belongs to a different Database."
                               (pr-str field-id))
                          {:status-code 404
                           :type        qp.error-type/invalid-query
                           :field-id    field-id})))
      ->legacy-metadata))
