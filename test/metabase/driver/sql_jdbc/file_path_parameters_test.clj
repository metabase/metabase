(ns ^:mb/driver-tests metabase.driver.sql-jdbc.file-path-parameters-test
  "Keeps [[metabase.driver/file-path-parameters]] from falling behind the clients it describes.

  A JDBC client enumerates every parameter it accepts through `java.sql.Driver/getPropertyInfo`. This asks each
  driver on the classpath for that list, narrows it to names that could carry a local file path, and fails on one the
  driver has neither declared in [[metabase.driver/file-path-parameters]] nor written off
  in [[metabase.driver/non-file-path-parameters]] -- so upgrading a JDBC dependency that adds a parameter surfaces it
  here instead of quietly letting a database's `:additional-options` read or write somewhere new."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.util :as u])
  (:import
   (java.sql Driver DriverPropertyInfo)
   (java.util Properties)))

(set! *warn-on-reflection* true)

(def ^:private path-ish
  "Deliberately wider than the set of parameters that really carry a path: this decides only what a human is asked to
  look at. The answer for each one is recorded on the driver itself, in one declaration or the other."
  #"(?i)file|path|dir|cert|store|sslkey|ssl_key|keytab|krb|kerberos|cache|config|log|location|ini$|socket$|wallet|pem")

(def ^:private probe-details
  "Enough detail to get a connection spec out of a driver. Never connected with -- only handed to the JDBC client so
  it will enumerate its parameters."
  {:postgres     {:host "h" :port 5432 :dbname "db"}
   :mysql        {:host "h" :port 3306 :dbname "db"}
   :h2           {:db "mem:test"}
   :sqlite       {:db "/tmp/probe.db"}
   :sqlserver    {:host "h" :port 1433 :db "db"}
   :oracle       {:host "h" :port 1521 :sid "orcl"}
   :redshift     {:host "h" :port 5439 :db "db"}
   :vertica      {:host "h" :port 5433 :db "db"}
   :clickhouse   {:host "h" :port 8123 :dbname "db"}
   :databricks   {:host "h" :http-path "/x" :catalog "c" :schema "s" :token "t"}
   :presto-jdbc  {:host "h" :port 8080 :catalog "c" :schema "s" :user "u"}
   :starburst    {:host "h" :port 8080 :catalog "c" :schema "s" :user "u"}
   :sparksql     {:host "h" :port 10000 :db "db"}
   :druid-jdbc   {:host "http://h" :port 8082}
   :athena       {:region "us-east-1" :s3_staging_dir "s3://b/p"}
   :snowflake    {:account "acct" :db "db"}})

(defn- jdbc-driver-and-url
  "The client for `driver` and the URL it would be handed, or nil when the spec does not name one -- some drivers build
  a `DataSource` themselves, and those declare their parameters from documentation instead."
  [driver details]
  (let [{:keys [connection-uri subprotocol subname classname]} (sql-jdbc.conn/connection-details->spec driver details)]
    (when-let [url (or connection-uri (when (and subprotocol subname) (str "jdbc:" subprotocol ":" subname)))]
      (when classname
        [(-> (Class/forName classname)
             (.getDeclaredConstructor (into-array Class []))
             (.newInstance (object-array 0)))
         url]))))

(defn- path-ish-parameters
  "The parameters of `driver`'s client whose names look like they could carry a local file path, or nil when the
  client will not say."
  [driver details]
  (try
    (when-let [[^Driver jdbc-driver ^String url] (jdbc-driver-and-url driver details)]
      (not-empty (sort (for [^DriverPropertyInfo info (.getPropertyInfo jdbc-driver url (Properties.))
                             :when                    (re-find path-ish (.-name info))]
                         (.-name info)))))
    (catch Throwable _ nil)))

(def ^:private always-on-the-classpath
  "Drivers that ship in the core artifact, so are never skipped for being absent."
  #{:h2 :postgres :mysql :sqlite})

(defn- loaded-driver [driver]
  (try
    (driver/the-initialized-driver driver)
    (catch Throwable _ nil)))

(deftest ^:parallel file-path-parameters-are-declared-or-reviewed-test
  (doseq [[driver details] (sort-by key probe-details)]
    (testing driver
      (if-not (loaded-driver driver)
        (is (not (always-on-the-classpath driver))
            (str driver " ships in the core artifact but would not load, so its parameters went unchecked"))
        (when-let [parameters (path-ish-parameters driver details)]
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
                     " connection methods."))))))))

(deftest ^:parallel declarations-are-well-formed-test
  (doseq [driver (keys probe-details)
          :when  (loaded-driver driver)]
    (testing driver
      (is (every? #{:read :write :read-write} (vals (driver/file-path-parameters driver))))
      (is (#{:url :semicolon :comma} (driver/additional-options-style driver))))))
