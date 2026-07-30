(ns metabase.lib-be.locked-query-map
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
    "metabase.driver"
    ;; these are allowed as a kind of "ratchet"; we'd like to remove access but
    ;; our main priority is preventing access from spreading
    "metabase.util.malli.registry" ; which functions?
    "metabase.models.interface$elide_data"
    "metabase_enterprise.impersonation.middleware" ; apply-impersonation-postprocessing
    })

(defn- relevant-frame [^StackTraceElement frame]
  (let [class-name (.getClassName frame)]
    (when (and (str/starts-with? class-name "metabase")
               ;; m.u.performance functions should be treated like clojure.core
               (not (str/starts-with? class-name "metabase.util.performance"))
               (not (str/starts-with? class-name "metabase.lib_be.locked_query_map")))
      class-name)))

(defn- assert-allowed-to-touch []
  (when-let [mb-class-name (some relevant-frame
                                 (.getStackTrace (Thread/currentThread)))]
    (or (some (partial str/starts-with? mb-class-name) allowed-class-name-prefixes)
        (re-find #"test" mb-class-name)
        (throw (ex-info "No raw MBQL manipulation outside of Lib or the QP!"
                        {:disallowed-class-name mb-class-name})))))

(p/def-map-type LockedQuery [m]
  (get [_this k default-value]
    (assert-allowed-to-touch)
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
