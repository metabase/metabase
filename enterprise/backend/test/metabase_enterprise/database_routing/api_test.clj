(ns metabase-enterprise.database-routing.api-test
  (:require
   [clojure.test :refer [deftest testing is use-fixtures]]
   [metabase.driver :as driver]
   [metabase.driver.h2]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn with-h2-fixture [f]
  (binding [metabase.driver.h2/*allow-testing-h2-connections* true]
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
    (let [[{db-id :id}] (mt/user-http-request :crowberto :post 200 "ee/database-routing/mirror-database"
                                              {:router_database_id (mt/id)
                                               :mirrors [{:name "mirror database"
                                                          :details (:details (mt/db))}]})]
      (is (t2/exists? :model/Database
                      :router_database_id (mt/id)
                      :id db-id)))))

(deftest invalid-details-doesnt-matter
  (mt/with-model-cleanup [:model/Database]
    (with-redefs [driver/can-connect? (fn [_]
                                        (throw (ex-info "nope" {})))]
      (let [[{db-id :id}] (mt/user-http-request :crowberto :post 200 "ee/database-routing/mirror-database"
                                                {:router_database_id (mt/id)
                                                 :mirrors [{:name "mirror database"
                                                            :details {:db "meow"}}]})]
        (is (t2/exists? :model/Database
                        :router_database_id (mt/id)
                        :id db-id))))))

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
                 :model/Database {mirror-db-id :id} {:router_database_id db-id}]
    (mt/user-http-request :crowberto :put 200 (str "ee/database-routing/router-database/" db-id) {:user_attribute nil})
    (is (not (t2/exists? :model/Database :id mirror-db-id)))
    (is (not (t2/exists? :model/DatabaseRouter :id router-id)))))

(deftest endpoint-are-locked-down-to-superusers-only
  (testing "POST /api/ee/database-routing/mirror-database"
    (mt/with-model-cleanup [:model/Database]
      (mt/user-http-request :rasta :post 403 "ee/database-routing/mirror-database"
                            {:router_database_id (mt/id)
                             :mirrors [{:name "mirror database"
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
           (:router_user_attribute (mt/user-http-request :crowberto :get 200 (str "database/" db-id)))))))

(deftest mirror-databases-are-hidden-from-regular-database-api
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/DatabaseRouter _ {:database_id db-id :user_attribute "foo"}
                 :model/Database {mirror-db-id :id} {:router_database_id db-id}]
    (testing "GET /database/:id"
      (mt/user-http-request :crowberto :get 404 (str "database/" mirror-db-id))
      (testing "If we pass the `include_mirror_databases` param, it is included"
        (mt/user-http-request :crowberto :get 200 (str "database/" mirror-db-id "?include_mirror_databases=true")))
      (testing "If a regular user passees `include_mirror_databases` it is hidden"
        (mt/user-http-request :rasta :get 404 (str "database/" mirror-db-id "?include_mirror_databases=true"))))
    (testing "GET /database/"
      (is (not-any? #(= (:id %) mirror-db-id)
                    (:data (mt/user-http-request :crowberto :get 200 "database/"))))
      (testing "If we pass the `include_mirror_databases` param it is included"
        (is (some #(= (:id %) mirror-db-id)
                  (:data (mt/user-http-request :crowberto :get 200 (str "database/?include_mirror_databases=" db-id))))))
      (testing "Regular users can't do this"
        (is (not-any? #(= (:id %) mirror-db-id)
                      (:data (mt/user-http-request :rasta :get 200 (str "database/?include_mirror_databases=" db-id)))))))
    (testing "PUT /database/:id should work normally"
      (mt/user-http-request :crowberto :put 200 (str "database/" mirror-db-id)))
    (testing "GET /database/:id/usage_info"
      (mt/user-http-request :crowberto :get 404 (str "database/" mirror-db-id "/usage_info")))
    (testing "GET /database/:id/metadata"
      (mt/user-http-request :crowberto :get 404 (str "database/" mirror-db-id "/metadata")))
    (testing "GET /database/:id/autocomplete_suggestions"
      (mt/user-http-request :crowberto :get 404 (str "database/" mirror-db-id "/autocomplete_suggestions")))
    (testing "GET /database/:id/card_autocomplete_suggestions"
      (mt/user-http-request :crowberto :get 404 (str "database/" mirror-db-id "/card_autocomplete_suggestions?query=foobar")))
    (testing "GET /database/:id/fields"
      (mt/user-http-request :crowberto :get 404 (str "database/" mirror-db-id "/fields")))
    (testing "GET /database/:id/idfields"
      (mt/user-http-request :crowberto :get 404 (str "database/" mirror-db-id "/idfields")))
    (testing "POST /database/:id/sync_schema"
      (mt/user-http-request :crowberto :post 404 (str "database/" mirror-db-id "/sync_schema")))
    (testing "POST /database/:id/dismiss_spinner"
      (mt/user-http-request :crowberto :post 404 (str "database/" mirror-db-id "/dismiss_spinner")))
    (testing "POST /database/:id/rescan_values"
      (mt/user-http-request :crowberto :post 404 (str "database/" mirror-db-id "/rescan_values")))
    (testing "POST /database/:id/discard_values"
      (mt/user-http-request :crowberto :post 404 (str "database/" mirror-db-id "/discard_values")))
    (testing "POST /database/:id/syncable_schemas"
      (mt/user-http-request :crowberto :get 404 (str "database/" mirror-db-id "/syncable_schemas")))
    (testing "GET /database/:id/schemas"
      (mt/user-http-request :crowberto :get 404 (str "database/" mirror-db-id "/schemas")))))
