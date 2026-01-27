(ns metabase-enterprise.database-routing.api-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn with-h2-fixture [f]
  (binding [driver.settings/*allow-testing-h2-connections* true]
    (f)))

(defn with-premium-feature-fixture [f]
  (mt/with-premium-features #{:database-routing}
    (f)))

(defn with-test-db-is-router-db [f]
  (mt/with-temp [:model/DatabaseRouter _ {:database_id (mt/id)
                                          :user_attribute "meow"}]
    (f)))

(use-fixtures :each with-h2-fixture with-premium-feature-fixture with-test-db-is-router-db)

(deftest creation-works
  (mt/with-model-cleanup [:model/Database]
    (let [[{db-id :id}] (mt/user-http-request :crowberto :post 200 "ee/database-routing/destination-database"
                                              {:router_database_id (mt/id)
                                               :destinations [{:name "destination database"
                                                               :details (:details (mt/db))}]})]
      (is (t2/exists? :model/Database
                      :router_database_id (mt/id)
                      :id db-id)))))

(deftest invalid-details-doesnt-matter
  (mt/with-model-cleanup [:model/Database]
    (with-redefs [driver/can-connect? (fn [_ _]
                                        (throw (ex-info "nope" {})))]
      (let [[{db-id :id}] (mt/user-http-request :crowberto :post 200 "ee/database-routing/destination-database"
                                                {:router_database_id (mt/id)
                                                 :destinations [{:name (str (random-uuid))
                                                                 :details {:db "meow"}}]})]
        (is (t2/exists? :model/Database
                        :router_database_id (mt/id)
                        :id db-id)))
      (testing "unless you pass the `check_connection_details` flag"
        (let [db-name (str (random-uuid))]
          (is (= {(keyword db-name) {:message "nope"}}
                 (mt/user-http-request :crowberto :post 400 "ee/database-routing/destination-database?check_connection_details=true"
                                       {:router_database_id (mt/id)
                                        :destinations [{:name db-name
                                                        :details {:db "meow"}}]}))))))))

(deftest we-can-mark-an-existing-database-as-being-a-router-database
  (mt/with-temp [:model/Database {db-id :id} {}]
    (mt/with-model-cleanup [:model/DatabaseRouter]
      (mt/user-http-request :crowberto :put 200 (str "ee/database-routing/router-database/" db-id)
                            {:user_attribute "foo"})
      (is (t2/exists? :model/DatabaseRouter :database_id db-id :user_attribute "foo")))))

(deftest marking-a-nonexistent-database-as-a-router-database-fails
  (let [nonexistent-id 123456789]
    (mt/with-model-cleanup [:model/DatabaseRouter]
      (mt/user-http-request :crowberto :put 404 (str "ee/database-routing/router-database/" nonexistent-id)
                            {:user_attribute "foo"})
      (is (not (t2/exists? :model/DatabaseRouter :database_id nonexistent-id :user_attribute "foo"))))))

(deftest we-can-update-existing-router-databases-to-point-to-a-new-user-attribute
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/DatabaseRouter {router-id :id} {:database_id db-id :user_attribute "foo"}]
    (mt/user-http-request :crowberto :put 200 (str "ee/database-routing/router-database/" db-id)
                          {:user_attribute "bar"})
    (is (= "bar" (t2/select-one-fn :user_attribute :model/DatabaseRouter router-id)))))

(deftest deleting-database-routers-works
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/DatabaseRouter {router-id :id} {:database_id db-id :user_attribute "foo"}
                 :model/Database {destination-db-id :id} {:router_database_id db-id}]
    (mt/user-http-request :crowberto :put 200 (str "ee/database-routing/router-database/" db-id) {:user_attribute nil})
    ;; the destination databases are left around
    (is (t2/exists? :model/Database :id destination-db-id))
    (is (not (t2/exists? :model/DatabaseRouter :id router-id)))))

(deftest endpoint-are-locked-down-to-superusers-only
  (testing "POST /api/ee/database-routing/destination-database"
    (mt/with-model-cleanup [:model/Database]
      (mt/user-http-request :rasta :post 403 "ee/database-routing/destination-database"
                            {:router_database_id (mt/id)
                             :destinations [{:name "destination database"
                                             :details (:details (mt/db))}]})))
  (testing "PUT /api/ee/database-routing/router-database/:id"
    (mt/with-temp [:model/Database {db-id :id} {}]
      (mt/with-model-cleanup [:model/DatabaseRouter]
        (mt/user-http-request :rasta :put 403 (str "ee/database-routing/router-database/" db-id)
                              {:user_attribute "foo"})))))

(deftest router-databases-have-a-router-user-attribute-on-the-get-api
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/DatabaseRouter _ {:database_id db-id :user_attribute "foobar"}]
    (is (= "foobar"
           (:router_user_attribute (mt/user-http-request :crowberto :get 200 (str "database/" db-id)))))
    (is (contains? (into #{} (map :router_user_attribute (:data (mt/user-http-request :crowberto :get 200 "database/"))))
                   "foobar"))))

(deftest cannot-create-duplicate-names
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/DatabaseRouter _ {:database_id db-id :user_attribute "foobar"}
                 :model/Database _ {:name "fluffy" :router_database_id db-id}]
    (is (= "A destination database with that name already exists."
           (mt/user-http-request :crowberto :post 400 "ee/database-routing/destination-database"
                                 {:router_database_id db-id
                                  :destinations [{:name "fluffy"
                                                  :details (:details (mt/db))}]})))))

(deftest cannot-enable-db-routing-when-other-features-enabled
  (mt/with-temp [:model/Database {db-id :id} {:settings {:persist-models-enabled true}}]
    (is (= "Cannot enable database routing for a database with model persistence enabled"
           (mt/user-http-request :crowberto :put 400 (str "ee/database-routing/router-database/" db-id)
                                 {:user_attribute "db_name"}))))
  (mt/with-temp [:model/Database {db-id :id} {:settings {:database-enable-actions true}}]
    (is (= "Cannot enable database routing for a database with actions enabled"
           (mt/user-http-request :crowberto :put 400 (str "ee/database-routing/router-database/" db-id)
                                 {:user_attribute "db_name"}))))
  (mt/with-temp [:model/Database {db-id :id} {:uploads_enabled true}]
    (is (= "Cannot enable database routing for a database with uploads enabled"
           (mt/user-http-request :crowberto :put 400 (str "ee/database-routing/router-database/" db-id)
                                 {:user_attribute "db_name"}))))
  (mt/with-temp [:model/Database {router-db-id :id} {}
                 :model/Database {db-id :id} {:router_database_id router-db-id}]
    (is (= "Cannot make a destination database a router database"
           (mt/user-http-request :crowberto :put 400 (str "ee/database-routing/router-database/" db-id)
                                 {:user_attribute "db_name"}))))
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Transform _ {:name   "test transform"
                                     :source {:type  "query"
                                              :query {:database db-id
                                                      :type     "native"
                                                      :native   {:query "SELECT 1"}}}
                                     :target {:type   "table"
                                              :schema "transforms"
                                              :name   "test_table"}}]
    (is (= "Cannot enable database routing for a database that has transforms"
           (mt/user-http-request :crowberto :put 400 (str "ee/database-routing/router-database/" db-id)
                                 {:user_attribute "db_name"})))))

(deftest can-delete-router-databases
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Database {dest-db-id :id} {:router_database_id db-id}
                 :model/DatabaseRouter _ {:database_id db-id :user_attribute "foo"}]
    (mt/user-http-request :crowberto :delete 204 (str "database/" db-id))
    (is (not (t2/exists? :model/Database dest-db-id)))
    (is (not (t2/exists? :model/Database db-id)))))

(deftest destination-databases-are-hidden-from-regular-database-api
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/DatabaseRouter _ {:database_id db-id :user_attribute "foo"}
                 :model/Database {destination-db-id :id} {:router_database_id db-id}]
    (testing "GET /database/:id"
      (testing "Superusers can get destination DBs"
        (mt/user-http-request :crowberto :get 200 (str "database/" destination-db-id)))
      (testing "Regular users can not."
        (mt/user-http-request :rasta :get 403 (str "database/" destination-db-id))))
    (testing "GET /database/"
      (is (not-any? #(= (:id %) destination-db-id)
                    (:data (mt/user-http-request :crowberto :get 200 "database/"))))
      (testing "If we pass the `router_database_id` param it is included"
        (is (some #(= (:id %) destination-db-id)
                  (:data (mt/user-http-request :crowberto :get 200 (str "database/?router_database_id=" db-id))))))
      (testing "Regular users can't do this"
        (is (not-any? #(= (:id %) destination-db-id)
                      (:data (mt/user-http-request :rasta :get 200 (str "database/?router_database_id=" db-id))))))
      (testing "Unless they have manage-database permissions"
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) db-id :perms/manage-database :yes)
          (perms/set-database-permission! (perms/all-users-group) db-id :perms/create-queries :query-builder-and-native)
          (t2/select :model/DataPermissions :db_id db-id :perm_type "perms/create-queries")
          (is (some #(= (:id %) destination-db-id)
                    (:data (mt/user-http-request :rasta :get 200 (str "database/?router_database_id=" db-id)))))
          (perms/set-database-permission! (perms/all-users-group) db-id :perms/manage-database :no)
          (is (not (some #(= (:id %) destination-db-id)
                         (:data (mt/user-http-request :rasta :get 200 (str "database/?router_database_id=" db-id)))))))))
    (testing "PUT /database/:id should work normally"
      (mt/user-http-request :crowberto :put 200 (str "database/" destination-db-id)))
    (testing "GET /database/:id/usage_info"
      (mt/user-http-request :crowberto :get 404 (str "database/" destination-db-id "/usage_info")))
    (testing "GET /database/:id/metadata"
      (mt/user-http-request :crowberto :get 404 (str "database/" destination-db-id "/metadata")))
    (testing "GET /database/:id/autocomplete_suggestions"
      (mt/user-http-request :crowberto :get 404 (str "database/" destination-db-id "/autocomplete_suggestions")))
    (testing "GET /database/:id/card_autocomplete_suggestions"
      (mt/user-http-request :crowberto :get 404 (str "database/" destination-db-id "/card_autocomplete_suggestions?query=foobar")))
    (testing "GET /database/:id/fields"
      (mt/user-http-request :crowberto :get 404 (str "database/" destination-db-id "/fields")))
    (testing "GET /database/:id/idfields"
      (mt/user-http-request :crowberto :get 404 (str "database/" destination-db-id "/idfields")))
    (testing "POST /database/:id/sync_schema"
      (mt/user-http-request :crowberto :post 404 (str "database/" destination-db-id "/sync_schema")))
    (testing "POST /database/:id/dismiss_spinner"
      (mt/user-http-request :crowberto :post 404 (str "database/" destination-db-id "/dismiss_spinner")))
    (testing "POST /database/:id/rescan_values"
      (mt/user-http-request :crowberto :post 404 (str "database/" destination-db-id "/rescan_values")))
    (testing "POST /database/:id/discard_values"
      (mt/user-http-request :crowberto :post 404 (str "database/" destination-db-id "/discard_values")))
    (testing "POST /database/:id/syncable_schemas"
      (mt/user-http-request :crowberto :get 404 (str "database/" destination-db-id "/syncable_schemas")))
    (testing "GET /database/:id/schemas"
      (mt/user-http-request :crowberto :get 404 (str "database/" destination-db-id "/schemas")))))
