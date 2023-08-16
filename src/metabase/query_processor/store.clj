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
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Setting up the Store ----------------------------------------------

(def ^:private uninitialized-store
  (reify
    clojure.lang.IDeref
    (deref [_this]
      (throw (ex-info (tru "Error: Query Processor store is not initialized.") {})))))

(def ^:private ^:dynamic *store*
  "Dynamic var used as the QP store for a given query execution."
  uninitialized-store)

(defn initialized?
  "Is the QP store currently initialized?"
  []
  (not (identical? *store* uninitialized-store)))

(defn do-with-store
  "Execute `f` with an initialized `*store*` if one is not already bound.

  DEPRECATED: use [[with-metadata-provider]] instead."
  [f]
  (if (initialized?)
    (f)
    (binding [*store* (atom {})]
      (f))))

(defmacro ^:deprecated with-store
  "Execute `body` with an initialized QP `*store*`. The `store` middleware takes care of setting up a store as needed
  for each query execution; you should have no need to use this macro yourself outside of that namespace.

  DEPRECATED: use [[with-metadata-provider]] instead."
  {:style/indent 0}
  [& body]
  `(do-with-store (fn [] ~@body)))

(mu/defn store-miscellaneous-value!
  "Store a miscellaneous value in a the cache. Persists for the life of this QP invocation, including for recursive
  calls."
  [ks v]
  (swap! *store* assoc-in (cons :misc ks) v))

(mu/defn miscellaneous-value
  "Fetch a miscellaneous value from the cache. Unlike other Store functions, does not throw if value is not found."
  ([ks]
   (miscellaneous-value ks nil))

  ([ks not-found]
   (get-in @*store* (cons :misc ks) not-found)))

(defn cached-fn
  "Attempt to fetch a miscellaneous value from the cache using key sequence `ks`; if not found, runs `thunk` to get the
  value, stores it in the cache, and returns the value. You can use this to ensure a given function is only ran once
  during the duration of a QP execution.

  See also `cached` macro."
  {:style/indent 1}
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

(mu/defn ^:private database-id :- ::lib.schema.common/positive-int
  []
  (or (miscellaneous-value [::database-id])
      (throw (ex-info "Cannot use metadata-provider before Database ID is set; initialize it with qp.store/with-metadata-provider"
                      {}))))

(mu/defn metadata-provider :- lib.metadata/MetadataProvider
  "Create a new MLv2 metadata provider that uses the QP store."
  ([]
   (metadata-provider (database-id)))

  ([database-id :- ::lib.schema.id/database]
   (if-let [existing-database-id (miscellaneous-value [::database-id])]
     (when-not (= database-id existing-database-id)
       (throw (ex-info (tru "Attempting to fetch second Database. Queries can only reference one Database.")
                       {:existing-id existing-database-id, :attempted-to-fetch database-id})))
     (store-miscellaneous-value! [::database-id] database-id))
   (cached ::metadata-provider
           (lib.metadata.jvm/application-database-metadata-provider database-id))))

(defn do-with-metadata-provider
  "Implementation for [[with-metadata-provider]]."
  [database-id thunk]
  (let [thunk* (^:once fn* []
                (metadata-provider database-id)
                (thunk))]
    (if (initialized?)
      (thunk*)
      (binding [*store* (atom {})]
        (thunk*)))))

(defmacro with-metadata-provider
  "Execute `body` with an initialized QP store and metadata provider for `database-id` bound."
  {:style/indent [:defn]}
  [database-id & body]
  `(do-with-metadata-provider ~database-id (^:once fn* [] ~@body)))

(def ^:private DatabaseInstanceWithRequiredStoreKeys
  [:map
   [:id       ::lib.schema.id/database]
   [:engine   :keyword]
   [:name     ms/NonBlankString]
   [:details  :map]
   [:settings [:maybe :map]]])

(def ^:private TableInstanceWithRequiredStoreKeys
  [:map
   [:schema [:maybe :string]]
   [:name   ms/NonBlankString]])

