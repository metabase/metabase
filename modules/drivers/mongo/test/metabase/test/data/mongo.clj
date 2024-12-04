(ns metabase.test.data.mongo
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.mongo.connection :as mongo.connection]
   [metabase.driver.mongo.util :as mongo.util]
   [metabase.test.data.interface :as tx]
   [metabase.util.json :as json])
  (:import
   (com.mongodb.client MongoDatabase)))

(set! *warn-on-reflection* true)

(tx/add-test-extensions! :mongo)

(doseq [feature [:test/time-type
                 :test/timestamptz-type]]
  (defmethod driver/database-supports? [:mongo feature]
    [_driver _feature _database]
    false))

;; During tests don't treat Mongo as having FK support
(defmethod driver/database-supports? [:mongo :foreign-keys] [_driver _feature _db] (not config/is-test?))

(defn ssl-required?
  "Returns if the mongo server requires an SSL connection."
  []
  (contains? #{"true" "1"} (System/getenv "MB_TEST_MONGO_REQUIRES_SSL")))

(defn- ssl-params
  "Returns the Metabase connection parameters needed for an SSL connection."
  []
  {:ssl true
   :ssl-use-client-auth true
   :client-ssl-key-value (-> "ssl/mongo/metabase.key" io/resource slurp)
   :client-ssl-cert (-> "ssl/mongo/metabase.crt" io/resource slurp)
   :ssl-cert (-> "ssl/mongo/metaca.crt" io/resource slurp)})

(defn conn-details
  "Extends `details` with the parameters necessary for an SSL connection."
  [details]
  (cond->> details
    (ssl-required?) (merge (ssl-params))))

(defmethod tx/dbdef->connection-details :mongo
  [_driver _connection-type dbdef]
  (conn-details (merge
                 {:dbname (tx/escaped-database-name dbdef)
                  :host   (tx/db-test-env-var :mongo :host "localhost")
                  :port   (Integer/parseUnsignedInt (tx/db-test-env-var :mongo :port "27017"))}
                 (when-let [user (tx/db-test-env-var :mongo :user)]
                   {:user user})
                 (when-let [password (tx/db-test-env-var :mongo :password)]
                   {:pass password}))))

(defn- destroy-db! [driver dbdef]
  (mongo.connection/with-mongo-database [^MongoDatabase db (tx/dbdef->connection-details driver :server dbdef)]
    (.drop db)))

(def ^:dynamic *remove-nil?*
  "When creating a dataset, omit any nil-valued fields from the documents."
  false)

(defmethod tx/create-db! :mongo
  [driver {:keys [table-definitions], :as dbdef} & _options]
  (mongo.connection/with-mongo-database [^MongoDatabase db (tx/dbdef->connection-details driver :db dbdef)]
    (doseq [{:keys [field-definitions table-name rows]} table-definitions]
      (doseq [{:keys [field-name indexed?]} field-definitions]
        (when indexed?
          (mongo.util/create-index (mongo.util/collection db table-name) {field-name 1})))
      (let [field-names (for [field-definition field-definitions]
                          (keyword (:field-name field-definition)))
            rows (map (fn [[i row]]
                        (into (ordered-map/ordered-map :_id (inc i))
                              (cond->> (zipmap field-names row)
                                *remove-nil?* (m/remove-vals nil?))))
                      ;; Use map-indexed so we can get an ID for each row (index + 1)
                      (map-indexed vector rows))]
        (try
          ;; Insert each row
          (mongo.util/insert-many
           (mongo.util/collection db (name table-name))
           rows)
          ;; If row already exists then nothing to do
          (catch com.mongodb.MongoException _))))))

(defmethod tx/destroy-db! :mongo
  [driver dbdef]
  (destroy-db! driver dbdef))

(defmethod ddl.i/format-name :mongo
  [_ table-or-field-name]
  (if (re-matches #"id(?:_\d+)?" table-or-field-name)
    (str "_" table-or-field-name)
    table-or-field-name))

(deftest json-raw-test
  (testing "Make sure the `raw-json-generator` util fn actually works the way we expect it to"
    (is (= "{\"x\":{{param}}}"
           (json/encode {:x (json/raw-json-generator "{{param}}")})))))

(defmethod tx/count-with-template-tag-query :mongo
  [_driver table-name field-name _param-type]
  {:projections [:count]
   :query       (json/encode
                 [{:$match {(name field-name) (json/raw-json-generator (format "{{%s}}" (name field-name)))}}
                  {:$group {"_id" nil, "count" {:$sum 1}}}
                  {:$sort {"_id" 1}}
                  {:$project {"_id" false, "count" true}}])
   :collection  (name table-name)})

(defmethod tx/count-with-field-filter-query :mongo
  [_driver table-name field-name]
  {:projections [:count]
   :query       (json/encode
                 [{:$match (json/raw-json-generator (format "{{%s}}" (name field-name)))}
                  {:$group {"_id" nil, "count" {:$sum 1}}}
                  {:$sort {"_id" 1}}
                  {:$project {"_id" false, "count" true}}])
   :collection  (name table-name)})

(defmethod tx/aggregate-column-info :mongo
  ([driver ag-type]
   (merge ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
          (when (#{:count :cum-count} ag-type)
            {:base_type :type/Integer})))

  ([driver ag-type column-metadata]
   (merge ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type column-metadata)
          (when (= ag-type :cum-count)
            {:base_type :type/Integer}))))

(defmethod tx/create-view-of-table! :mongo
  [_driver database view-name table-name {:keys [materialized?]}]
  (when materialized?
    (throw (Exception. "Material Views not supported.")))
  (mongo.connection/with-mongo-database [^MongoDatabase db database]
    (.createView db view-name table-name [])))

(defmethod tx/drop-view! :mongo
  [_driver database view-name {:keys [materialized?]}]
  (when materialized?
    (throw (Exception. "Material Views not supported.")))
  (mongo.connection/with-mongo-database [^MongoDatabase db database]
    (some-> db (mongo.util/collection view-name) .drop)))
