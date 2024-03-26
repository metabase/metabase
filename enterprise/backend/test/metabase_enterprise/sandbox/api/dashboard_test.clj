(ns metabase-enterprise.sandbox.api.dashboard-test
  "Tests for special behavior of `/api/metabase/dashboard` endpoints in the Metabase Enterprise Edition."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.api.dashboard-test :as api.dashboard-test]
   [metabase.models :refer [Card Dashboard DashboardCard FieldValues]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.params.chain-filter]
   [metabase.models.params.chain-filter-test :as chain-filter-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest params-values-test
  (testing "Return sandboxed `param_values` for Fields to which the current User only has sandboxed access."
    (met/with-gtaps! {:gtaps      {:venues
                                  {:remappings {:cat [:variable [:field-id (mt/id :venues :category_id)]]}
                                   :query      (mt.tu/restricted-column-query (mt/id))}}
                     :attributes {:cat 50}}
      (mt/with-no-data-perms-for-all-users!
        (data-perms/set-database-permission! &group (mt/id) :perms/view-data :unrestricted)
        (data-perms/set-table-permission! &group (mt/id :categories) :perms/create-queries :query-builder)
        (mt/with-temp [Dashboard     {dashboard-id :id} {:name "Test Dashboard"}
                       Card          {card-id :id}      {:name "Dashboard Test Card"}
                       DashboardCard {_ :id}            {:dashboard_id       dashboard-id
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
                                                                                              [:field (mt/id :users :name) nil]]}]}]
          (is (= {(mt/id :venues :name) {:values   ["Garaje"
                                                    "Gordo Taqueria"
                                                    "La Tortilla"]
                                         :human_readable_values []
                                         :field_id (mt/id :venues :name)}

                  (mt/id :categories :name) {:values                ["African"
                                                                     "American"
                                                                     "Artisan"]
                                             :human_readable_values []
                                             :field_id              (mt/id :categories :name)}}
                 (let [response (:param_values (mt/user-http-request :rasta :get 200 (str "dashboard/" dashboard-id)))]
                   (into {} (for [[field-id m] response]
                              [field-id (update m :values (partial take 3))]))))))))))

(deftest chain-filter-sandboxed-field-values-test
  (testing "When chain filter endpoints would normally return cached FieldValues (#13832), make sure sandboxing is respected"
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
      (mt/with-temp-vals-in-db FieldValues (u/the-id (t2/select-one-pk FieldValues :field_id (mt/id :categories :name))) {:values ["Good" "Bad"]}
        (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard]}]
          (with-redefs [metabase.models.params.chain-filter/use-cached-field-values? (constantly false)]
            (testing "GET /api/dashboard/:id/params/:param-key/values"
              (mt/let-url [url (api.dashboard-test/chain-filter-values-url dashboard "_CATEGORY_NAME_")]
                (is (= {:values          [["African"] ["American"]]
                        :has_more_values false}
                       (->> url
                            (mt/user-http-request :rasta :get 200)
                            (chain-filter-test/take-n-values 2))))))
            (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
              (mt/let-url [url (api.dashboard-test/chain-filter-search-url dashboard "_CATEGORY_NAME_" "a")]
                (is (= {:values          [["African"] ["American"]]
                        :has_more_values false}
                       (mt/user-http-request :rasta :get 200 url)))))))))))

(deftest add-card-parameter-mapping-permissions-test
  (testing "PUT /api/dashboard/:id"
    (testing "Should check current user's data permissions for the `parameter_mapping`"
      (met/with-gtaps! {:gtaps {:venues {}}}
        (api.dashboard-test/do-with-add-card-parameter-mapping-permissions-fixtures!
         (fn [{:keys [card-id mappings add-card! dashcards]}]
           (data-perms/set-database-permission! &group (mt/id) :perms/view-data :unrestricted)
           (data-perms/set-table-permission! &group (mt/id :venues) :perms/create-queries :no)
           (add-card! 403)
           (data-perms/set-table-permission! &group (mt/id :venues) :perms/create-queries :query-builder)
           (is (=? [{:card_id            card-id
                     :parameter_mappings [{:parameter_id "_CATEGORY_ID_"
                                           :target       ["dimension" ["field" (mt/id :venues :category_id) nil]]}]}]
                   (:dashcards (add-card! 200))))
           (is (=? [{:card_id            card-id
                     :parameter_mappings mappings}]
                   (dashcards)))))))))

(deftest update-cards-parameter-mapping-permissions-test
  (testing "PUT /api/dashboard/:id"
    (testing "Should check current user's data permissions for the `parameter_mapping`"
      (met/with-gtaps! {:gtaps {:venues {}}}
        (api.dashboard-test/do-with-update-cards-parameter-mapping-permissions-fixtures!
         (fn [{:keys [dashboard-id card-id update-mappings! new-mappings]}]
           (data-perms/set-database-permission! &group (mt/id) :perms/view-data :unrestricted)
           (data-perms/set-table-permission! &group (mt/id :venues) :perms/create-queries :no)
           (update-mappings! 403)
           (data-perms/set-table-permission! &group (mt/id :venues) :perms/create-queries :query-builder)
           (update-mappings! 200)
           (is (= new-mappings
                  (t2/select-one-fn :parameter_mappings DashboardCard :dashboard_id dashboard-id, :card_id card-id)))))))))

(deftest parameters-with-source-is-card-test
  (testing "dashboard with a parameter that has source is a card, it should respects sandboxing"
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (mt/with-temp
        [Card      {card-id         :id} (merge (mt/card-with-source-metadata-for-query (mt/mbql-query categories))
                                                {:database_id     (mt/id)
                                                 :table_id        (mt/id :categories)})
         Dashboard {dashboard-id :id}    {:parameters [{:id                   "abc"
                                                        :type                 "category"
                                                        :name                 "CATEGORY"
                                                        :values_source_type   "card"
                                                        :values_source_config {:card_id     card-id
                                                                               :value_field (mt/$ids $categories.name)}}]}]

        (testing "when getting values"
          (let [get-values (fn [user]
                             (mt/user-http-request user :get 200 (api.dashboard-test/chain-filter-values-url dashboard-id "abc")))]

            (is (> (-> (get-values :crowberto) :values count) 3))
            (is (= {:values          [["African"] ["American"] ["Artisan"]]
                    :has_more_values false}
                   (get-values :rasta)))))


        (testing "when search values"
          (let [search (fn [user]
                         (mt/user-http-request user :get 200 (api.dashboard-test/chain-filter-search-url dashboard-id "abc" "bbq")))]
            (is (= {:values          [["BBQ"]]
                    :has_more_values false}
                   (search :crowberto)))

            (is (= {:values          []
                    :has_more_values false}
                   (search :rasta)))))))))
