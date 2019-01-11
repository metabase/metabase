(ns metabase.db.connection-pool.c3p0
  "c3p0 implementation of Metabase connection pools for application DB and JDBC-based drivers."
  (:require [metabase.db.connection-pool.interface :as i]
            [metabase.util :as u])
  (:import com.mchange.v2.c3p0.DataSources
           [java.sql Driver DriverManager]
           [java.util Map Properties]
           javax.sql.DataSource))

(defn- set-property! [^Properties properties, k v]
  (if (some? k)
    (.put properties (name k) v)
    (.remove properties (name k))))

(defn- map->properties ^Properties [m]
  (u/prog1 (Properties.)
           (doseq [[k v] m]
             (.setProperty <> (name k) (str v)))))

(defn- spec->properties ^Properties [spec]
  (map->properties (dissoc spec :classname :subprotocol :subname)))

(defn- proxy-data-source
  "Normal c3p0 DataSource classes do not properly work with our JDBC proxy drivers for whatever reason. Use our own
  instead, which works nicely."
  (^DataSource [{:keys [subname subprotocol], :as spec}]
   {:pre [(string? subname) (string? subprotocol)]}
   (proxy-data-source (format "jdbc:%s:%s" subprotocol subname) (spec->properties spec)))

  (^DataSource [^String jdbc-url, ^Properties properties]
   (proxy-data-source (DriverManager/getDriver jdbc-url) jdbc-url properties))

  (^DataSource [^Driver driver, ^String jdbc-url, ^Properties properties]
   (reify DataSource
     (getConnection [_]
       (.connect driver jdbc-url properties))
     (getConnection [_ username password]
       (doseq [[k v] {"user" username, "password" password}]
         (set-property! properties k v))
       (.connect driver jdbc-url properties)))))

(defn- pooled-data-source ^DataSource
  ([spec]
   (DataSources/pooledDataSource (proxy-data-source spec)))
  ([spec, ^Map pool-properties]
   (DataSources/pooledDataSource (proxy-data-source spec), pool-properties)))

;; See https://www.mchange.com/projects/c3p0/#configuration_properties for a description of valid options and their
;; default values.
(defmethod i/connection-pool-spec :c3p0
  [_ & args]
  {:datasource (apply pooled-data-source args)})


(defmethod i/destroy-connection-pool! :c3p0
  [_, {:keys [^DataSource datasource]}]
  (DataSources/destroy datasource))
