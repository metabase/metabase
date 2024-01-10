;; This source code is dual-licensed under the Apache License, version
;; 2.0, and the Eclipse Public License, version 1.0.
;;
;; The APL v2.0:
;;
;; ----------------------------------------------------------------------------------
;; Copyright (c) 2011-2018 Michael S. Klishin, Alex Petrov, and the ClojureWerkz Team
;;
;; Licensed under the Apache License, Version 2.0 (the "License");
;; you may not use this file except in compliance with the License.
;; You may obtain a copy of the License at
;;
;;     http://www.apache.org/licenses/LICENSE-2.0
;;
;; Unless required by applicable law or agreed to in writing, software
;; distributed under the License is distributed on an "AS IS" BASIS,
;; WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
;; See the License for the specific language governing permissions and
;; limitations under the License.
;; ----------------------------------------------------------------------------------
;;
;; The EPL v1.0:
;;
;; ----------------------------------------------------------------------------------
;; Copyright (c) 2011-2018 Michael S. Klishin, Alex Petrov, and the ClojureWerkz Team.
;; All rights reserved.
;;
;; This program and the accompanying materials are made available under the terms of
;; the Eclipse Public License Version 1.0,
;; which accompanies this distribution and is available at
;; http://www.eclipse.org/legal/epl-v10.html.
;; ----------------------------------------------------------------------------------

(ns monger.core
  "Thin idiomatic wrapper around MongoDB Java client. monger.core includes
   fundamental functions that perform database/replica set connection, set default write concern, default database, performing commands
   and so on. Most of the functionality is in other monger.* namespaces, in particular monger.collection, monger.query and monger.gridfs

   Related documentation guides:

   * http://clojuremongodb.info/articles/connecting.html
   * http://clojuremongodb.info/articles/commands.html
   * http://clojuremongodb.info/articles/gridfs.html"
  (:refer-clojure :exclude [count])
  (:require [monger.conversion :refer :all]
            [monger.util :refer [into-array-list]])
  (:import [com.mongodb MongoClient MongoClientURI MongoCredential DB WriteConcern DBObject DBCursor #_Bytes
            MongoClientOptions MongoClientOptions$Builder ServerAddress MapReduceOutput MongoException]
           [com.mongodb.gridfs GridFS]
           [java.util Map]))

;;
;; Defaults
;;

(def ^:dynamic ^String *mongodb-host* "127.0.0.1")
(def ^:dynamic ^long   *mongodb-port* 27017)

(def ^:dynamic ^WriteConcern *mongodb-write-concern* WriteConcern/ACKNOWLEDGED)


;;
;; API
;;

(defn ^MongoClient connect
  "Connects to MongoDB. When used without arguments, connects to

   Arguments:
     :host (\"127.0.0.1\" by default)
     :port (27017 by default)"
  {:arglists '([]
               [server-address options]
               [server-address options credentials]
               [[server-address & more] options]
               [{:keys [host port uri] :or { host *mongodb-host* port *mongodb-port*}}])}
  ([]
     (MongoClient.))
  ([server-address ^MongoClientOptions options]
   (def yy [server-address options])
     (if (coll? server-address)
       ;; connect to a replica set
       (let [server-list (into-array-list server-address)]
         (MongoClient. server-list options))
       ;; connect to a single instance
       (MongoClient. ^ServerAddress server-address options)))
  ([server-address ^MongoClientOptions options credentials]
   (def zz [server-address options credentials])
   (let [creds (into-array-list (if (coll? credentials)
                                  credentials
                                  [credentials]))]
     (if (coll? server-address)
       (let [server-list (into-array-list server-address)]
         
         (MongoClient. server-list ^java.util.List creds options))
       (MongoClient. ^ServerAddress server-address ^java.util.List ^com.mongodb.MongoCredential credentials options))))
  ([{:keys [host port uri] :or {host *mongodb-host* port *mongodb-port*}}]
   (def xx [host port uri])
   (if uri
     (MongoClient. (MongoClientURI. uri))
     (MongoClient. ^String host ^Long port))))

