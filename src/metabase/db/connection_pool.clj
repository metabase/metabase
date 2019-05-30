(ns metabase.db.connection-pool
  "Low-level logic for creating connection pools for a JDBC-based database. Used by both application DB and connected
  data warehouse DBs.

  The aim here is to completely encapsulate the connection pool library we use -- that way we can swap it out if we
  want to at some point without having to touch any other files. (TODO - this is currently true of everything except
  for the options, which are c3p0-specific -- consider abstracting those as well?)"
  (:require [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import com.mchange.v2.c3p0.DataSources
           [java.sql Driver DriverManager]
           [java.util Map Properties]
           javax.sql.DataSource))

;;; ------------------------------------------------ Proxy DataSource ------------------------------------------------

(defn- proxy-data-source
  "Normal c3p0 DataSource classes do not properly work with our JDBC proxy drivers for whatever reason. Use our own
  instead, which works nicely."
  (^DataSource [^String jdbc-url, ^Properties properties]
   (proxy-data-source (DriverManager/getDriver jdbc-url) jdbc-url properties))

  (^DataSource [^Driver driver, ^String jdbc-url, ^Properties properties]
   (reify DataSource
     (getConnection [_]
       (.connect driver jdbc-url properties))
     (getConnection [_ username password]
       (doseq [[k v] {"user" username, "password" password}]
         (if (some? k)
           (.setProperty properties k (name v))
           (.remove properties k)))
       (.connect driver jdbc-url properties)))))


;;; ------------------------------------------- Creating Connection Pools --------------------------------------------

(defn- map->properties
  "Create a `Properties` object from a JDBC connection spec map. Properties objects are maps of String -> String, so all
  keys and values are converted to Strings appropriately."
  ^Properties [m]
  (u/prog1 (Properties.)
    (doseq [[k v] m]
      (.setProperty <> (name k) (if (keyword? v)
                                  (name v)
                                  (str v))))))

(defn- spec->properties ^Properties [spec]
  (map->properties (dissoc spec :classname :subprotocol :subname)))

(def ^:private JDBCSpec
  {:subname     su/NonBlankString
   :subprotocol su/NonBlankString
   s/Any        s/Any})

(s/defn ^:private unpooled-data-source :- DataSource
  [{:keys [subname subprotocol], :as spec} :- JDBCSpec]
  (proxy-data-source (format "jdbc:%s:%s" subprotocol subname) (spec->properties spec)))

(defn- pooled-data-source ^DataSource
  ([spec]
   (DataSources/pooledDataSource (unpooled-data-source spec)))

  ([spec, ^Map pool-properties]
   (DataSources/pooledDataSource (unpooled-data-source spec), pool-properties)))

(def ^{:arglists '([spec] [spec pool-properties-map])} connection-pool-spec
  "Create a new connection pool for a JDBC `spec` and return a spec for it. Optionally pass a map of connection pool
  properties -- see https://www.mchange.com/projects/c3p0/#configuration_properties for a description of valid options
  and their default values."
  (comp (fn [x] {:datasource x}) pooled-data-source))


(defn destroy-connection-pool!
  "Immediately release all resources held by a connection pool."
  [^DataSource pooled-data-source]
  (DataSources/destroy pooled-data-source))
