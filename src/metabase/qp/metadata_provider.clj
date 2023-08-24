(ns metabase.qp.metadata-provider
  (:require
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.setting :as setting]
   [metabase.query-processor.store :as qp.store]))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic *metadata-provider*
  nil)

(def ^:private ^:dynamic *cache* nil)

(defn- ->metadata-provider [x]
  (cond
    (lib.metadata.protocols/metadata-provider? x)
    x

    (pos-int? x)
    (lib.metadata.jvm/application-database-metadata-provider x)

    :else
    (throw (ex-info "Invalid metadata provider" {:metadata-provider x}))))

(defn- resolve-driver [{driver :engine, :as _database}]
  (try
    (driver/the-initialized-driver driver)
    (catch Throwable e
      (throw (ex-info "Unable to resolve driver for query" {:driver driver} e)))))

(defn do-ensure-metadata-provider [x thunk]
  (if *metadata-provider*
    (thunk)
    (let [provider (->metadata-provider x)
          database (delay (lib.metadata/database provider))]
      (binding [*metadata-provider*             provider
                *cache*                         (or *cache* (atom {}))
                setting/*database-local-values* (or setting/*database-local-values* (:settings @database))
                driver/*driver*                 (or driver/*driver* (resolve-driver @database))]
        (qp.store/with-metadata-provider provider
          (thunk))))))

(defmacro ensure-metadata-provider [x & body]
  `(do-ensure-metadata-provider ~x (^:once fn* [] ~@body)))

(defn metadata-provider []
  (or *metadata-provider*
      (throw (ex-info "Metadata provider is not initialized: outside of metabase.qp.metadata-provider/ensure-metadata-provider context"
                      {}))))
