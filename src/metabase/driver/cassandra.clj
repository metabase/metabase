(ns metabase.driver.cassandra
  "Cassandra Driver."
  (:refer-clojure :exclude [update])
  (:require [clojure.string        :as s]
            [clojure.tools.logging :as log]
            [cheshire.core         :as json]
            [toucan.db             :as db]
            [clojurewerkz.cassaforte.client :as cc]
            [clojurewerkz.cassaforte.cql    :as cql]
            [clojurewerkz.cassaforte.query :refer :all]  
            [metabase.driver :as driver]
            [metabase.driver.cassandra.util :refer [*cassandra-connection* with-cassandra-connection]]
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [table :as table])
            [metabase.sync-database.analyze :as analyze]
            [metabase.util :as u])
  (:import com.datastax.driver.core.SessionManager))

(defn- analyze-table [table new-field-ids]
  ;; We only care about 1) table counts and 2) field values
  {:row_count 1
   :fields    ["field_1" "field_2"]})

; {:host "localhost", :port 3000}
(defn- can-connect? [details]
  (clojure.pprint/pprint details)
  (with-cassandra-connection [^SessionManager conn, details]
    (some? conn)))

; Session session = cluster.connect();
; ResultSet rs = session.execute("select release_version from system.local");

; Session session = cluster.connect();
; Metadata metadata = cluster.getMetadata();
; System.out.println(String.format("Connected to cluster '%s' on %s.", metadata.getClusterName(), metadata.getAllHosts()));

; system.schema_keyspaces
; system.schema_columns

; (defn- meta->tables [conn keyspace]
;   (-> conn
;       .getCluster
;       .getMetadata
;       (.getKeyspace keyspace)
;       .getTables)
;   )

; {:tables #{
;   {:schema nil, :name size_estimates} 
;   {:schema nil, :name schema_triggers} 
;   {:schema nil, :name schema_keyspaces} 
;   {:schema nil, :name compactions_in_progress} 
;   {:schema nil, :name sstable_activity} 
;   {:schema nil, :name IndexInfo} 
;   {:schema nil, :name schema_functions} 
;   {:schema nil, :name schema_columns} 
;   {:schema nil, :name schema_aggregates} 
;   {:schema nil, :name local} 
;   {:schema nil, :name schema_columnfamilies} 
;   {:schema nil, :name schema_usertypes} 
;   {:schema nil, :name peers} 
;   {:schema nil, :name available_ranges} 
;   {:schema nil, :name paxos} 
;   {:schema nil, :name hints} 
;   {:schema nil, :name peer_events} 
;   {:schema nil, :name compaction_history} 
;   {:schema nil, :name range_xfers} 
;   {:schema nil, :name batchlog}}}

(defn- describe-database [database]
  (with-cassandra-connection [^SessionManager conn database]
    (let [tables-meta (-> conn
                          .getCluster
                          .getMetadata
                          (.getKeyspace "system")
                          .getTables)
          tables      (->> tables-meta
                          (map (fn [tm] 
                                   {:schema nil, :name (.getName tm)})))]
          {:tables (set tables)})))

; {:schema nil, 
;  :name size_estimates, 
;  :fields #{{:name range_start,         :base-type text} 
;            {:name mean_partition_size, :base-type bigint} 
;            {:name partitions_count,    :base-type bigint} 
;            {:name table_name,          :base-type text} 
;            {:name range_end,           :base-type text} 
;            {:name keyspace_name,       :base-type text}}}

