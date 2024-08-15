(ns metabase.driver.mongo
  "MongoDB Driver."
  (:require
   [cheshire.core :as json]
   [cheshire.generate :as json.generate]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.mongo.connection :as mongo.connection]
   [metabase.driver.mongo.database :as mongo.db]
   [metabase.driver.mongo.execute :as mongo.execute]
   [metabase.driver.mongo.json]
   [metabase.driver.mongo.parameters :as mongo.params]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.driver.mongo.util :as mongo.util]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [taoensso.nippy :as nippy])
  (:import
   (com.mongodb.client MongoClient MongoDatabase)
   (org.bson.types ObjectId)))

(set! *warn-on-reflection* true)

(comment metabase.driver.mongo.json/keep-me)

;; JSON Encoding (etc.)

;; Encode BSON undefined like `nil`
(json.generate/add-encoder org.bson.BsonUndefined json.generate/encode-nil)

(nippy/extend-freeze ObjectId :mongodb/ObjectId
                     [^ObjectId oid data-output]
                     (.writeUTF data-output (.toHexString oid)))

(nippy/extend-thaw :mongodb/ObjectId
  [data-input]
  (ObjectId. (.readUTF data-input)))

(driver/register! :mongo)

(defmethod driver/can-connect? :mongo
  [_ db-details]
  (mongo.connection/with-mongo-client [^MongoClient c db-details]
    (let [db-names (mongo.util/list-database-names c)
          db-name (mongo.db/db-name db-details)
          db (mongo.util/database c db-name)
          db-stats (mongo.util/run-command db {:dbStats 1} :keywordize true)]
      (and
       ;; 1. check db.dbStats command completes successfully
       (= (float (:ok db-stats))
          1.0)
       ;; 2. check the database is actually on the server
       ;; (this is required because (1) is true even if the database doesn't exist)
       (boolean (some #(= % db-name) db-names))))))

(defmethod driver/humanize-connection-error-message
  :mongo
  [_ message]
  (condp re-matches message
    #"^Timed out after \d+ ms while waiting for a server .*$"
    :cannot-connect-check-host-and-port

    #"^host and port should be specified in host:port format$"
    :invalid-hostname

    #"^Password can not be null when the authentication mechanism is unspecified$"
    :password-required

    #"^org.apache.sshd.common.SshException: No more authentication methods available$"
    :ssh-tunnel-auth-fail

    #"^java.net.ConnectException: Connection refused$"
    :ssh-tunnel-connection-fail

    #".*javax.net.ssl.SSLHandshakeException: PKIX path building failed.*"
    :certificate-not-trusted

    #".*MongoSocketReadException: Prematurely reached end of stream.*"
    :requires-ssl

    #".* KeyFactory not available"
    :unsupported-ssl-key-type

    #"java.security.InvalidKeyException: invalid key format"
    :invalid-key-format

    message))


;;; ### Syncing

(declare update-field-attrs)

(defmethod driver/sync-in-context :mongo
  [_ database do-sync-fn]
  (mongo.connection/with-mongo-client [_ database]
    (do-sync-fn)))

(defmethod driver/dbms-version :mongo
  [_driver database]
  (mongo.connection/with-mongo-database [db database]
    (let [build-info (mongo.util/run-command db {:buildInfo 1})
          version-array (get build-info "versionArray")
          sanitized-version-array (into [] (take-while nat-int?) version-array)]
      (when (not= (take 3 version-array) (take 3 sanitized-version-array))
        (log/warnf "sanitizing versionArray %s results in %s, losing information"
                   version-array sanitized-version-array))
      {:version (get build-info "version")
       :semantic-version sanitized-version-array})))

(defmethod driver/describe-database :mongo
  [_ database]
  (mongo.connection/with-mongo-database [^MongoDatabase db database]
    {:tables (set (for [collection (mongo.util/list-collection-names db)
                        :when (not= collection "system.indexes")]
                    {:schema nil, :name collection}))}))

(defmethod driver/describe-table-indexes :mongo
  [_ database table]
  (mongo.connection/with-mongo-database [^MongoDatabase db database]
    (let [collection (mongo.util/collection db (:name table))]
      (->> (mongo.util/list-indexes collection)
           (map (fn [index]
                ;; for text indexes, column names are specified in the weights
                  (if (contains? index "textIndexVersion")
                    (get index "weights")
                    (get index "key"))))
           (map (comp name first keys))
           ;; mongo support multi key index, aka nested fields index, so we need to split the keys
           ;; and represent it as a list of field names
           (map #(if (str/includes? % ".")
                   {:type  :nested-column-index
                    :value (str/split % #"\.")}
                   {:type  :normal-column-index
                    :value %}))
           set))))

(defn- sample-stages
  "Query stages which get a sample of the data in the collection, of size `n`. Half of the sample is from the first
  inserted documents and the other half from the last inserted documents."
  [collection-name n]
  (let [start-n (quot n 2)
        end-n   (- n start-n)]
    [{"$sort" {"_id" 1}}
     {"$limit" start-n}
     {"$unionWith"
      {"coll" collection-name
       "pipeline" [{"$sort" {"_id" -1}}
                   {"$limit" end-n}]}}]))

(defn- facet-stage [depth]
  [{"$facet"
    {"prev" [{"$match" {"d" {"$lte" (dec depth)}}}]
     "curr" [{"$match" {"d" depth}}
             {"$group" {"_id"   {"t" "$t"
                                 "p" "$p"}
                        "count" {"$sum" 1}
                        "i"     {"$first" "$i"}}}
             {"$match" {"_id.t" {"$ne" "null"}}}
             {"$sort" {"count" -1}}
             {"$group" {"_id" "$_id.p"
                        "t"   {"$first" "$_id.t"}
                        "i"   {"$first" "$i"}}}
             {"$project" {"p" "$_id"
                          "d" {"$literal" depth}
                          "t" 1
                          "v" nil
                          "i" 1}}]
     "next" [{"$match" {"t" "object"
                        "d" depth}}
             {"$project" {"p"      1
                          "i"      1
                          "nested" {"$map" {"input" {"$objectToArray" "$v"},
                                            "as"    "item",
                                            "in"    {"k" "$$item.k",
                                                     "v" "$$item.v"
                                                     "t" {"$type" "$$item.v"}}}}}}
             {"$unwind" {"path"              "$nested"
                         "includeArrayIndex" "i"}}
             {"$project" {"p" {"$concat" ["$p" "." "$nested.k"]}
                          "t" "$nested.t"
                          "d" {"$literal" (inc depth)}
                          "v" {"$cond" {"if"   {"$eq" ["$nested.t", "object"]}
                                        "then" "$nested.v"
                                        "else" nil}}
                          "i" 1}}]}}
   {"$project" {"combined" {"$concatArrays" ["$prev" "$curr" "$next"]}}}
   {"$unwind" "$combined"}
   {"$replaceRoot" {"newRoot" "$combined"}}])

(defn- describe-table-query [& {:keys [collection-name sample-size max-depth]}]
  (concat (sample-stages collection-name sample-size)
          [{"$project" {"path" "$ROOT", "kvs" {"$objectToArray" "$$ROOT"}}}
           {"$unwind" {"path" "$kvs", "includeArrayIndex" "i"}}
           {"$project" {"p" "$kvs.k"
                        "d" {"$literal" 0}
                        "v" {"$cond" {"if"   {"$eq" [{"$type" "$kvs.v"}, "object"]}
                                      "then" "$kvs.v"
                                      "else" nil}}
                        "t" {"$type" "$kvs.v"}
                        "i" 1}}]
          (mapcat facet-stage (range max-depth))
          [{"$project" {"_id"   0
                        "path"  "$p"
                        "type"  "$t"
                        "index" "$i"}}]))

(def describe-table-query-depth
  "The depth of nested objects that [[describe-table-query]] will execute to. If set to 0, the query will only return the
  fields under `root-path`, and nested fields will be queried with further executions. If set to K, the query will
  return fields at K levels of nesting. Setting its value involves a trade-off: the lower it is, the faster
  describe-table-query executes, but the more queries we might have to execute."
  200)

(mu/defn- describe-table :- [:sequential
                             [:map {:closed true}
                              [:path  ::lib.schema.common/non-blank-string]
                              [:type  ::lib.schema.common/non-blank-string]
                              [:index :int]]]
  "Queries the database for a sample of the data in `table` and returns a list of field information. Because Mongo
   documents can have many levels of nesting (up to 200), we query up to that level of nesting."
  [db table]
  (let [query (describe-table-query {:collection-name (:name table)
                                     :sample-size     (* metadata-queries/nested-field-sample-limit 2)
                                     :max-depth       describe-table-query-depth})
        data  (:data (qp/process-query {:database (:id db)
                                        :type     "native"
                                        :native   {:collection (:name table)
                                                   :query      (json/generate-string query)}}))
        cols   (map (comp keyword :name) (:cols data))]
    (map #(zipmap cols %) (:rows data))))

(defn- type-alias->base-type [type-alias]
  ;; Mongo types from $type aggregation operation
  ;; https://www.mongodb.com/docs/manual/reference/operator/aggregation/type/#available-types
  (get {"double"     :type/Float
        "string"     :type/Text
        "object"     :type/Dictionary
        "array"      :type/Array
        "binData"    :type/*
        "objectId"   :type/MongoBSONID
        "bool"       :type/Boolean
        "date"       :type/Instant
        "null"       :type/*
        "regex"      :type/*
        "dbPointer"  :type/*
        "javascript" :type/*
        "symbol"     :type/Text
        "int"        :type/Integer
        "timestamp"  :type/Instant
        "long"       :type/Integer
        "decimal"    :type/Decimal}
        type-alias :type/*))

(defn- add-database-position
  "Adds :database-position to all fields. It starts at 0 and is ordered by a depth-first traversal of nested fields."
  [fields i]
  (->> fields
       (sort-by :index)
       (reduce (fn [[fields i] field]
                 (let [field             (assoc field :database-position i)
                       i                 (inc i)
                       nested-fields     (:nested-fields field)
                       [nested-fields i] (if nested-fields
                                           (add-database-position nested-fields i)
                                           [nested-fields i])
                       field             (-> field
                                             (m/assoc-some :nested-fields nested-fields)
                                             (dissoc :index))]
                   [(conj fields field) i]))
               [#{} i])))

(defmethod driver/describe-table :mongo
  [_driver database table]
  (let [fields (->> (describe-table database table)
                    (map (fn [x]
                           (let [path (str/split (:path x) #"\.")
                                 name (last path)]
                             (cond-> {:name              name
                                      :database-type     (:type x)
                                      :base-type         (type-alias->base-type (:type x))
                                      ; index is used by `set-database-position`, and not present in final result
                                      :index             (:index x)
                                      ; path is used to nest fields, and not present in final result
                                      :path              path}
                               (= name "_id")
                               (assoc :pk? true))))))
        ;; convert the flat list of fields into deeply-nested map.
        ;; `fields` and `:nested-fields` values are maps from name to field
        fields (reduce
                (fn [acc field]
                  (assoc-in acc (interpose :nested-fields (:path field)) (dissoc field :path)))
                {}
                fields)
        ;; replace maps from name to field with sets of fields
        fields (walk/postwalk (fn [x]
                                (cond-> x
                                  (map? x)
                                  (m/update-existing :nested-fields #(set (vals %)))))
                              (set (vals fields)))
        [fields _] (add-database-position fields 0)]
    {:schema nil
     :name   (:name table)
     :fields fields}))

(doseq [[feature supported?] {:basic-aggregations              true
                              :expression-aggregations         true
                              :inner-join                      true
                              :left-join                       true
                              :nested-fields                   true
                              :native-parameter-card-reference false
                              :native-parameters               true
                              :nested-queries                  true
                              :set-timezone                    true
                              :standard-deviation-aggregations true
                              :test/jvm-timezone-setting       false
                              :index-info                      true}]
  (defmethod driver/database-supports? [:mongo feature] [_driver _feature _db] supported?))

(defmethod driver/database-supports? [:mongo :schemas] [_driver _feat _db] false)

(defmethod driver/database-supports? [:mongo :expressions]
  [_driver _feature db]
  (-> ((some-fn :dbms-version :dbms_version) db)
      :semantic-version
      (driver.u/semantic-version-gte [4 2])))

(defmethod driver/database-supports? [:mongo :date-arithmetics]
  [_driver _feature db]
  (-> ((some-fn :dbms-version :dbms_version) db)
      :semantic-version
      (driver.u/semantic-version-gte [5])))

(defmethod driver/database-supports? [:mongo :datetime-diff]
  [_driver _feature db]
  (-> ((some-fn :dbms-version :dbms_version) db)
      :semantic-version
      (driver.u/semantic-version-gte [5])))

(defmethod driver/database-supports? [:mongo :now]
  ;; The $$NOW aggregation expression was introduced in version 4.2.
  [_driver _feature db]
  (-> ((some-fn :dbms-version :dbms_version) db)
      :semantic-version
      (driver.u/semantic-version-gte [4 2])))

(defmethod driver/database-supports? [:mongo :native-requires-specified-collection]
  [_driver _feature _db]
  true)

;; We say Mongo supports foreign keys so that the front end can use implicit
;; joins. In reality, Mongo doesn't support foreign keys.
;; Only define an implementation for `:foreign-keys` if none exists already.
;; In test extensions we define an alternate implementation, and we don't want
;; to stomp over that if it was loaded already.
(when-not (get (methods driver/database-supports?) [:mongo :foreign-keys])
  (defmethod driver/database-supports? [:mongo :foreign-keys] [_driver _feature _db] true))

(defmethod driver/mbql->native :mongo
  [_ query]
  (mongo.qp/mbql->native query))

(defmethod driver/execute-reducible-query :mongo
  [_driver query _context respond]
  (assert (string? (get-in query [:native :collection])) "Cannot execute MongoDB query without a :collection name")
  (mongo.connection/with-mongo-client [_ (lib.metadata/database (qp.store/metadata-provider))]
    (mongo.execute/execute-reducible-query query respond)))

(defmethod driver/substitute-native-parameters :mongo
  [driver inner-query]
  (mongo.params/substitute-native-parameters driver inner-query))

(defmethod driver/db-start-of-week :mongo
  [_]
  :sunday)

(defn- get-id-field-id [table]
  (some (fn [field]
          (when (= (:name field) "_id")
            (:id field)))
        (lib.metadata.protocols/fields (qp.store/metadata-provider) (u/the-id table))))

(defmethod driver/table-rows-sample :mongo
  [_driver table fields rff opts]
  (qp.store/with-metadata-provider (:db_id table)
    (let [mongo-opts {:limit    metadata-queries/nested-field-sample-limit
                      :order-by [[:desc [:field (get-id-field-id table) nil]]]}]
      (metadata-queries/table-rows-sample table fields rff (merge mongo-opts opts)))))

;; Following code is using monger. Leaving it here for a reference as it could be transformed when there is need
;; for ssl experiments.
#_(comment
  (require '[clojure.java.io :as io]
           '[monger.credentials :as mcred])
  (import javax.net.ssl.SSLSocketFactory)

  ;; The following forms help experimenting with the behaviour of Mongo
  ;; servers with different configurations. They can be used to check if
  ;; the environment has been set up correctly (or at least according to
  ;; the expectations), as well as the exceptions thrown in various
  ;; constellations.

  ;; Test connection to Mongo with client and server SSL authentication.
  (let [ssl-socket-factory
        (driver.u/ssl-socket-factory
         :private-key (-> "ssl/mongo/metabase.key" io/resource slurp)
         :password "passw"
         :own-cert (-> "ssl/mongo/metabase.crt" io/resource slurp)
         :trust-cert (-> "ssl/mongo/metaca.crt" io/resource slurp))
        connection-options
        (mg/mongo-options {:ssl-enabled true
                           :ssl-invalid-host-name-allowed false
                           :socket-factory ssl-socket-factory})
        credentials
        (mcred/create "metabase" "admin" "metasample123")]
    (with-open [connection (mg/connect (mg/server-address "127.0.0.1")
                                       connection-options
                                       credentials)]
      (mg/get-db-names connection)))

  ;; Test what happens if the client only support server authentication.
  (let [server-auth-ssl-socket-factory
        (driver.u/ssl-socket-factory
         :trust-cert (-> "ssl/mongo/metaca.crt" io/resource slurp))
        server-auth-connection-options
        (mg/mongo-options {:ssl-enabled true
                           :ssl-invalid-host-name-allowed false
                           :socket-factory server-auth-ssl-socket-factory
                           :server-selection-timeout 200})
        credentials
        (mcred/create "metabase" "admin" "metasample123")]
    (with-open [server-auth-connection
                (mg/connect (mg/server-address "127.0.0.1")
                            server-auth-connection-options
                            credentials)]
      (mg/get-db-names server-auth-connection)))

  ;; Test what happens if the client support only server authentication
  ;; with well known (default) CAs.
  (let [unauthenticated-connection-options
        (mg/mongo-options {:ssl-enabled true
                           :ssl-invalid-host-name-allowed false
                           :socket-factory (SSLSocketFactory/getDefault)
                           :server-selection-timeout 200})
        credentials
        (mcred/create "metabase" "admin" "metasample123")]
    (with-open [unauthenticated-connection
                (mg/connect (mg/server-address "127.0.0.1")
                            unauthenticated-connection-options
                            credentials)]
      (mg/get-db-names unauthenticated-connection)))
  :.)
