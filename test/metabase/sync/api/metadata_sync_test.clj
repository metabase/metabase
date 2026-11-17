(ns metabase.sync.api.metadata-sync-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.metadata-sync.document :as document]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server))

(def ^:private changes-url "warehouse/metadata/changes")
(def ^:private request-url "warehouse/metadata/request")
(def ^:private apply-url "warehouse/metadata/apply")

(defn- add-tables!
  "Add Tables, each `[schema name field-names]`, to the Database with `db-id`, and return their ids by name."
  [db-id tables]
  (into {}
        (for [[table-schema table-name field-names] tables]
          (let [table-id (t2/insert-returning-pk! :model/Table {:db_id db-id :schema table-schema :name table-name
                                                                :active true})]
            (doseq [[i field-name] (map-indexed vector field-names)]
              (t2/insert! :model/Field {:table_id table-id :name field-name :base_type :type/Text
                                        :database_type "TEXT" :position i :database_position i}))
            [table-name table-id]))))

(def ^:private some-tables
  [[nil "loose" ["a"]]
   ["public" "orders" ["id" "total" "user_id"]]
   ["public" "people" ["id" "name"]]])

(defn- field-id [table-id field-name]
  (t2/select-one-pk :model/Field :table_id table-id :name field-name))

(defn- request
  "A request for the h2 Database named `database-name`, with `more` keys."
  ([database-name]
   (request database-name {}))
  ([database-name more]
   (merge {:database database-name :engine "h2"} more)))

;;; ------------------------------------------------ Sender ------------------------------------------------

(deftest first-answer-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (add-tables! db-id some-tables)
    (let [{:keys [batches] :as response} (mt/user-http-request :crowberto :post 200 changes-url (request db-name))]
      (testing "the answer names the format version, and has no cursor when nothing is left"
        (is (= {:format_version document/format-version :batches ["database" "objects"]}
               (update response :batches #(mapv :type %)))))
      (testing "the objects are every Table, in key order"
        (is (= [[nil "loose"] ["public" "orders"] ["public" "people"]]
               (mapv (juxt :schema :name) (:tables (second batches)))))))))

(deftest cursor-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (add-tables! db-id some-tables)
    (with-redefs [pages/object-field-limit 1]
      (let [first-answer (mt/user-http-request :crowberto :post 200 changes-url (request db-name))]
        (testing "a cursor with a nil schema goes through JSON and back"
          (is (= {:kind "objects" :key [nil "loose"]} (:next first-answer)))
          (is (= [["public" "orders"]]
                 (->> (mt/user-http-request :crowberto :post 200 changes-url
                                            (request db-name {:after (:next first-answer)}))
                      :batches
                      (mapcat :tables)
                      (mapv (juxt :schema :name))))))))))

(deftest superuser-only-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (testing "a user who is not a superuser gets 403 from each route"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 changes-url (request db-name))))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 request-url {:database_id db-id})))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 apply-url
                                   {:database_id db-id
                                    :response    {:format_version document/format-version :batches []}}))))))

(deftest open-source-test
  (mt/with-temp [:model/Database {db-name :name} {:initial_sync_status "complete"}]
    (testing "the routes need no premium feature"
      (mt/with-premium-features #{}
        (is (=? {:batches sequential?} (mt/user-http-request :crowberto :post 200 changes-url (request db-name))))))))

(deftest unknown-keys-are-ignored-test
  (mt/with-temp [:model/Database {db-name :name} {:initial_sync_status "complete"}]
    (testing "a request with a key this version does not know is answered, so a newer receiver is not refused"
      (is (=? {:batches sequential?}
              (mt/user-http-request :crowberto :post 200 changes-url (request db-name {:a_later_key [1 2 3]})))))))

(deftest engine-is-required-test
  (mt/with-temp [:model/Database {db-name :name} {:initial_sync_status "complete"}]
    (testing "a request with no engine is refused"
      (mt/user-http-request :crowberto :post 400 changes-url {:database db-name}))))

(defn- error-code
  "The status and the error code of a POST of `body` to `url`."
  [url body]
  (let [{:keys [status body]} (mt/user-http-request-full-response :crowberto :post url body)]
    [status (:error-code body)]))

