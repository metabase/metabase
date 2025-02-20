(ns metabase-enterprise.database-routing.api-test
  (:require [metabase.test :as mt]
            [clojure.test :refer [deftest testing is use-fixtures]]
            [toucan2.core :as t2]
            [metabase.driver :as driver]))

(defn with-h2-fixture [f]
  (binding [metabase.driver.h2/*allow-testing-h2-connections* true]
    (f)))

(defn with-premium-feature-fixture [f]
  (mt/with-premium-features #{:database-routing}
    (f)))

(defn with-test-db-is-router-db [f]
  (mt/with-temp [:model/DatabaseRouter _ {:db_id (mt/id)
                                          :user_attribute "meow"}]
    (f)))

(use-fixtures :each with-h2-fixture with-premium-feature-fixture with-test-db-is-router-db)

(deftest creation-works
  (mt/with-model-cleanup [:model/Database]
    (let [[{db-id :id}] (mt/user-http-request :crowberto :post 200 "ee/database-routing/"
                                              {:router_database_id (mt/id)
                                               :mirrors [{:name "mirror database"
                                                          :details (:details (mt/db))}]})]
      (is (t2/exists? :model/Database
                      :primary_database_id (mt/id)
                      :id db-id)))))

(deftest invalid-details-returns-an-error
  (mt/with-model-cleanup [:model/Database]
    (with-redefs [driver/can-connect? (fn [& _]
                                        (throw (ex-info "nope" {})))]
      (is (= [{:message "nope" :name "mirror database"}]
             (mt/user-http-request :crowberto :post 400 "ee/database-routing/"
                                   {:router_database_id (mt/id)
                                    :mirrors [{:name "mirror database"
                                               :details {:db "not gonna work"}}]}))))))

(deftest creation-is-atomic
  (mt/with-model-cleanup [:model/Database]
    (let [calls (atom 0)]
      (with-redefs [driver/can-connect? (fn [& _]
                                          (if (<= @calls 0)
                                            (do
                                              (swap! calls inc)
                                              true)
                                            (throw (ex-info "nope" {}))))]
        (is (= [{:message "nope" :name "mirror database 2"}]
               (mt/user-http-request :crowberto :post 400 "ee/database-routing/"
                                     {:router_database_id (mt/id)
                                      :mirrors [{:name "mirror database"
                                                 :details (:details (mt/db))}
                                                {:name "mirror database 2"
                                                 :details (:details (mt/db))}]})))
        (is (not (t2/exists? :model/Database :primary_database_id (mt/id))))))))