;---- from metabase
; [[Boolean                        :type/Boolean]
;  [Double                         :type/Float]
;  [Float                          :type/Float]
;  [Integer                        :type/Integer]
;  [Long                           :type/Integer]
;  [java.math.BigDecimal           :type/Decimal]
;  [java.math.BigInteger           :type/BigInteger]
;  [Number                         :type/Number]
;  [String                         :type/Text]
;  [java.sql.Date                  :type/Date]
;  [java.sql.Timestamp             :type/DateTime]
;  [java.util.Date                 :type/DateTime]
;  [org.joda.time.DateTime         :type/DateTime]
;  [java.util.UUID                 :type/Text]       ; shouldn't this be :type/UUID ?
;  [clojure.lang.IPersistentMap    :type/Dictionary]
;  [clojure.lang.IPersistentVector :type/Array]
;  [org.bson.types.ObjectId        :type/MongoBSONID]
;  [org.postgresql.util.PGobject   :type/*]])

; --- from datastax driver
; DataType (CQL)  Java Class
; ASCII           String
; BIGINT          Long
; BLOB            ByteBuffer
; BOOLEAN         Boolean
; COUNTER         Long
; CUSTOM          ByteBuffer
; DECIMAL         BigDecimal
; DOUBLE          Double
; FLOAT           Float
; INET            InetAddress
; INT             Integer
; LIST            List
; MAP             Map
; SET             Set
; TEXT            String
; TIMESTAMP       Date
; UUID            UUID
; VARCHAR         String
; VARINT          BigInteger
; TIMEUUID        UUID

(defn- describe-table [database table]
  (with-cassandra-connection [^SessionManager conn database]
    (let [tbl (-> table :name)
          columns-meta (-> conn
                           .getCluster
                           .getMetadata
                           (.getKeyspace "system")
                           (.getTable tbl)
                           .getColumns)
          fields-meta  (->> columns-meta
                            (map (fn [column]
                                     (let [name      (.. column getName)
                                           jklass    (.. column getType getName asJavaClass)
                                           base-type (driver/class->base-type jklass)] 
                                           {:name      name     
                                            :base-type base-type}))))
          res {:schema nil 
               :name   tbl
               :fields (set fields-meta)}
          _ (println res)]
          res)))
          

(defn- field-values-lazy-seq [{:keys [qualified-name-components table], :as field}]
  (throw (ex-info "MJ - Need field-values-lazy-seq ....." {})))  

(defn- process-query-in-context [qp]
  (throw (ex-info "MJ - process-query-in-context ....." {})))

;; ======== query processor
(defn execute-query
  "Process and run a native MongoDB query."
  [{{:keys [collection query mbql?]} :native, database :database}]
  (throw (ex-info "MJ - execute-query ....." {})))

(defn mbql->native
  "Process and run an MBQL query."
  [{database :database, {{source-table-name :name} :source-table} :query, :as query}]
  {:pre [(map? database)
         (string? source-table-name)]}
  (throw (ex-info "MJ - mbql->native ....." {})))

(defrecord CassandraDriver []
  clojure.lang.Named
  (getName [_] "CassandraDB"))

; (u/strict-extend CassandraDriver
;   driver/IDriver
;   (merge {} driver/IDriverDefaultsMixin))

(u/strict-extend CassandraDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table              (u/drop-first-arg analyze-table)
          :can-connect?               (u/drop-first-arg can-connect?)
          :describe-database          (u/drop-first-arg describe-database)
          :describe-table             (u/drop-first-arg describe-table)
          :details-fields             (constantly [{:name         "host"
                                                    :display-name "Host"
                                                    :default      "localhost"}
                                                   {:name         "port"
                                                    :display-name "Port"
                                                    :type         :integer
                                                    :default      9042}
                                                   {:name         "dbname"
                                                    :display-name "Database name"
                                                    :placeholder  "carrierPigeonDeliveries"
                                                    :required     true}
                                                   {:name         "user"
                                                    :display-name "Database username"
                                                    :placeholder  "What username do you use to login to the database?"}
                                                   {:name         "pass"
                                                    :display-name "Database password"
                                                    :type         :password
                                                    :placeholder  "******"}
                                                   {:name         "authdb"
                                                    :display-name "Authentication Database"
                                                    :placeholder  "Optional database to use when authenticating"}
                                                   {:name         "ssl"
                                                    :display-name "Use a secure connection (SSL)?"
                                                    :type         :boolean
                                                    :default      false}])
          :execute-query              (u/drop-first-arg execute-query)
          :field-values-lazy-seq      (u/drop-first-arg field-values-lazy-seq)
          :mbql->native               (u/drop-first-arg mbql->native)
          :process-query-in-context   (u/drop-first-arg process-query-in-context)
          }))

(driver/register-driver! :cassandra (CassandraDriver.))

; com.datastax.driver.core.exceptions.NoHostAvailableException
; default is 127.0.0.1:9042

(defn -main [& args] 
  (println "Cassandra Driver")
  (let  [conn    (cc/connect ["127.0.0.1"])    ; com.datastax.driver.core.SessionManager
         cluster (.getCluster conn)]           ; com.datastax.driver.core.Cluster
        ; (drop-keyspace    conn "demo" (if-exists))  ; in newest versions
        (try
          (cql/drop-keyspace conn "demo")
          (catch Exception _ nil))
        (cql/create-keyspace  conn "demo"
                              (with {:replication
                                    {"class"              "SimpleStrategy"
                                     "replication_factor" 1 }})
                              (if-not-exists))
        (cql/use-keyspace conn "demo")
        (println conn)
        (println cluster)
        (println "... disconnect")
        (cc/disconnect conn))
  )