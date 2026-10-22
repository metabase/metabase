(ns ^:mb/driver-tests metabase.driver.sql-jdbc.file-path-parameters-test
  "Keeps [[metabase.driver/file-path-parameters]] from falling behind the clients it describes.

  A JDBC client enumerates every parameter it accepts through `java.sql.Driver/getPropertyInfo`. This asks each
  driver under test for that list, narrows it to names that could carry a local file path, and fails on one the
  driver has neither declared in [[metabase.driver/file-path-parameters]] nor written off
  in [[metabase.driver/non-file-path-parameters]] -- so upgrading a JDBC dependency that adds a parameter surfaces it
  here instead of quietly letting a database's `:additional-options` read or write somewhere new."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u])
  (:import
   (java.sql Driver DriverPropertyInfo)
   (java.util Properties)))

(set! *warn-on-reflection* true)

(def ^:private path-ish
  "Deliberately wider than the set of parameters that really carry a path: this decides only what a human is asked to
  look at. The answer for each one is recorded on the driver itself, in one declaration or the other."
  #"(?i)file|path|dir|cert|store|sslkey|ssl_key|keytab|krb|kerberos|cache|config|log|location|ini$|socket$|wallet|pem")

(defn- client-url-and-properties
  "The JDBC client for `driver`, the URL it would be handed for the test database, and the properties that would go
  with it. Never connected with -- only handed to the client so it will enumerate its parameters, which some clients
  refuse to do without their required properties (presto-jdbc wants `user`)."
  [driver]
  (let [details    (tx/dbdef->connection-details driver :db {:database-name "test-data"})
        spec       (sql-jdbc.conn/connection-details->spec driver details)
        {:keys [classname connection-uri subprotocol subname datasource]} spec
        ;; a driver that builds its own `DataSource` (sparksql) keeps the URL and properties on it
        url        (or connection-uri
                       (when (and subprotocol subname) (str "jdbc:" subprotocol ":" subname))
                       (:url datasource))
        properties (if datasource
                     (:properties datasource)
                     (reduce-kv (fn [^Properties props k v]
                                  (doto props (.setProperty (name k) (str v))))
                                (Properties.)
                                (dissoc spec :classname :connection-uri :subprotocol :subname)))]
    (when-not url
      (throw (ex-info "The connection spec names no URL to ask the client about" {:driver driver, :spec spec})))
    [(if classname
       (-> (Class/forName classname)
           (.getDeclaredConstructor (into-array Class []))
           (.newInstance (object-array 0)))
       (java.sql.DriverManager/getDriver url))
     url
     properties]))

(defn- path-ish-parameters
  "The parameters of `driver`'s client whose names look like they could carry a local file path."
  [driver]
  (let [[^Driver client ^String url ^Properties properties] (client-url-and-properties driver)]
    (sort (for [^DriverPropertyInfo info (.getPropertyInfo client url properties)
                :when                    (re-find path-ish (.-name info))]
            (.-name info)))))

(def ^:private clients-that-list-no-parameters
  "Drivers whose client answers `getPropertyInfo` with nothing at all -- H2, Hive (sparksql), and Snowflake -- so there
  is nothing to check their declarations against; those were written from the client's documentation."
  #{:h2 :sparksql :snowflake})

(deftest ^:parallel file-path-parameters-are-declared-or-reviewed-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
    (let [driver     driver/*driver*
          parameters (path-ish-parameters driver)]
      (when-not (clients-that-list-no-parameters driver)
        (is (seq parameters)
            "The client reported no parameter that could name a file; the connection details are probably wrong"))
      (let [declared    (into #{} (map (comp u/lower-case-en key)) (driver/file-path-parameters driver))
            reviewed    (into #{} (map u/lower-case-en) (driver/non-file-path-parameters driver))
            ;; trimmed, since Redshift reports one of its own parameters as `"ssltruststore "`
            normalize   (comp u/lower-case-en str/trim)
            unaccounted (remove #(or (declared (normalize %)) (reviewed (normalize %))) parameters)]
        (is (= [] (vec unaccounted))
            (str "Connection parameters of " driver " that could name a local file and are neither declared in"
                 " `driver/file-path-parameters` nor written off in `driver/non-file-path-parameters`. Check the"
                 " client's documentation: if the client reads or writes a file at the path the parameter names,"
                 " declare it in the first; otherwise record it in the second, next to the driver's other"
                 " connection methods."))))))

(deftest ^:parallel declarations-are-well-formed-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
    (is (every? #{:read :write :read-write} (vals (driver/file-path-parameters driver/*driver*))))
    (let [separators (driver/additional-options-separators driver/*driver*)]
      (is (set? separators))
      (is (seq separators))
      (is (every? #{:ampersand :semicolon :comma} separators)))))
