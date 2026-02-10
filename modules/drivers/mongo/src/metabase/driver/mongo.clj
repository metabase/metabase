(ns metabase.driver.mongo
  "MongoDB Driver."
  (:refer-clojure :exclude [some mapv empty? get-in])
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.mongo.connection :as mongo.connection]
   [metabase.driver.mongo.conversion :as mongo.conversion]
   [metabase.driver.mongo.database :as mongo.db]
   [metabase.driver.mongo.execute :as mongo.execute]
   [metabase.driver.mongo.json]
   [metabase.driver.mongo.parameters :as mongo.params]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.driver.mongo.util :as mongo.util]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [some mapv empty? get-in]]
   [taoensso.nippy :as nippy])
  (:import
   (com.mongodb.client MongoClient MongoDatabase)
   (org.bson.types Binary ObjectId)))

(set! *warn-on-reflection* true)

(comment metabase.driver.mongo.json/keep-me)

;; JSON Encoding (etc.)

;; Encode BSON undefined like `nil`
(json/add-encoder org.bson.BsonUndefined json/generate-nil)

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
  [_ messages]
  (let [message (first messages)]
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

      message)))

;;; ### Syncing

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

(defmethod driver/describe-database* :mongo
  [_ database]
  (mongo.connection/with-mongo-database [^MongoDatabase db database]
    {:tables (set (for [collection (mongo.util/list-collection-names db)
                        :when (not (contains? #{"system.indexes" "system.views"} collection))]
                    {:schema nil, :name collection}))}))

(defmethod driver/describe-table-indexes :mongo
  [_ database table]
  (mongo.connection/with-mongo-database [^MongoDatabase db database]
    (let [collection (mongo.util/collection db (:name table))]
      (try
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
             set)
        (catch com.mongodb.MongoCommandException e
          ;; com.mongodb.MongoCommandException: Command failed with error 166 (CommandNotSupportedOnView): 'Namespace test-data.orders_m is a view, not a collection' on server bee:27017. The full response is {"ok": 0.0, "errmsg": "Namespace test-data.orders_m is a view, not a collection", "code": 166, "codeName": "CommandNotSupportedOnView"}
          (if (= (.getErrorCode e) 166)
            #{}
            (throw e)))))))

;; describe-table impl start

(def describe-table-query-depth
  "The depth of nested objects that [[describe-table-query]] will execute to. If set to 0, the query will only return the
  fields at the root level of the document. If set to K, the query will return fields at K levels of nesting beyond that.
  Setting its value involves a trade-off: the lower it is, the faster describe-table-query executes, but the more queries we might
  have to execute."
  ;; Cal 2024-09-15: I chose 100 as the limit because it's a pretty safe bet it won't be exceeded (the documents we've
  ;; seen on cloud are all <20 levels deep)
  ;; Case 2024-10-04: Sharded clusters seem to run into exponentially more work the bigger this is. Over 20 and this
  ;; risks never finishing.
  ;; From arakaki:
  ;;  > I think we can pick a max-depth that works well. I know that some other related tools set limits of 7 nested levels.
  ;;  > And that would be definitely ok for most.
  ;;  > If people have problems with that, I think we can make it configurable.
  7)

(defn ^:dynamic *sample-stages*
  "Stages to get sample of a collection in [[describe-table-pipeline]]. Dynamic for testing purposes."
  [collection-name sample-size]
  (let [start-n       (quot sample-size 2)
        end-n         (- sample-size start-n)]
    [{"$sort" {"_id" 1}}
     {"$limit" start-n}
     {"$unionWith"
      {"coll" collection-name
       "pipeline" [{"$sort" {"_id" -1}}
                   {"$limit" end-n}]}}]))

(def ^:private unwind-stages
  "Sequence of stages repeated in _search_ phase of [[describe-table-pipeline]]
    for [[describe-table-query-depth]] times.

    Each repetition $unwinds documents having `val` of type \"object\", so those are __swapped__ for sequence
    of their children.

    Documents with non-object val are left untouched.

    Each document that is processed has path from parent stored in `path`. `indices` represent indices of keys
    in the `path` in parent objects as per $objectToArray."
  [{"$addFields" {"kvs" {"$cond" [{"$eq" [{"$type" "$val"} "object"]} {"$objectToArray" "$val"} nil]}}}
   {"$unwind" {"path" "$kvs" "preserveNullAndEmptyArrays" true "includeArrayIndex" "index"}}
   {"$project" {"path" {"$cond" [{"$and" ["$path" "$kvs.k"]}
                                 {"$concat" ["$path" "." "$kvs.k"]}
                                 {"$ifNull" ["$kvs.k" "$path"]}]}
                "val" {"$cond" ["$kvs.k" "$kvs.v" "$val"]}
                "indices" {"$cond" [{"$or" ["$index" {"$eq" ["$index" 0]}]}
                                    {"$concatArrays" ["$indices" ["$index"]]}
                                    "$indices"]}}}])

(defn- describe-table-pipeline
  "Construct mongo aggregation pipeline to fetch at most `leaf-limit` number of _leaf fields_. _Leaf fields_ are later
  transformed by [[dbfields->ftree]] and [[ftree->nested-fields]] to be returned as :fields
  of [[driver/describe-table]]. `sample-size` represents number of documents taken from start and end of a collection.
  `document-sample-depth` conveys how deep the documents are sampled, ie. number of repetitions of [[unwind-stages]]."
  [{:keys [collection-name sample-size document-sample-depth leaf-limit]}]
  (into []
        cat
        [;; 1. Fetch.
         (*sample-stages* collection-name sample-size)
         [;; 2. Initialize.
          {"$project" {"path"    {"$literal" nil}
                       "indices" {"$literal" []}
                       "val"     "$$ROOT"}}]
         ;; 3. Search
         (apply concat (repeat document-sample-depth unwind-stages))
         ;; 4. Group results
         [{"$group" {"_id"     {"path"   "$path"
                                "type"   {"$type" "$val"}
                                "ensure" {"$cond" [{"$eq" ["$path" "_id"]} 0 1]}}
                     "count"   {"$sum" {"$cond" [{"$eq" [{"$type" "$val"} "null"]} 0 1]}}
                     "indices" {"$min" "$indices"}}}
          {"$sort" {"count" -1}}
          {"$group" {"_id" "$_id.path"
                     "info" {"$first" {"count"   "$count"
                                       "type"    "$_id.type"
                                       "ensure"  "$_id.ensure"
                                       "indices" "$indices"}}}}
          {"$sort" {"info.ensure" 1 "info.count"  -1 "_id" 1}}
          {"$limit" leaf-limit}
          {"$project" {"_id"     1
                       "type"    "$info.type"
                       "indices" "$info.indices"}}
          {"$project" {"info" 0}}]]))

(defn- raw-path->ftree-paths
  "Construct sequence of ftree paths from `path`. `path` is string of form eg. `c1.c2...`. The result
  for the example looks as '([:children 'c1'] [:children 'c1' :children 'c2']."
  [path]
  (->> (str/split path #"\.")
       (reductions conj [])
       rest
       (map #(vec (interleave (repeat :children) %)))))

(defn- ftree-path->raw-path
  [ftree-path]
  (str/join "." (remove #{:children} ftree-path)))

(defn- ftree-set-type
  "Set type in ftree node.

  There may be situations where some documents from sampled data contain path `a.b` of type eg. datetime and path
  `a.b.c` of some other type. That could result in type conflict on `a.b`.

  When building the ftree, Type conflicts are resolved as \"object wins\"."
  [ftree path new-type]
  (let [type-path (conj (vec path) :database-type)
        current-type (get-in ftree type-path)]
    (when (and (some? current-type) (not= current-type new-type))
      (log/warnf "Type conflict in sampled data at path `%s`, t1 `%s`, t2 `%s`."
                 (ftree-path->raw-path path) current-type new-type))
    (cond-> ftree
      (or (= "object" new-type) (nil? current-type)) (assoc-in type-path new-type))))

(defn- dbfields->ftree*
  "Construct _raw_ ftree from `dbfields`. Intended result is described in the [[dbfields->ftree]] docstring.
  _Raw_ means that nodes have only #{:database-type :visibility-type :index} keys."
  [dbfields]
  (loop [[{raw-path :path leaf-type :type :as dbfield} & dbfields*] dbfields
         ftree {:children {}}]
    (if (nil? dbfield)
      ftree
      (let [ftree-paths (raw-path->ftree-paths raw-path)
            parents-paths (butlast ftree-paths)
            leaf-path (last ftree-paths)
            ftree* (reduce #(-> %1
                                (ftree-set-type %2 "object")
                                (assoc-in (conj %2 :visibility-type) :details-only))
                           ftree parents-paths)
            ftree* (ftree-set-type ftree* leaf-path leaf-type)
            ftree* (reduce #(assoc-in %1 (conj (vec (first %2)) :index) (second %2))
                           ftree*
                           (map vector ftree-paths (:indices dbfield)))]
        (recur dbfields* ftree*)))))

(defn- ftree-prewalk
  "Walk the `ftree` and apply (f ftree path) to each node prior descending to its children. Nodes are walked according
  to index and name. Returns the modified ftree."
  [ftree f]
  (letfn [(sorted-children-paths
            [ftree* path]
            (->> (get-in ftree* (conj path :children))
                 keys (sort-by (juxt #(get-in ftree* (conj path :children % :index)) identity))
                 (map (partial conj path :children))))

          (ftree-prewalk*
            [ftree* path]
            (reduce ftree-prewalk*
                    (f ftree* path)
                    (sorted-children-paths ftree* path)))]
    (reduce ftree-prewalk* ftree (sorted-children-paths ftree []))))

(defn- db-type->base-type [db-type]
  ;; Mongo types from $type aggregation operation
  ;; https://www.mongodb.com/docs/manual/reference/operator/aggregation/type/#available-types
  (get {"double"     :type/Float
        "string"     :type/Text
        "object"     :type/Dictionary
        "array"      :type/Array
        "binData"    :type/MongoBinData
        ;; "uuid" is not a database type like the rest here
        ;; it's determined by the subtype of binData fields in describe-table
        "uuid"       :type/UUID
        "objectId"   :type/MongoBSONID
        "bool"       :type/Boolean
        ;; Mongo's date type is actually a date time so we can't map it to :type/Date
        ;; See documentation: https://www.mongodb.com/docs/manual/reference/bson-types/#std-label-document-bson-type-date
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
       db-type :type/*))

(defn- ftree-reconcile-nodes
  "Add missing keys [[dbfields->ftree*]] nodes to match description in [[dbfields->ftree]]."
  [ftree]
  (let [index (atom -1)]
    (-> (ftree-prewalk
         ftree
         (fn [ftree* path]
           (-> ftree*
               (assoc-in (conj path :database-position) (swap! index inc))
               (assoc-in (conj path :base-type) (-> (get-in ftree* (conj path :database-type))
                                                    db-type->base-type))
               (assoc-in (conj path :name) (last path)))))
        (as-> $ (if (map? (get-in $ [:children "_id"]))
                  (assoc-in $ [:children "_id" :pk?] true)
                  $)))))

(defn- dbfields->ftree
  "Build ftree from `dbfields`. Ftree is intermediate structure, later transformed for needs
  of [[driver/describe-table]]. For details see the [[ftree->nested-fields]].

  Ftree is of form
  {:children {'toplevelkey' {:name 'toplevelkey'
                             :database-position <int>
                             :database-type <string>
                             :base-type <base-type>
                             :index <int>                              ; index of key in mongo object
                             :visibility-type :details-only            ; only for object database-type
                             :pk? true                                 ; only in '_id' named toplevel key
                             :children {'nestedkey' {:name 'nestedkey'
                                                     ...}
                                        ...}}
              ...}}

  Reason for doing this in 2 steps is that for adding database-position the structure has to be fully constructed
  first.

  The resulting structure will hold at most [[driver.settings/sync-leaf-fields-limit]] leaf fields. That translates
  to at most [[driver.settings/sync-leaf-fields-limit]] * [[describe-table-query-depth]]. That is 7K fields at the
  time of writing hence safe to reside in memory for further operation."
  [dbfields]
  (-> dbfields dbfields->ftree* ftree-reconcile-nodes))

(defn- ftree->nested-fields
  "Create nested-fields structure suitable for :fields key of structure return by [[driver/describe-table]]. `ftree`
  is a tree that represents sampled mongo documents. See the [[dbfields->ftree]] for details."
  [ftree]
  (letfn [(ftree->nested-fields*
            [ftree*]
            (-> ftree*
                (cond-> (contains? ftree* :children)
                  (-> (update :children #(set (map ftree->nested-fields* (vals %))))
                      (set/rename-keys {:children :nested-fields})))
                (dissoc :index)))]
    (:nested-fields (ftree->nested-fields* ftree))))

(defn- fetch-dbfields-rff
  [_metadata]
  (fn
    ([] (transient []))
    ([r] (persistent! r))
    ([acc row]
     (conj! acc (zipmap [:path :type :indices] row)))))

(defn- fetch-dbfields
  "Fetch _dbfields_ from a mongo collection.

  Result is vector of maps as
  [{:path 'x.y.z' :type 'int' :indices [1 1 1]} ...]

  Each row represents leaf in sampled documents, its type and indices of keys present in the path of mongo of nested
  object."
  [database table]
  (let [pipeline (describe-table-pipeline {:collection-name (:name table)
                                           :sample-size (* table-rows-sample/nested-field-sample-limit 2)
                                           :document-sample-depth describe-table-query-depth
                                           :leaf-limit (driver.settings/sync-leaf-fields-limit)})
        query {:database (:id database)
               :type     "native"
               :native   {:collection (:name table)
                          :query      (json/encode pipeline)}}]
    (driver-api/process-query query fetch-dbfields-rff)))

(defmethod driver/describe-table :mongo
  [_driver database table]
  {:schema nil
   :name (:name table)
   :fields (-> (fetch-dbfields database table) dbfields->ftree ftree->nested-fields)})

;; describe-table impl end

(doseq [[feature supported?] {:basic-aggregations              true
                              :expression-aggregations         true
                              :expression-literals             true
                              :inner-join                      true
                              :left-join                       true
                              :nested-fields                   true
                              :native-parameter-card-reference false
                              :native-parameters               true
                              :nested-queries                  true
                              :set-timezone                    true
                              :standard-deviation-aggregations true
                              :test/create-table-without-data  false
                              :rename                          true
                              :test/jvm-timezone-setting       false
                              :identifiers-with-spaces         true
                              :saved-question-sandboxing       false
                              :expressions/date                true
                              :expressions/text                true
                              :expressions/datetime            true
                              :expressions/today               true
                              ;; Index sync is turned off across the application as it is not used ATM.
                              :index-info                      false
                              :python-transforms               true
                              :transforms/python               true
                              :database-routing                true}]
  (defmethod driver/database-supports? [:mongo feature] [_driver _feature _db] supported?))

(defmethod driver/database-supports? [:mongo :schemas] [_driver _feat _db] false)

(defmethod driver/database-supports? [:mongo :window-functions/cumulative]
  [_driver _feat db]
  (-> ((some-fn :dbms-version :dbms_version) db)
      :semantic-version
      (driver.u/semantic-version-gte [5])))

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
  (mongo.connection/with-mongo-client [_ (driver-api/database (driver-api/metadata-provider))]
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
        (driver-api/fields (driver-api/metadata-provider) (u/the-id table))))

(defmethod driver/table-rows-sample :mongo
  [_driver table fields rff opts]
  (driver-api/with-metadata-provider (:db_id table)
    (let [id-column  (driver-api/field (driver-api/metadata-provider) (get-id-field-id table))
          mongo-opts {:limit    table-rows-sample/nested-field-sample-limit
                      :order-by [(driver-api/order-by-clause id-column :desc)]}]
      (table-rows-sample/table-rows-sample table fields rff (merge mongo-opts opts)))))

(defn- encode-mongo
  "Converts a Clojure representation of a Mongo aggregation pipeline to a formatted JSON-like string"
  ([mgo] (encode-mongo mgo 0))
  ([mgo indent-level]
   (let [indent (apply str (repeat indent-level "  "))
         next-indent (str indent "  ")]
     (letfn [(encode-map [m next-indent]
               (if (empty? m) "{}"
                   (str "{\n"
                        (->> m
                             (map (fn [[k v]] (str next-indent "\"" (name k) "\": " (encode-mongo v (inc indent-level)))))
                             (str/join ",\n"))
                        "\n" indent "}")))
             (encode-vector [v next-indent]
               (if (empty? v) "[]"
                   (str "[\n"
                        (->> v
                             (map #(str next-indent (encode-mongo % (inc indent-level))))
                             (str/join ",\n"))
                        "\n" indent "]")))
             (encode-binary [bin]
               (if (= (.getType ^Binary bin) mongo.conversion/bson-uuid-type)
                 (str "UUID(\"" (mongo.conversion/bsonuuid->uuid bin) "\")")
                 (json/encode bin)))
             (encode-object-id [oid] (str "ObjectId(\"" (.toString ^ObjectId oid) "\")"))]
       (cond
         (map? mgo) (encode-map mgo next-indent)
         (sequential? mgo) (encode-vector mgo next-indent)
         (instance? ObjectId mgo) (encode-object-id mgo)
         (instance? Binary mgo) (encode-binary mgo)
         :else (json/encode mgo))))))

(defmethod driver/prettify-native-form :mongo
  [_driver native-form]
  (try
    (let [parsed (if (string? native-form)
                   (json/decode native-form)
                   native-form)]
      (encode-mongo parsed))
    (catch Throwable e
      (log/errorf "Unexpected error while prettifying Mongo BSON query: %s" (ex-message e))
      (log/debugf e "Query:\n%s" native-form)
      native-form)))

(defmethod driver/create-table! :mongo
  [_driver database-id table-name _column-definitions & {:keys [primary-key]}]
  ;; MongoDB collections are created implicitly when first document is inserted
  ;; We can create an empty collection explicitly if needed
  (mongo.connection/with-mongo-database [^MongoDatabase db database-id]
    (.createCollection db (name table-name))
    ;; Create indexes for any primary key fields
    (when primary-key
      (doseq [pk-field primary-key]
        (mongo.util/create-index
         (mongo.util/collection db (name table-name))
         {pk-field 1})))))

(defmethod driver/drop-table! :mongo
  [_driver db-id table-name]
  (mongo.connection/with-mongo-database [^MongoDatabase db db-id]
    (some-> (mongo.util/collection db (name table-name))
            .drop)))

(defmethod driver/rename-table! :mongo
  [_driver db-id old-table-name new-table-name]
  (mongo.connection/with-mongo-database [^MongoDatabase db db-id]
    (let [old-collection (mongo.util/collection db (name old-table-name))]
      (.renameCollection old-collection
                         (com.mongodb.MongoNamespace.
                          (.getName db)
                          (name new-table-name))))))

(defmethod driver/drop-transform-target! [:mongo :table]
  [driver database target]
  (driver/drop-table! driver (:id database) (:name target)))

(defmethod driver/connection-spec :mongo
  [_driver database]
  ;; Use effective-details to respect connection type for write connections
  (driver.conn/effective-details database))

(defmulti ^:private type->database-type
  "Internal type->database-type multimethod for MongoDB that dispatches on type."
  {:arglists '([type])}
  identity)

(defmethod type->database-type :type/TextLike [_] "string")
(defmethod type->database-type :type/Text [_] "string")
(defmethod type->database-type :type/Number [_] "long")
(defmethod type->database-type :type/Integer [_] "int")
(defmethod type->database-type :type/BigInteger [_] "long")
(defmethod type->database-type :type/Float [_] "double")
(defmethod type->database-type :type/Decimal [_] "decimal")
(defmethod type->database-type :type/Boolean [_] "bool")
(defmethod type->database-type :type/Date [_] "date")
(defmethod type->database-type :type/DateTime [_] "date")
(defmethod type->database-type :type/DateTimeWithTZ [_] "date")
(defmethod type->database-type :type/Time [_] "date")
(defmethod type->database-type :type/TimeWithTZ [_] "date")
(defmethod type->database-type :type/Instant [_] "date")
(defmethod type->database-type :type/UUID [_] "uuid")
(defmethod type->database-type :type/JSON [_] "object")
(defmethod type->database-type :type/SerializedJSON [_] "string")
(defmethod type->database-type :type/Array [_] "array")
(defmethod type->database-type :type/Dictionary [_] "object")
(defmethod type->database-type :type/MongoBSONID [_] "objectId")
(defmethod type->database-type :type/MongoBinData [_] "binData")
(defmethod type->database-type :type/IPAddress [_] "string")
(defmethod type->database-type :default [_] "object")

(defmethod driver/type->database-type :mongo
  [_driver base-type]
  (type->database-type base-type))

(defn- convert-value-for-insertion
  [base-type value]
  (condp #(isa? %2 %1) base-type
    :type/JSON
    (json/decode value)

    :type/Dictionary
    (json/decode value)

    :type/Array
    (json/decode value)

    :type/Integer
    (parse-long value)

    :type/BigInteger
    (bigint value)

    :type/Float
    (parse-double value)

    :type/Decimal
    (bigdec value)

    :type/Number
    (bigint value)

    :type/Boolean
    (parse-boolean value)

    :type/Date
    (u.date/parse value)

    :type/DateTime
    (u.date/parse value)

    :type/DateTimeWithTZ
    (u.date/parse value)

    :type/Time
    (u.date/parse value)

    :type/TimeWithTZ
    (u.date/parse value)

    :type/Instant
    (u.date/parse value)

    :type/UUID
    (parse-uuid value)

    value))

(defmethod driver/insert-col->val [:mongo :jsonl-file]
  [_driver _ column-def v]
  (if (string? v)
    (convert-value-for-insertion (:type column-def) v)
    v))

(defmethod driver/insert-from-source! [:mongo :rows]
  [_driver db-id {table-name :name :keys [columns]} {:keys [data]}]
  (let [col-names (mapv :name columns)]
    (mongo.connection/with-mongo-database [^MongoDatabase db db-id]
      (let [collection (mongo.util/collection db (name table-name))
            documents (map #(into {} (map vector col-names %))
                           data)]
        (if (> (bounded-count 2 documents) 1)
          (doseq [chunk (partition-all (or driver/*insert-chunk-rows* 1000) documents)]
            (mongo.util/insert-many collection chunk))
          (mongo.util/insert-one collection (first documents)))))))

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

(defmethod driver/table-name-length-limit :mongo
  [_driver]
  64)
