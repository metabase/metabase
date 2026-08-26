(ns ^:mb/driver-tests metabase-enterprise.database-routing.embedding-test
  "Tests for database routing with embedding functionality."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.e2e-test :refer [execute-statement! with-routing-setup!]]
   [metabase-enterprise.test :as met]
   [metabase.driver.settings :as driver.settings]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(defn random-embedding-secret-key [] (u.random/secure-hex 32))

(def ^:dynamic *secret-key* nil)

(defn sign [claims] (jwt/sign claims *secret-key*))

(defn do-with-new-secret-key! [f]
  (binding [*secret-key* (random-embedding-secret-key)]
    (mt/with-temporary-setting-values [embedding-secret-key *secret-key*]
      (f))))

(defmacro with-new-secret-key! {:style/indent 0} [& body]
  `(do-with-new-secret-key! (fn [] ~@body)))

(defmacro with-embedding-enabled-and-new-secret-key! {:style/indent 0} [& body]
  `(mt/with-temporary-setting-values [~'enable-embedding-static true
                                      ~'enable-embedding-interactive true]
     (with-new-secret-key!
       ~@body)))

(defn card-token [card-or-id & [additional-token-keys]]
  (sign (merge {:resource {:question (u/the-id card-or-id)}
                :params   {}}
               additional-token-keys)))

(defn dash-token [dash-or-id & [additional-token-keys]]
  (sign (merge {:resource {:dashboard (u/the-id dash-or-id)}
                :params   {}}
               additional-token-keys)))

(deftest guest-embedding-with-database-routing-test
  (testing "Guest embedding should work with database routing by bypassing routing"
    (mt/with-premium-features #{:database-routing}
      (binding [driver.settings/*allow-testing-h2-connections* true]
        (with-routing-setup! [router-db [[destination-db "destination-db"]]]
          ;; Set up database routing configuration
          (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                  :user_attribute "db_name"}
                         :model/Card card {:enable_embedding true
                                           :dataset_query     {:database (u/the-id router-db)
                                                               :type     :query
                                                               :query    {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}}}]
            ;; Add test data to both databases
            (execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router-data')")
            (execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('destination-data')")
            (with-embedding-enabled-and-new-secret-key!
              (testing "Guest embedding should successfully query the router database"
                (let [token    (card-token card)
                      response (client/client :get 202 (str "embed/card/" token "/query"))]
                  (is (= [["router-data"]] (mt/rows response))
                      "Guest embedding should return data from router database, not destination database"))))))))))

(deftest guest-embedding-dashboard-param-values-with-database-routing-test
  (testing "Guest embed dashboard filter dropdowns bypass routing and use the router database (UXW-4881)"
    (mt/with-premium-features #{:database-routing}
      (binding [driver.settings/*allow-testing-h2-connections* true]
        (with-routing-setup! [router-db [[destination-db "destination-db"]]]
          (let [table-id (t2/select-one-pk :model/Table :db_id (u/the-id router-db))
                field-id (t2/select-one-pk :model/Field :table_id table-id)]
            (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                    :user_attribute "db_name"}
                           :model/Card card {:dataset_query {:database (u/the-id router-db)
                                                             :type     :query
                                                             :query    {:source-table table-id}}}
                           :model/Dashboard dashboard {:enable_embedding true
                                                       :embedding_params {:str "enabled"}
                                                       :parameters       [{:id   "_STR_"
                                                                           :name "Str"
                                                                           :slug "str"
                                                                           :type "string/="}]}
                           :model/DashboardCard _ {:dashboard_id       (u/the-id dashboard)
                                                   :card_id            (u/the-id card)
                                                   :parameter_mappings [{:parameter_id "_STR_"
                                                                         :card_id      (u/the-id card)
                                                                         :target       [:dimension [:field field-id nil]]}]}]
              (execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router-data')")
              (execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('destination-data')")
              (with-embedding-enabled-and-new-secret-key!
                (testing "GET /api/embed/dashboard/:token/params/:param-key/values"
                  (let [token    (dash-token dashboard)
                        response (client/client :get 200 (str "embed/dashboard/" token "/params/_STR_/values"))]
                    (is (= {:values          [["router-data"]]
                            :has_more_values false}
                           response)
                        "Dropdown values should come from the router database, not a destination database")))))))))))

(deftest guest-embedding-card-param-values-with-database-routing-test
  (testing "Guest embed card filter dropdowns bypass routing and use the router database (UXW-4881)"
    (mt/with-premium-features #{:database-routing}
      (binding [driver.settings/*allow-testing-h2-connections* true]
        (with-routing-setup! [router-db [[destination-db "destination-db"]]]
          (let [table-id (t2/select-one-pk :model/Table :db_id (u/the-id router-db))
                field-id (t2/select-one-pk :model/Field :table_id table-id)]
            (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                    :user_attribute "db_name"}
                           :model/Card card {:enable_embedding true
                                             :embedding_params {:str "enabled"}
                                             :dataset_query    {:database (u/the-id router-db)
                                                                :type     :native
                                                                :native   {:query         "SELECT count(*) FROM \"my_database_name\" WHERE {{str}}"
                                                                           :template-tags {"str" {:id           "_STR_"
                                                                                                  :name         "str"
                                                                                                  :display-name "Str"
                                                                                                  :type         :dimension
                                                                                                  :dimension    [:field field-id nil]
                                                                                                  :widget-type  :string/=}}}}}]
              (execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router-data')")
              (execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('destination-data')")
              (with-embedding-enabled-and-new-secret-key!
                (testing "GET /api/embed/card/:token/params/:param-key/values"
                  (let [token    (card-token card)
                        response (client/client :get 200 (str "embed/card/" token "/params/_STR_/values"))]
                    (is (=? {:values          [["router-data"]]
                             :has_more_values false}
                            response)
                        "Dropdown values should come from the router database, not a destination database")))))))))))

(deftest preview-embedding-uses-router-database-test
  (testing "Preview embed queries bypass routing so the preview matches the published embed (UXW-4881)"
    (mt/with-premium-features #{:database-routing}
      (binding [driver.settings/*allow-testing-h2-connections* true]
        (met/with-user-attributes!
          :crowberto
          {"db_name" "destination-db"}
          (with-routing-setup! [router-db [[destination-db "destination-db"]]]
            (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                    :user_attribute "db_name"}
                           :model/Card card {:dataset_query {:database (u/the-id router-db)
                                                             :type     :query
                                                             :query    {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}}}]
              (execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router-data')")
              (execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('destination-data')")
              (with-embedding-enabled-and-new-secret-key!
                (testing "GET /api/preview_embed/card/:token/query"
                  (let [token    (card-token card {:_embedding_params {}})
                        response (mt/user-http-request :crowberto :get 202 (str "preview_embed/card/" token "/query"))]
                    (is (= [["router-data"]] (mt/rows response))
                        "Preview should show router-database data even though the admin's attribute routes to a destination")))))))))))
