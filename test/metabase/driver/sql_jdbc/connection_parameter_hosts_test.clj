(ns ^:mb/driver-tests metabase.driver.sql-jdbc.connection-parameter-hosts-test
  "Keeps [[metabase.driver/host-carrying-parameters]] from falling behind the clients it describes.

  A JDBC client enumerates every parameter it accepts through `java.sql.Driver/getPropertyInfo`. This asks each
  driver on the classpath for that list, narrows it to names that could carry a host, and fails on one the driver has
  neither declared in [[metabase.driver/host-carrying-parameters]] nor written off
  in [[metabase.driver/non-host-parameters]] -- so upgrading a JDBC dependency that adds a parameter
  surfaces it here instead of quietly widening what a database's `:additional-options` can reach."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.util :as u])
  (:import
   (java.sql Driver DriverPropertyInfo)
   (java.util Properties)))

(set! *warn-on-reflection* true)

(def ^:private host-ish
  "Deliberately wider than the set of parameters that really carry a host: this decides only what a human is asked to
  look at. The answer for each one is recorded on the driver itself, in one declaration or the other."
  #"(?i)host|server|address|endpoint|url|uri|proxy|node|target|instance|partner|peer|site|domain|location|redirect")

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

(defn- host-ish-parameters
  "The parameters of `driver`'s client whose names look like they could carry a host, or nil when the client will not
  say. Not every client answers: some build a `DataSource` instead of a URL, some return nothing, and Oracle's tries
  to open a connection to answer -- for those the declaration comes from documentation and this cannot check it."
  [driver details]
  (try
    (when-let [[^Driver jdbc-driver ^String url] (jdbc-driver-and-url driver details)]
      (not-empty (sort (for [^DriverPropertyInfo info (.getPropertyInfo jdbc-driver url (Properties.))
                             :when                    (re-find host-ish (.-name info))]
                         (.-name info)))))
    (catch Throwable _ nil)))

(def ^:private always-on-the-classpath
  "Drivers that ship in the core artifact. A driver missing from a run is normally just one whose module was not on the
  classpath, which is the whole point of checking whatever is present -- but for these that would mean a namespace
  failed to load, and skipping them silently is how this check would come to pass while testing nothing."
  #{:h2 :postgres :mysql :sqlite})

(defn- loaded-driver
  "`driver` with its namespace loaded, so the methods it declares are registered, or nil when it is not on the
  classpath at all."
  [driver]
  (try
    (driver/the-initialized-driver driver)
    (catch Throwable _ nil)))

(deftest ^:parallel host-parameters-are-declared-or-reviewed-test
  (doseq [[driver details] (sort-by key probe-details)]
    (testing driver
      (if-not (loaded-driver driver)
        (is (not (always-on-the-classpath driver))
            (str driver " ships in the core artifact but would not load, so its parameters went unchecked"))
        (if-let [parameters (host-ish-parameters driver details)]
          (let [declared    (into #{} (map u/lower-case-en) (driver/host-carrying-parameters driver))
                reviewed    (into #{} (map u/lower-case-en) (driver/non-host-parameters driver))
                unaccounted (remove #(or (declared (u/lower-case-en %)) (reviewed (u/lower-case-en %))) parameters)]
            (is (= [] (vec unaccounted))
                (str "Connection parameters of " driver " that could name a host and are neither declared in"
                     " `driver/host-carrying-parameters` nor written off in"
                     " `driver/non-host-parameters`. Check the client's documentation: if the parameter"
                     " names somewhere the client connects, declare it in the first; otherwise record it in the"
                     " second, next to the driver's other connection methods.")))
          (testing "does not enumerate its parameters, so its declaration comes from documentation"
            (is (some? (driver/host-carrying-parameters driver)))))))))

(def ^:private opens-no-connection-without-a-host
  "Drivers for which details naming no host really do name nowhere, so reporting no hosts is the honest answer: `:h2`
  and `:sqlite` back onto a file, and `:druid-jdbc` builds `url=:8082/...`, which Avatica rejects as a malformed URI
  rather than filling a host in. Every other client here substitutes `localhost` instead."
  #{:h2 :sqlite :druid-jdbc})

(deftest ^:parallel host-less-details-name-a-host-or-fail-closed-test
  (testing "a client that fills in its own host does not thereby slip past the network policy"
    (doseq [[driver details] (sort-by key probe-details)
            :when            (and (not (opens-no-connection-without-a-host driver))
                                  (loaded-driver driver))]
      (testing driver
        (let [hosts (try
                      (not-empty (vec (driver/connection-hosts driver (dissoc details :host))))
                      (catch Throwable _ ::refused))]
          (is (some? hosts)
              (str driver " reports no hosts at all for details that name none, which reads as \"this database is"
                   " nowhere\" and lets the connection through unchecked -- but its client will substitute a host of"
                   " its own and connect. Report where it would really connect, or throw.")))))))
