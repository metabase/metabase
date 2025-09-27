(ns metabase.lib-be.locked-query-map
  (:require
   [clojure.string :as str]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]
   [pretty.core :as pretty]))

(set! *warn-on-reflection* true)

(declare ->LockedQuery)

(def ^:private allowed-class-name-prefixes
  #{"metabase.driver"
    "metabase.legacy_mbql"
    "metabase.lib"
    "metabase.lib_be"
    "metabase.query_processor"
    "metabase.util.malli.registry"})
;; TODO -- allow tests as well

(defn- assert-allowed-to-touch []
  (when-let [mb-class-name (some (fn [^StackTraceElement frame]
                                   (let [class-name (.getClassName frame)]
                                     (when (and (str/starts-with? class-name "metabase")
                                                (not (str/starts-with? class-name "metabase.lib_be.locked_query_map")))
                                       class-name)))
                                 (.getStackTrace (Thread/currentThread)))]
    (or (some (fn [s]
                (str/starts-with? mb-class-name s))
              allowed-class-name-prefixes)
        (throw (ex-info "No raw MBQL manipulation outside of Lib or the QP!" {:disallowed-class-name mb-class-name})))))

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
  "Create a new map that handles either `snake_case` or `kebab-case` keys, but warns is you use `snake_case`
  keys (in prod) or throws an Exception (in dev and tests). This is here so we can catch code that needs to be updated
  to use MLv2 metadata in 48+."
  ([]
   (locked-query {}))
  ([m]
   (-> (or m {})
       (vary-meta assoc :metabase.driver/metadata-type :metabase.driver/metadata-type.mlv2)
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