(defn ^MongoClient connect-with-credentials
  "Connect with provided credentials and default options"
  ([credentials]
     (connect-with-credentials *mongodb-host* *mongodb-port* credentials))
  ([^String hostname credentials]
     (connect-with-credentials hostname *mongodb-port* credentials))
  ([^String hostname ^long port credentials]
     (MongoClient. (into-array-list [(ServerAddress. hostname port)])
                   (into-array-list (if (coll? credentials)
                                      credentials
                                      [credentials])))))

(defn get-db-names
  "Gets a list of all database names present on the server"
  [^MongoClient conn]
  (set (.listDatabaseNames conn)))


(defn ^DB get-db
  "Get database reference by name."
  [^MongoClient conn ^String name]
  (.getDB conn name))

(defn drop-db
  "Drops a database"
  [^MongoClient conn ^String db]
  (.dropDatabase conn db))

(defn ^GridFS get-gridfs
  "Get GridFS for the given database."
  [^MongoClient conn ^String name]
  (GridFS. (.getDB conn name)))

(defn server-address
  ([^String hostname]
     (ServerAddress. hostname))
  ([^String hostname ^Long port]
     (ServerAddress. hostname port)))

(defn ^MongoClientOptions$Builder mongo-options-builder
  [{:keys [add-cluster-listener add-cluster-listeners add-command-listener add-command-listeners
           add-connection-pool-listener add-connection-pool-listeners add-server-listener add-server-listeners
           add-server-monitor-listener add-server-monitor-listeners always-use-mbeans application-name
           codec-registry compressor-list connect-timeout connections-per-host cursor-finalizer-enabled
           db-decoder-factory db-encoder-factory description heartbeat-connect-timeout heartbeat-frequency
           heartbeat-socket-timeout local-threshold max-connection-idle-time max-connection-life-time
           max-wait-time min-connections-per-host min-heartbeat-frequency read-concern read-preference
           required-replica-set-name retry-writes server-selection-timeout server-selector socket-keep-alive 
           socket-factory socket-timeout ssl-context ssl-enabled ssl-invalid-host-name-allowed
           threads-allowed-to-block-for-connection-multiplier uuid-representation write-concern]}]
  (let [mob (MongoClientOptions$Builder.)]
    (when add-cluster-listener
      (.addClusterListener mob add-cluster-listener))
    (when add-cluster-listeners
      (doseq [cluster-listener add-cluster-listeners]
        (.addClusterListener mob cluster-listener)))
    (when add-command-listener
      (.addCommandListener mob add-command-listener))
    (when add-command-listeners
      (doseq [command-listener add-command-listeners]
        (.addCommandListener mob command-listener)))
    (when add-connection-pool-listener
      (.addConnectionPoolListener mob add-connection-pool-listener))
    (when add-connection-pool-listeners
      (doseq [connection-pool-listener add-connection-pool-listeners]
        (.addConnectionPoolListener mob connection-pool-listener)))
    (when add-server-listener
      (.addServerListener mob add-server-listener))
    (when add-server-listeners
      (doseq [server-listener add-server-listeners]
        (.addServerListener mob server-listener)))
    (when add-server-monitor-listener
      (.addServerMonitorListener mob add-server-monitor-listener))
    (when add-server-monitor-listeners
      (doseq [server-monitor-listener add-server-monitor-listeners]
        (.addServerMonitorListener mob server-monitor-listener)))
    (when always-use-mbeans
      (.alwaysUseMBeans mob always-use-mbeans))
    (when application-name
      (.applicationName mob application-name))
    (when always-use-mbeans
      (.alwaysUseMBeans mob always-use-mbeans))
    (when codec-registry
      (.codecRegistry mob codec-registry))
    (when compressor-list
      (.compressorList mob compressor-list))
    (when connections-per-host
      (.connectionsPerHost mob connections-per-host))
    (when connect-timeout
      (.connectTimeout mob connect-timeout))
    (when cursor-finalizer-enabled
      (.cursorFinalizerEnabled mob cursor-finalizer-enabled))
    (when db-decoder-factory
      (.dbDecoderFactory mob db-decoder-factory))
    (when db-encoder-factory
      (.dbEncoderFactory mob db-encoder-factory))
    (when description
      (.description mob description))
    (when heartbeat-connect-timeout
      (.heartbeatConnectTimeout mob heartbeat-connect-timeout))
    (when heartbeat-frequency
      (.heartbeatFrequency mob heartbeat-frequency))
    (when heartbeat-socket-timeout
      (.heartbeatSocketTimeout mob heartbeat-socket-timeout))
    (when ssl-context
      (.sslContext mob ssl-context))
    (when local-threshold
      (.localThreshold mob local-threshold))
    (when max-connection-idle-time
      (.maxConnectionIdleTime mob max-connection-idle-time))
    (when max-wait-time
      (.maxWaitTime mob max-wait-time))
    (when max-connection-life-time
      (.maxConnectionLifeTime mob max-connection-life-time))
    (when min-connections-per-host
      (.minConnectionsPerHost mob min-connections-per-host))
    (when min-heartbeat-frequency
      (.minHeartbeatFrequency mob min-heartbeat-frequency))
    (when read-concern
      (.readConcern mob read-concern))
    (when read-preference
      (.readPreference mob read-preference))
    (when required-replica-set-name
      (.requiredReplicaSetName mob required-replica-set-name))
    (when retry-writes
      (.retryWrites mob retry-writes))
    (when server-selection-timeout
      (.serverSelectionTimeout mob server-selection-timeout))
    (when server-selector
      (.serverSelector mob server-selector))
    (when socket-keep-alive
      (.socketKeepAlive mob socket-keep-alive))
    (when socket-factory
      (.socketFactory mob socket-factory))
    (when socket-timeout
      (.socketTimeout mob socket-timeout))
    (when ssl-enabled
      (.sslEnabled mob ssl-enabled))
    (when ssl-invalid-host-name-allowed
      (.sslInvalidHostNameAllowed mob ssl-invalid-host-name-allowed))
    (when threads-allowed-to-block-for-connection-multiplier
      (.threadsAllowedToBlockForConnectionMultiplier mob threads-allowed-to-block-for-connection-multiplier))
    (when uuid-representation
      (.uuidRepresentation mob uuid-representation))
    (when write-concern
      (.writeConcern mob write-concern))
    mob))

