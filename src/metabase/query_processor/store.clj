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
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))


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
  [ks :- [:sequential :any]
   v]
  (swap! *store* assoc-in ks v))

(mu/defn miscellaneous-value
  "Fetch a miscellaneous value from the cache. Unlike other Store functions, does not throw if value is not found."
  ([ks]
   (miscellaneous-value ks nil))

  ([ks :- [:sequential :any]
    not-found]
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

(mu/defn metadata-provider :- ::lib.schema.metadata/metadata-provider
  "Get the [[metabase.lib.metadata.protocols/MetadataProvider]] that should be used inside the QP. "
  []
  (or (miscellaneous-value [::metadata-provider])
      (throw (ex-info "QP Store Metadata Provider is not initialized yet; initialize it with `qp.store/with-metadata-provider`."
                      {}))))

(mr/def ::database-id-or-metadata-providerable
  [:or
   ::lib.schema.id/database
   ::lib.schema.metadata/metadata-providerable])

(mu/defn ^:private ->metadata-provider :- ::lib.schema.metadata/metadata-provider
  [database-id-or-metadata-providerable :- ::database-id-or-metadata-providerable]
  (if (integer? database-id-or-metadata-providerable)
    (lib.metadata.jvm/application-database-metadata-provider database-id-or-metadata-providerable)
    database-id-or-metadata-providerable))

(mu/defn ^:private validate-existing-provider
  "Impl for [[with-metadata-provider]]; if there's already a provider, just make sure we're not trying to change the
  Database. We don't need to replace it."
  [database-id-or-metadata-providerable :- ::database-id-or-metadata-providerable]
  (let [old-provider (miscellaneous-value [::metadata-provider])]
    (when-not (identical? old-provider database-id-or-metadata-providerable)
      (let [new-database-id      (if (integer? database-id-or-metadata-providerable)
                                   database-id-or-metadata-providerable
                                   (throw (ex-info "Cannot replace MetadataProvider with another one after it has been bound"
                                                   {:old-provider old-provider, :new-provider database-id-or-metadata-providerable})))
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
  [database-id-or-metadata-providerable :- ::database-id-or-metadata-providerable]
  (let [new-provider (->metadata-provider database-id-or-metadata-providerable)]
    ;; validate the new provider.
    (try
      (lib.metadata/database new-provider)
      (catch Throwable e
        (throw (ex-info (format "Invalid MetadataProvider, failed to return valid Database: %s" (ex-message e))
                        {:metadata-provider new-provider}
                        e))))
    (store-miscellaneous-value! [::metadata-provider] new-provider)))

(mu/defn do-with-metadata-provider
  "Implementation for [[with-metadata-provider]]."
  [database-id-or-metadata-providerable :- ::database-id-or-metadata-providerable
   thunk                                :- [:=> [:cat] :any]]
  (cond
    (or (not (initialized?))
        *TESTS-ONLY-allow-replacing-metadata-provider*)
    (binding [*store*                                        (atom {})
              *TESTS-ONLY-allow-replacing-metadata-provider* false]
      (do-with-metadata-provider database-id-or-metadata-providerable thunk))

    ;; existing provider
    (miscellaneous-value [::metadata-provider])
    (do
      (validate-existing-provider database-id-or-metadata-providerable)
      (thunk))

    :else
    (do
      (set-metadata-provider! database-id-or-metadata-providerable)
      (thunk))))

(defmacro with-metadata-provider
  "Execute `body` with an initialized QP store and metadata provider bound. You can either pass
  a [[metabase.lib.metadata.protocols/MetadataProvider]] directly, or pass a Database ID, for which we will create
  a [[metabase.lib.metadata.jvm/application-database-metadata-provider]].

  If a MetadataProvider is already bound, this is a no-op."
  {:style/indent [:defn]}
  [database-id-or-metadata-providerable & body]
  `(do-with-metadata-provider ~database-id-or-metadata-providerable (^:once fn* [] ~@body)))

;;;;
;;;; DEPRECATED STUFF
;;;;

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
