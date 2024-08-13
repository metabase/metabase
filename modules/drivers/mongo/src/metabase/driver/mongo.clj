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
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]
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

(def ^:private describe-table-sample-size 1000)

(defn- sample-stages
  "Query stages which get a sample of the data in the collection, of size `n`."
  [n]
  (let [start-n (quot n 2)
        end-n   (- n start-n)]
    [{"$sort" {"_id" 1}}
     {"$limit" start-n}
     {"$unionWith"
      {"coll" "oom_test"
       "pipeline" [{"$sort" {"_id" -1}}
                   {"$limit" end-n}]}}]))

(defn- root-query [max-depth]
  (let [depth-k    (fn [depth] (str "depth" depth "K"))
        depth-type (fn [depth] (str "depth" depth "Type"))
        depth-idx  (fn [depth] (str "depth" depth "Index"))
        depth-kvs  (fn [depth] (str "depth" depth "KVs"))
        project-nested-fields
        (fn [depth]
          (cond-> [{"$project"
                    (merge
                     ;; Include all fields from previous depths
                     (into {} (mapcat
                               (fn [i]
                                 [[(depth-k i) 1]
                                  [(depth-idx i) 1]
                                  [(depth-type i) 1]])
                               (range depth)))
                     ;; Project current depth field and type
                     {(depth-k depth)    (str "$" (depth-kvs depth) ".k")
                      (depth-idx depth)  (str "$" (depth-idx depth))
                      (depth-type depth) {"$type" (str "$" (depth-kvs depth) ".v")}}
                     ;; Project next depth fields if they exist
                     (when (not= depth max-depth)
                       {(depth-kvs (inc depth))
                        {"$cond" {"if"   {"$eq" [{"$type" (str "$" (depth-kvs depth) ".v")}, "object"]}
                                  "then" {"$concatArrays" [[{"k" nil "v" nil}]
                                                           {"$objectToArray" (str "$" (depth-kvs depth) ".v")}]}
                                  "else" [{"k" nil "v" nil}]}}}))}]
            (not= depth max-depth)
            (conj {"$unwind"
                   {"path"                       (str "$" (depth-kvs (inc depth)))
                    "includeArrayIndex"          (depth-idx (inc depth))
                    "preserveNullAndEmptyArrays" true}})))
        facet-stage
        (fn [depth]
          (let [depths (range (inc depth))]
            [{"$match" {(depth-k depth) {"$ne" nil}}}
             {"$group" {"_id" (into {(depth-type depth) (str "$" (depth-type depth))}
                                    (mapcat (fn [i]
                                              [[(depth-k i)   (str "$" (depth-k i))]
                                               [(depth-idx i) (str "$" (depth-idx i))]])
                                            depths))
                        "count" {"$sum" 1}}}
             {"$sort" (into {"count" -1}
                            (for [i depths]
                              [(str "_id." (depth-k i)) 1]))}
             {"$group" {"_id" (into {}
                                    (mapcat (fn [i]
                                              [[(depth-k i)   (str "$_id." (depth-k i))]
                                               [(depth-idx i) (str "$_id." (depth-idx i))]])
                                            depths))
                        "mostCommonType" {"$first" (str "$_id." (depth-type depth))}}}
             {"$project" {"_id"            0
                          "path"           {"$concat" (vec (interpose "." (for [i depths]
                                                                            (str "$_id." (depth-k i)))))}
                          "field"          (str "$_id." (depth-k depth))
                          "index"          (str "$_id." (depth-idx depth))
                          "mostCommonType" 1}}]))
        all-depths (range (inc max-depth))
        facets (into {} (map (juxt #(str "depth" %) facet-stage) all-depths))]
    (vec (concat (sample-stages describe-table-sample-size)
                 [{"$project" {(depth-kvs 0) {"$objectToArray" "$sample"}}}
                  {"$unwind" {"path" (str "$" (depth-kvs 0)), "includeArrayIndex" (depth-idx 0)}}]
                 (mapcat project-nested-fields all-depths)
                 [{"$facet" facets}
                  {"$project" {"allFields" {"$concatArrays" (mapv #(str "$" %) (keys facets))}}}
                  {"$unwind" "$allFields"}]))))

(defn- nested-level-query [parent-paths]
  (letfn [(path-query [path]
            [{"$project" {"path" path
                          "kvs"  {"$objectToArray" (str "$" path)}}}
             {"$unwind" {"path"              "$kvs"
                         "includeArrayIndex" "index"}}
             {"$project"
              {"path"  "$path"
               "k"     "$kvs.k"
               "type"  {"$type" "$kvs.v"}
               "index" "$index"}}
             {"$group"
              {"_id" {"path"  "$path"
                      "k"     "$k"
                      "type"  "$type"
                      "index" "$index"}
               "count" {"$sum" 1}}}
             {"$sort" {"count" -1}}
             {"$group"
              {"_id"            {"path"  "$_id.path"
                                 "k"     "$_id.k"
                                 "index" "$_id.index"}
               "mostCommonType" {"$first" "$_id.type"}}}
             {"$project"
              {"_id"            0
               "path"           {"$concat" ["$_id.path" "." "$_id.k"]}
               "field"          "$_id.k"
               "index"          "$_id.index"
               "mostCommonType" 1}}])]
    (concat (sample-stages describe-table-sample-size)
            [{"$replaceRoot" {"newRoot" "$sample"}}
             {"$project" {"sample" 0}}
             {"$facet"
              (into {}
                    (map-indexed (fn [idx path]
                                   [idx (path-query path)]))
                    parent-paths)}])))

(defn- path->depth [path]
  (dec (count (str/split path #"\."))))

(defn- infer-schema [db table]
  (let [q! (fn [q]
             (:rows (:data (qp/process-query {:database (:id db)
                                              :type     "native"
                                              :native   {:collection (:name table)
                                                         :query      (json/generate-string q)}}))))
        ;; query-depth's value involves a trade-off. The lower the query-depth the faster root-query executes.
        ;; however it can mean we have to do more nested-level-query executions.
        query-depth   4
        fields        (flatten (q! (root-query query-depth)))
        ;; object-fields of the maximum depth need to be explored further
        nested-fields (fn nested-fields [paths]
                        (let [fields (flatten (first (q! (nested-level-query paths))))
                              nested (when-let [object-fields (seq (filter #(= (:mostCommonType %) "object") fields))]
                                       (nested-fields (map :path object-fields)))]
                          (concat fields nested)))
        nested        (when-let [fields-to-explore (seq (filter (fn [x]
                                                                  (and (= (:mostCommonType x) "object")
                                                                       (= (path->depth (:path x)) query-depth)))
                                                                fields))]
                        (nested-fields (map :path fields-to-explore)))]
    (concat fields nested)))

(defn- type-alias->base-type [type-alias]
  ;; Mongo types from $type aggregation operation
  ;; https://www.mongodb.com/docs/manual/reference/operator/aggregation/type/#available-types
  (get {"double"     :type/Float
        "string"     :type/Text
        "object"     :type/Dictionary
        "array"      :type/Array
        "binData"    :type/*
        "undefined"  :type/*
        "objectId"   :type/MongoBSONID
        "bool"       :type/Boolean
        "date"       :type/DateTime
        "null"       :type/*
        "regex"      :type/Text  ; Regular expressions are typically represented as strings
        "dbPointer"  :type/*     ; Deprecated. TODO: should this be something else?
        "javascript" :type/*     ; TODO: should this be text?
        "symbol"     :type/Text  ; Deprecated. TODO: should this be text?
        "int"        :type/Integer
        "timestamp"  :type/DateTime
        "long"       :type/Integer
        "decimal"    :type/Decimal
        "minKey"     :type/* ; TODO: should this be something else?
        "maxKey"     :type/*}
        type-alias :type/*))

(defn- set-database-position
  "Sets :database-position on all fields. It starts at 0 and is ordered by a depth-first traversal of nested fields."
  [fields i]
  (->> fields
       (sort-by :index) ; the array index of the key in the object
       (reduce (fn [[fields i] field]
                 (let [field             (assoc field :database-position i)
                       i                 (inc i)
                       nested-fields     (:nested-fields field)
                       [nested-fields i] (if nested-fields
                                           (set-database-position nested-fields i)
                                           [nested-fields i])
                       field             (-> field
                                             (m/assoc-some :nested-fields nested-fields)
                                             (dissoc :index))]
                   [(conj fields field) i]))
               [#{} i])))

(defmethod driver/describe-table :mongo
  [_driver database table]
  (let [fields (infer-schema database table)
        fields (->> fields
                    (map (fn [x]
                           {:name              (:field x)
                            :database-type     (:mostCommonType x)
                            :index             (:index x)
                            :base-type         (type-alias->base-type (:mostCommonType x))
                            :path              (str/split (:path x) #"\.")
                            :depth             (path->depth (:path x))})))
        ;; convert flat list of fields into deeply-nested map. :nested-fields are maps from field name to field data
        fields (loop [depth      0
                      new-fields {}]
                 (if-some [fields-at-depth (not-empty (filter #(= (:depth %) depth) fields))]
                   (recur (inc depth)
                          (reduce (fn [acc field]
                                    (assoc-in acc (interpose :nested-fields (:path field)) (dissoc field :path :depth)))
                                  new-fields
                                  fields-at-depth))
                   new-fields))
        ;; replace :nested-field maps with sets of nested fields
        fields (:nested-fields (walk/postwalk (fn [x]
                                                (if-let [nested-fields (:nested-fields x)]
                                                  (assoc x :nested-fields (set (vals nested-fields)))
                                                  x))
                                              {:nested-fields fields}))
        [fields _] (set-database-position fields 0)]
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