(def ^:private FieldInstanceWithRequiredStorekeys
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

(mu/defn store-database!
  "Store the Database referenced by this query for the duration of the current query execution. Throws an Exception if
  database is invalid or doesn't have all the required keys."
  [database :- DatabaseInstanceWithRequiredStoreKeys]
  (lib.metadata.protocols/store-database!
   (metadata-provider (u/the-id database))
   (lib.metadata.jvm/instance->metadata database :metadata/database)))

;; TODO ­ I think these can be made private

(mu/defn store-table!
  "Store a `table` in the QP Store for the duration of the current query execution. Throws an Exception if table is
  invalid or doesn't have all required keys."
  [table :- TableInstanceWithRequiredStoreKeys]
  (lib.metadata.protocols/store-metadata!
   (metadata-provider)
   :metadata/table
   (u/the-id table)
   (lib.metadata.jvm/instance->metadata table :metadata/table)))

(mu/defn store-field!
  "Store a `field` in the QP Store for the duration of the current query execution. Throws an Exception if field is
  invalid or doesn't have all required keys."
  [field :- FieldInstanceWithRequiredStorekeys]
  (lib.metadata.protocols/store-metadata!
   (metadata-provider)
   :metadata/column
   (u/the-id field)
   (lib.metadata.jvm/instance->metadata field :metadata/column)))

(def ^:private IDs
  [:maybe
   [:or
    [:set ::lib.schema.common/positive-int]
    [:sequential ::lib.schema.common/positive-int]]])

(mu/defn fetch-and-store-tables! :- :nil
  "Fetch Table(s) from the application database, and store them in the QP Store for the duration of the current query
  execution. If Table(s) have already been fetched, this function will no-op. Throws an Exception if Table(s) do not
  exist."
  [table-ids :- IDs]
  (let [fetched-table-ids (into #{} (map :id) (lib.metadata.protocols/bulk-metadata (metadata-provider) :metadata/table table-ids))]
    (doseq [table-id table-ids]
      (when-not (contains? fetched-table-ids table-id)
        (throw (ex-info (tru "Failed to fetch Table {0}: Table does not exist, or belongs to a different Database." table-id)
                        {:table table-id, :database (database-id)})))))
  nil)

(mu/defn fetch-and-store-fields! :- :nil
  "Fetch Field(s) from the application database, and store them in the QP Store for the duration of the current query
  execution. If Field(s) have already been fetched, this function will no-op. Throws an Exception if Field(s) do not
  exist."
  [field-ids :- IDs]
  (let [fetched-field-ids (into #{} (map :id) (lib.metadata.protocols/bulk-metadata (metadata-provider) :metadata/column field-ids))]
    (doseq [field-id field-ids]
      (when-not (contains? fetched-field-ids field-id)
        (throw (ex-info (tru "Failed to fetch Field {0}: Field does not exist, or belongs to a different Database." field-id)
                        {:field field-id, :database (database-id)})))))
  nil)

(mu/defn database :- DatabaseInstanceWithRequiredStoreKeys
  "Fetch the Database referenced by the current query from the QP Store. Throws an Exception if valid item is not
  returned."
  []
  (-> (or (lib.metadata.protocols/database (metadata-provider))
          (throw (ex-info (tru "Database {0} does not exist." (pr-str (database-id)))
                          {:database-id (database-id)})))
      (dissoc :lib/type)
      (update-keys u/->snake_case_en)
      (vary-meta assoc :type :model/Database)))

(defn- default-table
  "Default implementation of [[table]]."
  [table-id]
  (-> (or (lib.metadata.protocols/table (metadata-provider) table-id)
          (throw (ex-info (tru "Table {0} does not exist." (pr-str table-id))
                          {:table-id table-id})))
      (dissoc :lib/type)
      (update-keys u/->snake_case_en)
      (vary-meta assoc :type :model/Table)))

(def ^:dynamic *table*
  "Implementation of [[table]]. Dynamic so this can be overridden as needed by tests."
  default-table)

(mu/defn table :- TableInstanceWithRequiredStoreKeys
  "Fetch Table with `table-id` from the QP Store. Throws an Exception if valid item is not returned."
  [table-id :- ::lib.schema.id/table]
  (*table* table-id))

(defn- default-field
  "Default implementation of [[field]]."
  [field-id]
  (-> (or (lib.metadata.protocols/field (metadata-provider) field-id)
          (throw (ex-info (tru "Field {0} does not exist." (pr-str field-id))
                          {:field-id field-id})))
      (dissoc :lib/type :lib/external-remap :lib/internal-remap)
      (update-keys u/->snake_case_en)
      (vary-meta assoc :type :model/Field)))

(def ^:dynamic *field*
  "Implementation of [[field]]. Dynamic so this can be overridden as needed by tests."
  default-field)

(mu/defn field :- FieldInstanceWithRequiredStorekeys
  "Fetch Field with `field-id` from the QP Store. Throws an Exception if valid item is not returned."
  [field-id :- ::lib.schema.id/field]
  (*field* field-id))