(defn ^MongoClientOptions mongo-options
  [opts]
  (let [mob (mongo-options-builder opts)]
    (.build mob)))

(defn disconnect
  "Closes default connection to MongoDB"
  [^MongoClient conn]
  (.close conn))

(def ^:const admin-db-name "admin")

(defn ^DB admin-db
  "Returns admin database"
  [^MongoClient conn]
  (get-db conn admin-db-name))


(defn set-default-write-concern!
  [wc]
  "Sets *mongodb-write-concert*"
  (alter-var-root #'*mongodb-write-concern* (constantly wc)))


(defn connect-via-uri
  "Connects to MongoDB using a URI, returns the connection and database as a map with :conn and :db.
   Commonly used for PaaS-based applications, for example, running on Heroku.
   If username and password are provided, performs authentication."
  [^String uri-string]
  (let [uri    (MongoClientURI. uri-string)
        conn   (MongoClient. uri)]
    (if-let [dbName (.getDatabase uri)]
      {:conn conn :db (.getDB conn dbName)}
      (throw (IllegalArgumentException. "No database name specified in URI. Monger requires a database to be explicitly configured.")))))

(defn ^com.mongodb.CommandResult command
  "Runs a database command (please check MongoDB documentation for the complete list of commands).

   Ordering of keys in the command document may matter. Please use sorted maps instead of map literals, for example:
   (array-map :near 50 :test 430 :num 10)

   For commonly used commands (distinct, count, map/reduce, etc), use monger.command and monger.collection functions such as
   /distinct, /count,  /drop, /dropIndexes, and /mapReduce respectively."
  [^DB database ^Map cmd]
  (.command ^DB database ^DBObject (to-db-object cmd)))

(defn ^com.mongodb.CommandResult raw-command
  "Like monger.core/command but accepts DBObjects"
  [^DB database ^DBObject cmd]
  (.command database cmd))

(defprotocol Countable
  (count [this] "Returns size of the object"))

(extend-protocol Countable
  DBCursor
  (count [^DBCursor this]
    (.count this))

  MapReduceOutput
  (count [^MapReduceOutput this]
    ;; MongoDB Java driver could use a lot more specific type than Iterable but
    ;; it always uses DBCollection#find to popular result set. MK.
    (.count ^DBCursor (.results this))))
