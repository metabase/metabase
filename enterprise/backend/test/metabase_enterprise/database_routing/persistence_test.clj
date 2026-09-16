(ns ^:mb/driver-tests metabase-enterprise.database-routing.persistence-test
  "A Model's persisted cache table holds the results as seen through the Router Database's own connection. A user
  routed to a Destination Database must never read from it, whether the Model is referenced as a source table or via
  a native `{{#N}}` template tag."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.database-routing.persistence-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest persistence-disabled-when-db-routed-test
  (mt/test-drivers (mt/normal-drivers-with-feature :persist-models :database-routing)
    (mt/with-premium-features #{:database-routing}
      (mt/dataset test-data
        (mt/with-persistence-enabled! [persist-models!]
          (mt/with-temp [:model/Card model {:type          :model
                                            :dataset_query (mt/mbql-query products)}]
            (mt/as-admin (persist-models!))
            (let [persisted-info (t2/select-one :model/PersistedInfo :database_id (mt/id) :card_id (:id model))]
              (is (= "persisted" (:state persisted-info)))
              (met/with-user-attributes! :rasta {"db_name" "destination-db"}
                ;; The Destination Database points at the very same physical database as the Router, so the persisted
                ;; cache table is reachable through it: exactly the setup where reading the cache would bypass whatever
                ;; the destination connection is meant to restrict.
                (mt/with-temp [:model/DatabaseRouter _ {:database_id    (mt/id)
                                                        :user_attribute "db_name"}
                               :model/Database _ {:engine             driver/*driver*
                                                  :name               "destination-db"
                                                  :details            (:details (mt/db))
                                                  :router_database_id (mt/id)}
                               :model/Card source-card {:dataset_query (mt/mbql-query nil
                                                                         {:aggregation  [:count]
                                                                          :source-table (str "card__" (:id model))})}
                               :model/Card native-card {:dataset_query
                                                        (lib/native-query (mt/metadata-provider)
                                                                          (format "SELECT count(*) FROM {{#%d}} AS m"
                                                                                  (:id model)))}]
                  (letfn [(run-card [user card]
                            (mt/user-http-request user :post 202 (format "card/%d/query" (u/the-id card))))]
                    (doseq [[description card] [["Model as a source table" source-card]
                                                ["Model referenced via a native {{#N}} template tag" native-card]]]
                      (testing description
                        (let [routed-result (run-card :rasta card)
                              admin-result  (run-card :crowberto card)]
                          (testing "routed user (rasta) does not hit the model cache"
                            (is (= 200 (-> routed-result mt/rows ffirst)))
                            (is (not (str/includes? (-> routed-result :data :native_form :query)
                                                    (:table_name persisted-info)))
                                "Erroneously used the persisted model cache"))
                          (testing "admin (resolves to the Router Database) hits the model cache"
                            (is (str/includes? (-> admin-result :data :native_form :query)
                                               (:table_name persisted-info))
                                "Did not use the persisted model cache")))))))))))))))
