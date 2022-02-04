(ns metabase-enterprise.sandbox.api.dashboard-test
  "Tests for special behavior of `/api/metabase/dashboard` endpoints in the Metabase Enterprise Edition."
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sandbox.test-util :as mt.tu]
            [metabase.api.dashboard-test :as api.dashboard-test]
            [metabase.models :refer [Card Dashboard DashboardCard FieldValues Table]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(deftest params-values-test
  (testing "Return sandboxed `param_values` for Fields to which the current User only has sandboxed access."
    (mt/with-gtaps {:gtaps      {:venues
                                 {:remappings {:cat [:variable [:field-id (mt/id :venues :category_id)]]}
                                  :query      (mt.tu/restricted-column-query (mt/id))}}
                    :attributes {:cat 50}}
      (perms/grant-permissions! &group (perms/table-read-path (Table (mt/id :categories))))
      (mt/with-temp* [Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                      Card          [{card-id :id}      {:name "Dashboard Test Card"}]
                      DashboardCard [{_ :id}            {:dashboard_id       dashboard-id
                                                         :card_id            card-id
                                                         :parameter_mappings [{:card_id      card-id
                                                                               :parameter_id "foo"
                                                                               :target       [:dimension
                                                                                              [:field (mt/id :venues :name) nil]]}
                                                                              ;; should be returned normally since user has non-sandbox perms
                                                                              {:card_id      card-id
                                                                               :parameter_id "bar"
                                                                               :target       [:dimension
                                                                                              [:field (mt/id :categories :name) nil]]}
                                                                              ;; shouldn't be returned since user has no perms
                                                                              {:card_id      card-id
                                                                               :parameter_id "bax"
                                                                               :target       [:dimension
                                                                                              [:field (mt/id :users :name) nil]]}]}]]
        (is (= {(mt/id :venues :name) {:values   ["Garaje"
                                                  "Gordo Taqueria"
                                                  "La Tortilla"]
                                       :field_id (mt/id :venues :name)}

                (mt/id :categories :name) {:values                ["African"
                                                                   "American"
                                                                   "Artisan"]
                                           :human_readable_values []
                                           :field_id              (mt/id :categories :name)}}
               (let [response (:param_values (mt/user-http-request :rasta :get 200 (str "dashboard/" dashboard-id)))]
                 (into {} (for [[^String field-id-keyword m] response]
                            [(Long/parseUnsignedLong (name field-id-keyword))
                             (update m :values (partial take 3))])))))))))

(deftest chain-filter-sandboxed-field-values-test
  (testing "When chain filter endpoints would normally return cached FieldValues (#13832), make sure sandboxing is respected"
    (mt/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
      (mt/with-temp-vals-in-db FieldValues (u/the-id (db/select-one-id FieldValues :field_id (mt/id :categories :name))) {:values ["Good" "Bad"]}
        (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard]}]
          (testing "GET /api/dashboard/:id/params/:param-key/values"
            (api.dashboard-test/let-url [url (api.dashboard-test/chain-filter-values-url dashboard "_CATEGORY_NAME_")]
              (is (= ["African" "American"]
                     (take 2 (mt/user-http-request :rasta :get 200 url))))))
          (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
            (api.dashboard-test/let-url [url (api.dashboard-test/chain-filter-search-url dashboard "_CATEGORY_NAME_" "a")]
              (is (= ["African" "American"]
                     (mt/user-http-request :rasta :get 200 url))))))))))

(deftest add-card-parameter-mapping-permissions-test
  (testing "POST /api/dashboard/:id/cards"
    (testing "Should check current user's data permissions for the `parameter_mapping`"
      (mt/with-gtaps {:gtaps {:venues {}}}
        (api.dashboard-test/do-with-add-card-parameter-mapping-permissions-fixtures
         (fn [{:keys [card-id dashboard-id mappings add-card! dashcards]}]
           (testing "Should be able to add a card with `parameter_mapping` with only sandboxed perms"
             (perms/grant-permissions! (group/all-users) (perms/table-segmented-query-path (mt/id :venues)))
             (is (schema= {:card_id            (s/eq card-id)
                           :parameter_mappings [(s/one
                                                 {:parameter_id (s/eq "_CATEGORY_ID_")
                                                  :target       (s/eq ["dimension" ["field" (mt/id :venues :category_id) nil]])
                                                  s/Keyword     s/Any}
                                                 "mapping")]
                           s/Keyword           s/Any}
                          (add-card! 200)))
             (is (schema= [(s/one {:card_id            (s/eq card-id)
                                   :parameter_mappings (s/eq mappings)
                                   s/Keyword           s/Any}
                                  "DashboardCard")]
                          (dashcards))))))))))

(deftest update-cards-parameter-mapping-permissions-test
  (testing "PUT /api/dashboard/:id/cards"
    (testing "Should check current user's data permissions for the `parameter_mapping`"
      (mt/with-gtaps {:gtaps {:venues {}}}
        (api.dashboard-test/do-with-update-cards-parameter-mapping-permissions-fixtures
         (fn [{:keys [dashboard-id card-id original-mappings update-mappings! update-size! new-dashcard-info new-mappings]}]
           (testing "Should be able to update `:parameter_mappings` *with* only sandboxed perms"
             (perms/grant-permissions! (group/all-users) (perms/table-segmented-query-path (mt/id :venues)))
             (is (= {:status "ok"}
                    (update-mappings! 200)))
             (is (= new-mappings
                    (db/select-one-field :parameter_mappings DashboardCard :dashboard_id dashboard-id, :card_id card-id))))))))))