(deftest sender-errors-test
  (testing "a name that no Database has gets 404 with its own error code"
    (is (= [404 "metadata-sync-database-not-found"] (error-code changes-url (request (mt/random-name))))))
  (let [database-name (mt/random-name)]
    (mt/with-temp [:model/Database _ {:name database-name :initial_sync_status "complete"}
                   :model/Database _ {:name database-name :initial_sync_status "complete"}]
      (testing "a name and engine that several Databases have gets 409"
        (is (= [409 "metadata-sync-database-ambiguous"] (error-code changes-url (request database-name)))))))
  (mt/with-temp [:model/Database {database-name :name} {:initial_sync_status "incomplete"}]
    (testing "a Database whose first sync is not complete gets 422"
      (is (= [422 "metadata-sync-database-not-ready"] (error-code changes-url (request database-name)))))))

;;; ------------------------------------------------ Receiver ------------------------------------------------

(deftest receiver-errors-test
  (testing "no such Database"
    (is (= [404 "metadata-sync-no-database"] (error-code request-url {:database_id Integer/MAX_VALUE}))))
  (mt/with-temp [:model/Database {db-id :id} {}]
    (testing "an answer of another format version gets 422, and nothing is written"
      (is (= [422 "metadata-sync-format-version-differs"]
             (error-code apply-url {:database_id db-id
                                    :response    {:format_version (inc document/format-version) :batches []}}))))
    (testing "a malformed answer gets 422"
      (is (= [422 "metadata-sync-malformed-response"]
             (error-code apply-url {:database_id db-id
                                    :response    {:format_version document/format-version
                                                  :batches        [{:type "objects" :tables "none"}]}}))))))

(deftest seed-over-http-test
  (mt/with-temp [:model/Database {sender :id sender-name :name} {:initial_sync_status "complete"}
                 :model/Database {receiver :id}                 {:initial_sync_status "incomplete"}]
    (let [tables (add-tables! sender some-tables)]
      (t2/update! :model/Field :id (field-id (tables "orders") "user_id")
                  {:fk_target_field_id (field-id (tables "people") "id")})
      (t2/update! :model/Field :id (field-id (tables "orders") "total")
                  {:fingerprint {:global {:distinct-count 2} :type {:type/Number {:min 1.0 :max 2.0}}}})
      (t2/insert! :model/FieldValues {:field_id (field-id (tables "orders") "total") :type :full :values [1 2]})
      (with-redefs [pages/object-field-limit 1]
        (loop [after nil rounds 1]
          (let [req      (mt/user-http-request :crowberto :post 200 request-url
                                               (cond-> {:database_id receiver} after (assoc :after after)))
                response (mt/user-http-request :crowberto :post 200 changes-url (assoc req :database sender-name))
                {:keys [next]} (mt/user-http-request :crowberto :post 200 apply-url
                                                     {:database_id receiver :response response})]
            (cond
              (nil? next)   nil
              (> rounds 20) (throw (ex-info "the seed does not end" {:rounds rounds}))
              :else         (recur next (inc rounds))))))
      (let [orders   (t2/select-one :model/Table :db_id receiver :name "orders")
            people   (t2/select-one :model/Table :db_id receiver :name "people")
            total    (t2/select-one :model/Field :table_id (:id orders) :name "total")
            user-id  (t2/select-one :model/Field :table_id (:id orders) :name "user_id")]
        (testing "the seed wrote the receiver's Tables (the test sends the sender's name: both are in one app DB)"
          (is (some? orders)))
        (testing "the receiver has the Tables, the FK, the fingerprint and the field values"
          (is (= 3 (t2/count :model/Table :db_id receiver)))
          (is (= (field-id (:id people) "id") (:fk_target_field_id user-id)))
          (is (= {:global {:distinct-count 2} :type {:type/Number {:min 1.0 :max 2.0}}} (:fingerprint total)))
          (is (= [1 2] (t2/select-one-fn :values :model/FieldValues :field_id (:id total) :type :full))))
        (testing "and its first sync is complete"
          (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Database :id receiver))))))))
