(ns metabase-enterprise.product-analytics.storage
  "Storage abstraction for Product Analytics event persistence.

   Defines three multimethods — [[get-site]], [[upsert-session!]], and [[save-event!]] — that
   dispatch on a configurable backend keyword.  The default (and currently only) backend is
   `:product-analytics.storage/app-db`, which stores everything in the Metabase application
   database.  Future phases add Iceberg, stream, and ClickHouse backends by adding new
   `defmethod` implementations."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Setting --------------------------------------------------

(def ^:private available-storage-backends
  #{::app-db ::iceberg})

(def ^:dynamic *storage-backend-override*
  "Dynamic var for overriding the storage backend in tests.
   When bound, [[active-backend]] returns this instead of the setting."
  nil)

(defsetting product-analytics-storage-backend
  (deferred-tru "Storage backend for Product Analytics event data.")
  :visibility :internal
  :export?    false
  :type       :keyword
  :default    ::app-db
  :setter     (fn [new-value]
                (let [kw (keyword new-value)]
                  (when-not (available-storage-backends kw)
                    (throw (ex-info (tru "Invalid product-analytics storage backend.")
                                    {:value     kw
                                     :available available-storage-backends})))
                  (setting/set-value-of-type! :keyword :product-analytics-storage-backend new-value)
                  ;; Trigger PA database reconfiguration when backend changes
                  (when-let [reconfigure! (resolve 'metabase-enterprise.product-analytics.query-engine/reconfigure-pa-database!)]
                    (reconfigure!)))))

(defn active-backend
  "Return the current storage backend keyword.
   Checks [[*storage-backend-override*]] first, then the [[product-analytics-storage-backend]] setting."
  []
  (or *storage-backend-override*
      (product-analytics-storage-backend)))

;;; ------------------------------------------------ Multimethods ------------------------------------------------

(defmulti get-site
  "Retrieve a site map by its UUID string, or `nil` if not found (never throws for missing sites)."
  {:arglists '([backend site-uuid])}
  (fn [backend _site-uuid] backend))

(defmethod get-site :default
  [backend _site-uuid]
  (throw (ex-info (tru "No product-analytics storage backend registered for {0}" (pr-str backend))
                  {:backend backend})))

(defmulti upsert-session!
  "Insert or update a session row.  Returns the primary key of the upserted row."
  {:arglists '([backend session-data])}
  (fn [backend _session-data] backend))

(defmethod upsert-session! :default
  [backend _session-data]
  (throw (ex-info (tru "No product-analytics storage backend registered for {0}" (pr-str backend))
                  {:backend backend})))

(defmulti save-event!
  "Persist an event and its associated property rows.
   Transactional backends MUST use a single transaction.
   Buffered backends may return before the write is durable.
   Returns the saved event instance."
  {:arglists '([backend event-map])}
  (fn [backend _event-map] backend))

(defmethod save-event! :default
  [backend _event-map]
  (throw (ex-info (tru "No product-analytics storage backend registered for {0}" (pr-str backend))
                  {:backend backend})))

(defmulti save-session-data!
  "Persist key/value session attribute rows.
   Returns the number of rows inserted (0 when the input is empty)."
  {:arglists '([backend session-data-rows])}
  (fn [backend _session-data-rows] backend))

(defmethod save-session-data! :default
  [backend _session-data-rows]
  (throw (ex-info (tru "No product-analytics storage backend registered for {0}" (pr-str backend))
                  {:backend backend})))

(defmulti set-distinct-id!
  "Set the `distinct_id` on an existing session.
   Returns true if a row was updated, false otherwise."
  {:arglists '([backend session-id distinct-id])}
  (fn [backend _session-id _distinct-id] backend))

(defmethod set-distinct-id! :default
  [backend _session-id _distinct-id]
  (throw (ex-info (tru "No product-analytics storage backend registered for {0}" (pr-str backend))
                  {:backend backend})))

(defmulti flush!
  "Flush any buffered data to durable storage.
   Synchronous backends (e.g. app-db) are no-ops.
   Buffered backends (e.g. Iceberg) drain their in-memory queues and write to storage."
  {:arglists '([backend])}
  identity)

(defmethod flush! :default
  [_backend]
  nil)

;;; ---------------------------------------------- Public wrappers -----------------------------------------------

(defn store-get-site
  "Look up a site by UUID using the active storage backend."
  [site-uuid]
  (get-site (active-backend) site-uuid))

(defn store-upsert-session!
  "Insert or update a session using the active storage backend."
  [session-data]
  (upsert-session! (active-backend) session-data))

(defn store-save-event!
  "Persist an event (and its properties) using the active storage backend."
  [event-map]
  (save-event! (active-backend) event-map))

(defn store-save-session-data!
  "Persist session attribute rows using the active storage backend."
  [session-data-rows]
  (save-session-data! (active-backend) session-data-rows))

(defn store-set-distinct-id!
  "Set the distinct_id on a session using the active storage backend."
  [session-id distinct-id]
  (set-distinct-id! (active-backend) session-id distinct-id))

(defn store-flush!
  "Flush any buffered data to durable storage using the active storage backend."
  []
  (flush! (active-backend)))

;;; Ensure the default app-db backend is loaded.
(require 'metabase-enterprise.product-analytics.storage.app-db)
