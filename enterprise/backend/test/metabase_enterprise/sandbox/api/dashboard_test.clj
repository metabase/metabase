(ns metabase-enterprise.sandbox.api.dashboard-test
  "Tests for special behavior of `/api/metabase/dashboard` endpoints in the Metabase Enterprise Edition."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.api.dashboard-test :as api.dashboard-test]
   [metabase.models :refer [Card Dashboard DashboardCard FieldValues]]
   [metabase.models.params.chain-filter-test :as chain-filter-test]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [schema.core :as s]
   [toucan.db :as db]))

(deftest chain-filter-sandboxed-field-values-test
  (testing "When chain filter endpoints would normally return cached FieldValues (#13832), make sure sandboxing is respected"
    (met/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
      (mt/with-temp-vals-in-db FieldValues (u/the-id (db/select-one-id FieldValues :field_id (mt/id :categories :name))) {:values ["Good" "Bad"]}
        (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard]}]
          (testing "GET /api/dashboard/:id/params/:param-key/values"
            (api.dashboard-test/let-url [url (api.dashboard-test/chain-filter-values-url dashboard "_CATEGORY_NAME_")]
              (is (= {:values          ["African" "American"]
                      :has_more_values false}
                     (chain-filter-test/take-n-values 2 (mt/user-http-request :rasta :get 200 url))))))
          (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
            (api.dashboard-test/let-url [url (api.dashboard-test/chain-filter-search-url dashboard "_CATEGORY_NAME_" "a")]
              (is (= {:values          ["African" "American"]
                      :has_more_values false}
                     (mt/user-http-request :rasta :get 200 url))))))))))

(deftest add-card-parameter-mapping-permissions-test
  (testing "POST /api/dashboard/:id/cards"
    (testing "Should check current user's data permissions for the `parameter_mapping`"
      (met/with-gtaps {:gtaps {:venues {}}}
        (api.dashboard-test/do-with-add-card-parameter-mapping-permissions-fixtures
         (fn [{:keys [card-id mappings add-card! dashcards]}]
           (testing "Should be able to add a card with `parameter_mapping` with only sandboxed perms"
             (perms/grant-permissions! (perms-group/all-users) (perms/table-segmented-query-path (mt/id :venues)))
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
      (met/with-gtaps {:gtaps {:venues {}}}
        (api.dashboard-test/do-with-update-cards-parameter-mapping-permissions-fixtures
         (fn [{:keys [dashboard-id card-id update-mappings! new-mappings]}]
           (testing "Should be able to update `:parameter_mappings` *with* only sandboxed perms"
             (perms/grant-permissions! (perms-group/all-users) (perms/table-segmented-query-path (mt/id :venues)))
             (is (= {:status "ok"}
                    (update-mappings! 200)))
             (is (= new-mappings
                    (db/select-one-field :parameter_mappings DashboardCard :dashboard_id dashboard-id, :card_id card-id))))))))))

(deftest parameters-with-source-is-card-test
  (testing "dashboard with a parameter that has source is a card, it should respects sandboxing"
    (met/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (mt/with-temp*
        [Card      [{card-id         :id}
                    (merge (mt/card-with-source-metadata-for-query (mt/mbql-query categories))
                           {:database_id     (mt/id)
                            :table_id        (mt/id :categories)})]
         Dashboard [{dashboard-id :id}
                    {:parameters [{:id                   "abc"
                                   :type                 "category"
                                   :name                 "CATEGORY"
                                   :values_source_type   "card"
                                   :values_source_config {:card_id     card-id
                                                          :value_field (mt/$ids $categories.name)}}]}]]

        (testing "when getting values"
          (let [get-values (fn [user]
                             (mt/user-http-request user :get 200 (api.dashboard-test/chain-filter-values-url dashboard-id "abc")))]

            (is (> (-> (get-values :crowberto) :values count) 3))
            (is (= {:values          ["African" "American" "Artisan"]
                    :has_more_values false}
                   (get-values :rasta)))))


        (testing "when search values"
          (let [search (fn [user]
                         (mt/user-http-request user :get 200 (api.dashboard-test/chain-filter-search-url dashboard-id "abc" "bbq")))]
            (is (= {:values          ["BBQ"]
                    :has_more_values false}
                   (search :crowberto)))

            (is (= {:values          []
                    :has_more_values false}
                   (search :rasta)))))))))
