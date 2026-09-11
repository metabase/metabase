(ns metabase.lib-be.locked-query-map
  "Enforce limited query map access.
  The query map is an internal implementation detail of the query processor and
  should only have its fields accessed by functions in query processor and
  adjacent namespaces."
  (:refer-clojure :exclude [some])
  (:require
   [clojure.string :as str]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some]]
   [potemkin :as p]
   [pretty.core :as pretty]))

(set! *warn-on-reflection* true)

(declare ->LockedQuery)

(def ^:private allowed-class-name-prefixes
  #{;; these are allowed because they're "friends" of the query map
    "metabase.lib"
    "metabase.lib_be"
    "metabase.query_processor"
    "metabase_enterprise.advanced_permissions.query_processor"
    "metabase_enterprise.audit_app.query_processor"
    "metabase_enterprise.sandbox.query_processor"
    "metabase_enterprise.advanced_permissions.models.permissions.block_permissions"
    "metabase_enterprise.impersonation.middleware"
    "metabase_enterprise.database_routing.middleware"
    "metabase.driver"
    "metabase.util.malli" ; mu/defn needs to be able to look into args from anywhere
    ;; these are allowed for now as a kind of ratchet; we'd like to remove access
    ;; but our main priority is preventing access from spreading
    "metabase.query_permissions.impl"
    "metabase.models.interface$elide_data"
    "metabase_enterprise.advanced_permissions.models.permissions.data_permissions"
    "metabase_enterprise.transforms_inspector.query_analysis$analyze_mbql_query"
    "metabase_enterprise.permission_debug.impl$check_table_permissions"
    ;; this is allowed because it's coming from tests to make human-readable messages
    "metabase.util$pprint_to_str"})

(defn- relevant-frame [^StackTraceElement frame]
  (let [class-name (.getClassName frame)]
    (when (and (str/starts-with? class-name "metabase")
               ;; m.u.performance functions should be treated like clojure.core
               (not (str/starts-with? class-name "metabase.util.performance"))
               ;; pretend pattern matching is part of Clojure (it should be!)
               (not (str/starts-with? class-name "metabase.util.match.impl"))
               ;; failed HTTP requests may encode query map
               (not (str/starts-with? class-name "metabase.util.json$encode_to"))
               (not (str/starts-with? class-name "metabase.server.streaming_response$write_error"))
               (not (str/starts-with? class-name "metabase.lib_be.locked_query_map")))
      class-name)))

(defn- assert-allowed-to-touch []
  (when-let [mb-class-name (some relevant-frame
                                 (.getStackTrace (Thread/currentThread)))]
    (or (some (partial str/starts-with? mb-class-name) allowed-class-name-prefixes)
        (str/includes? mb-class-name "test")
        (throw (ex-info "No raw MBQL manipulation outside of Lib or the QP!"
                        {:disallowed-class-name mb-class-name})))))

(p/def-map-type LockedQuery [m]
  (get [_this k default-value]
    (assert-allowed-to-touch)
    ;; we may decide further to wrap maps and vectors that are nested inside the
    ;; query map, but for now it's just the outermost layer.
    (get m k default-value))
  (assoc [this k v]
    (assert-allowed-to-touch)
    (let [m' (assoc m k v)]
      (if (identical? m m')
        this
        (->LockedQuery m'))))
  (dissoc [this k]
    (assert-allowed-to-touch)
    (let [m' (dissoc m k)]
      (if (identical? m m')
        this
        (->LockedQuery m'))))
  (keys [_this]
    (assert-allowed-to-touch)
    (keys m))
  (meta [_this]
    (meta m))
  (entryAt [this k]
    (assert-allowed-to-touch)
    (when (contains? m k)
      (potemkin.PersistentMapProxy$MapEntry. this k)))
  (with-meta [this metta]
    (if (= metta (meta m))
      this
      (->LockedQuery (with-meta m metta))))

  Object
  (toString [this]
    (pr-str this))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `locked-query m)))

(defn locked-query
  "Create a query map which can only be used from namespaces that have access.
  The idea is to make all queries use this map type (in dev at least) and then
  force people to use Lib to poke at queries."
  ([] (locked-query {}))
  ([m]
   (-> (or m {})
       (vary-meta assoc
                  :metabase.driver/metadata-type :metabase.driver/metadata-type.mlv2)
       ->LockedQuery))
  ([k v & more]
   (locked-query (into {k v} (partition-all 2) more))))

(defn locked-query?
  "Return true if `m` is a LockedQuery."
  [m]
  (instance? LockedQuery m))

(mr/def ::locked-query
  [:fn
   {:error/message "An instance of a LockedQuery"}
   #'locked-query?])
