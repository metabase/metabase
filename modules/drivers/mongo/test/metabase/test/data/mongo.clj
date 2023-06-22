(ns metabase.test.data.mongo
  (:require
   [cheshire.core :as json]
   [cheshire.generate :as json.generate]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.mongo.util :refer [with-mongo-connection]]
   [metabase.test.data.interface :as tx]
   [monger.collection :as mcoll]
   [monger.core :as mg])
  (:import
   (com.fasterxml.jackson.core JsonGenerator)))

(set! *warn-on-reflection* true)

(tx/add-test-extensions! :mongo)

(defmethod tx/supports-time-type? :mongo [_driver] false)
(defmethod tx/supports-timestamptz-type? :mongo [_driver] false)

;; during unit tests don't treat Mongo as having FK support
(defmethod driver/supports? [:mongo :foreign-keys] [_ _] (not config/is-test?))

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
  (with-mongo-connection [^com.mongodb.DB mongo-connection (tx/dbdef->connection-details driver :server dbdef)]
    (mg/drop-db (.getMongo mongo-connection) (tx/escaped-database-name dbdef))))

(def ^:dynamic *remove-nil?*
  "When creating a dataset, omit any nil-valued fields from the documents."
  false)

(defmethod tx/create-db! :mongo
  [driver {:keys [table-definitions], :as dbdef} & {:keys [skip-drop-db?], :or {skip-drop-db? false}}]
  (when-not skip-drop-db?
    (destroy-db! driver dbdef))
  (with-mongo-connection [mongo-db (tx/dbdef->connection-details driver :db dbdef)]
    (doseq [{:keys [field-definitions table-name rows]} table-definitions]
      (let [field-names (for [field-definition field-definitions]
                          (keyword (:field-name field-definition)))]
        ;; Use map-indexed so we can get an ID for each row (index + 1)
        (doseq [[i row] (map-indexed vector rows)]
          (try
            ;; Insert each row
            (mcoll/insert mongo-db (name table-name) (into (ordered-map/ordered-map :_id (inc i))
                                                           (cond->> (zipmap field-names row)
                                                             *remove-nil?* (m/remove-vals nil?))))
            ;; If row already exists then nothing to do
            (catch com.mongodb.MongoException _)))))))

(defmethod tx/destroy-db! :mongo
  [driver dbdef]
  (destroy-db! driver dbdef))

(defmethod ddl.i/format-name :mongo
  [_ table-or-field-name]
  (if (re-matches #"id(?:_\d+)?" table-or-field-name)
    (str "_" table-or-field-name)
    table-or-field-name))

(defn- json-raw
  "Wrap a string so it will be spliced directly into resulting JSON as-is. Analogous to HoneySQL `raw`."
  [^String s]
  (reify json.generate/JSONable
    (to-json [_ generator]
      (.writeRawValue ^JsonGenerator generator s))))

(deftest json-raw-test
  (testing "Make sure the `json-raw` util fn actually works the way we expect it to"
    (is (= "{\"x\":{{param}}}"
           (json/generate-string {:x (json-raw "{{param}}")})))))

(defmethod tx/count-with-template-tag-query :mongo
  [_driver table-name field-name _param-type]
  {:projections [:count]
   :query       (json/generate-string
                 [{:$match {(name field-name) (json-raw (format "{{%s}}" (name field-name)))}}
                  {:$group {"_id" nil, "count" {:$sum 1}}}
                  {:$sort {"_id" 1}}
                  {:$project {"_id" false, "count" true}}])
   :collection  (name table-name)})

(defmethod tx/count-with-field-filter-query :mongo
  [_driver table-name field-name]
  {:projections [:count]
   :query       (json/generate-string
                 [{:$match (json-raw (format "{{%s}}" (name field-name)))}
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
