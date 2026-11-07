(ns metabase.parameters.params-test
  "Tests for the utility functions for dealing with parameters in `metabase.parameters.params`."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.parameters.params-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.parameters.params :as params]
   [metabase.public-sharing-rest.api-test :as public-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest hydrate-name-field-test
  (testing "make sure that we can hydrate the `name_field` property for PK Fields"
    (is (= {:name          "ID"
            :table_id      (mt/id :venues)
            :semantic_type :type/PK
            :name_field    {:id                 (mt/id :venues :name)
                            :table_id           (mt/id :venues)
                            :name               "NAME"
                            :display_name       "Name"
                            :base_type          :type/Text
                            :effective_type     :type/Text
                            :semantic_type      :type/Name
                            :has_field_values   :list
                            :fk_target_field_id nil
                            :settings           nil}}
           (-> (t2/select-one [:model/Field :name :table_id :semantic_type], :id (mt/id :venues :id))
               (t2/hydrate :name_field)
               mt/derecordize))))
  (testing "make sure it works for multiple fields efficiently. Should only require one DB call to hydrate many Fields"
    (let [venues-fields (t2/select :model/Field :table_id (mt/id :venues))]
      (t2/with-call-count [call-count]
        (t2/hydrate venues-fields :name_field)
        (is (= 1
               (call-count))))))
  (testing "It shouldn't hydrate for Fields that aren't PKs"
    (is (= {:name          "PRICE"
            :table_id      (mt/id :venues)
            :semantic_type :type/Category
            :name_field    nil}
           (-> (t2/select-one [:model/Field :name :table_id :semantic_type], :id (mt/id :venues :price))
               (t2/hydrate :name_field)
               mt/derecordize))))
  (testing "Or if it *is* a PK, but no name Field is available for that Table, it shouldn't hydrate"
    (is (= {:name          "ID"
            :table_id      (mt/id :checkins)
            :semantic_type :type/PK
            :name_field    nil}
           (-> (t2/select-one [:model/Field :name :table_id :semantic_type], :id (mt/id :checkins :id))
               (t2/hydrate :name_field)
               mt/derecordize))))
  (testing "Inactive Entity Name fields should not be hydrated (#65207)"
    (let [name-field-id (mt/id :venues :name)]
      (try
        (t2/update! :model/Field :id name-field-id {:active false})
        (is (= {:name          "ID"
                :table_id      (mt/id :venues)
                :semantic_type :type/PK
                :name_field    nil}
               (-> (t2/select-one [:model/Field :name :table_id :semantic_type], :id (mt/id :venues :id))
                   (t2/hydrate :name_field)
                   mt/derecordize)))
        (finally
          (t2/update! :model/Field :id name-field-id {:active true}))))))

;;; -------------------------------------------------- param_fields --------------------------------------------------

(defn- card-param-fields
  "The hydrated `:param_fields` of a native Card with a field filter template tag on each Field in `field-ids`."
  [field-ids]
  (mt/with-temp [:model/Card card {:dataset_query
                                   {:database (mt/id)
                                    :type     :native
                                    :native   {:query         "SELECT COUNT(*) FROM VENUES"
                                               :template-tags (into {}
                                                                    (map (fn [field-id]
                                                                           [(str field-id)
                                                                            {:name         (str field-id)
                                                                             :display_name (str field-id)
                                                                             :id           (str field-id)
                                                                             :type         :dimension
                                                                             :field-id     field-id}]))
                                                                    field-ids)}}}]
    (-> (t2/hydrate card :param_fields)
        :param_fields
        mt/derecordize)))

(deftest ^:parallel hydrate-param-fields-for-card-test
  (testing "check that we can hydrate param_fields for a Card"
    (is (= {(str (mt/id :venues :id)) [{:id               (mt/id :venues :id)
                                        :display_name     "ID"
                                        :name             "ID"
                                        :base_type        :type/BigInteger
                                        :effective_type   :type/BigInteger
                                        :semantic_type    :type/PK
                                        :has_field_values :none
                                        :settings         nil
                                        :has_remapping    true}]}
           (card-param-fields [(mt/id :venues :id)])))))

(deftest param-fields-has-remapping-test
  (testing "PK with name field, FK whose target has name field, and Field with Dimension have remapping"
    (mt/with-temp [:model/Dimension _ {:field_id (mt/id :venues :price)
                                       :name     "Price"
                                       :type     :internal}]
      (is (=? {(str (mt/id :venues :id))          [{:has_remapping true}]
               (str (mt/id :venues :category_id)) [{:has_remapping true}]
               (str (mt/id :venues :price))       [{:has_remapping true}]
               (str (mt/id :venues :name))        [{:has_remapping false}]}
              (card-param-fields [(mt/id :venues :id)
                                  (mt/id :venues :category_id)
                                  (mt/id :venues :price)
                                  (mt/id :venues :name)]))))))

(deftest hydrate-param-fields-for-dashboard-test
  (testing "check that we can hydrate param_fields for a Dashboard"
    (public-test/with-sharing-enabled-and-temp-dashcard-referencing! :venues :id [dashboard]
      (is (= {public-test/parameter-id [{:id               (mt/id :venues :id)
                                         :display_name     "ID"
                                         :name             "ID"
                                         :base_type        :type/BigInteger
                                         :effective_type   :type/BigInteger
                                         :semantic_type    :type/PK
                                         :has_field_values :none
                                         :settings         nil
                                         :has_remapping    true}]}
             (-> (t2/hydrate dashboard :param_fields)
                 :param_fields
                 mt/derecordize))))))

(deftest hydrate-param-fields-for-dashboard-test-2
  (testing "should ignore invalid parameter mappings"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Dashboard    dashboard  {:parameters [{:id "p1" :type :number/=}
                                                                  {:id "p2" :type :number/=}
                                                                  {:id "p3" :type :number/=}
                                                                  {:id "p4" :type :number/=}
                                                                  {:id "p5" :type :string/=}
                                                                  {:id "p6" :type :string/=}
                                                                  {:id "p7" :type :number/=}]}
                     :model/Card          card      {:dataset_query (mt/mbql-query products {:aggregation [[:count]]
                                                                                             :breakout    [$category]})}
                     :model/DashboardCard _dashcard {:dashboard_id       (u/the-id dashboard)
                                                     :card_id            (u/the-id card)
                                                     :parameter_mappings [;; p1 - no :stage-number, -1 is implied, id-based ref
                                                                          {:card_id (u/the-id card)
                                                                           :parameter_id "p1"
                                                                           :target  [:dimension
                                                                                     [:field (mt/id :products :id) nil]]}
                                                                          ;; p2 - no :stage-number, -1 is implied, name-based ref
                                                                          {:card_id (u/the-id card)
                                                                           :parameter_id "p2"
                                                                           :target  [:dimension
                                                                                     [:field "ID" {:base-type :type/BigInteger}]]}
                                                                          ;; p3 - explicit :stage-number, id-based ref
                                                                          {:card_id (u/the-id card)
                                                                           :parameter_id "p3"
                                                                           :target  [:dimension
                                                                                     [:field (mt/id :products :id) nil]
                                                                                     {:stage-number 0}]}
                                                                          ;; p4 - explicit :stage-number, name-based ref
                                                                          {:card_id (u/the-id card)
                                                                           :parameter_id "p4"
                                                                           :target  [:dimension
                                                                                     [:field "ID" {:base-type :type/BigInteger}]
                                                                                     {:stage-number 0}]}
                                                                          ;; p5 - explicit :stage-number, post-aggregation stage
                                                                          {:card_id (u/the-id card)
                                                                           :parameter_id "p5"
                                                                           :target  [:dimension
                                                                                     [:field "CATEGORY" {:base-type :type/Text}]
                                                                                     {:stage-number 1}]}
                                                                          ;; p6 - explicit :stage-number, not existing stage
                                                                          {:card_id (u/the-id card)
                                                                           :parameter_id "p6"
                                                                           :target  [:dimension
                                                                                     [:field "CATEGORY" {:base-type :type/Text}]
                                                                                     {:stage-number 2}]}]}]
        (let [param-fields (lib-be/with-metadata-provider-cache
                             (-> (t2/hydrate dashboard :param_fields) :param_fields))]
          (is (=? {"p1" [{:id (mt/id :products :id)}]
                   "p2" [{:id (mt/id :products :id)}]
                   "p3" [{:id (mt/id :products :id)}]
                   "p4" [{:id (mt/id :products :id)}]
                   "p5" [{:id (mt/id :products :category)}]}
                  param-fields))
          ;; invalid :stage-number
          (is (not (contains? param-fields "p6")))
          ;; no mapping
          (is (not (contains? param-fields "p7"))))))))

(deftest ^:parallel card->template-tag-test
  (let [card {:dataset_query (lib-be/normalize-query
                              (mt/native-query {:query         "SELECT *"
                                                :template-tags {"id"   {:name         "id"
                                                                        :display-name "ID"
                                                                        :id           "11111111"
                                                                        :type         :dimension
                                                                        :widget-type  :number
                                                                        :field-id     (mt/id :venues :id)}
                                                                "name" {:name         "name"
                                                                        :display-name "Name"
                                                                        :id           "aaaaaaaa"
                                                                        :type         :dimension
                                                                        :widget-type  :number
                                                                        :dimension    [:field "name" {:base-type :type/Text}]}}}))}]
    (testing "card->template-tag-param-id->field-ids"
      (is (= {"11111111" #{(mt/id :venues :id)}}
             (#'params/card->template-tag-id->field-ids card))))
    (testing "card->template-tag-field-ids"
      (is (= #{(mt/id :venues :id)}
             (params/card->template-tag-field-ids card))))))

(deftest ^:parallel duplicate-column-names-test
  (testing "columns with duplicated names get mapped correctly to parameters"
    (testing "native queries"
      (let [card {:dataset_query (lib-be/normalize-query
                                  (mt/native-query {:query "SELECT *"
                                                    :template-tags
                                                    {"tag1" {:name         "tag1"
                                                             :display-name "Tag 1"
                                                             :id           "11111111"
                                                             :type         :dimension
                                                             :widget-type  :number
                                                             :field-id     (mt/id :orders :id)}
                                                     "tag2" {:name         "tag2"
                                                             :display-name "Tag 2"
                                                             :id           "aaaaaaaa"
                                                             :type         :dimension
                                                             :widget-type  :number
                                                             :field-id     (mt/id :products :id)}}}))}]
        (testing "card->template-tag-param-id->field-ids"
          (is (= {"11111111" #{(mt/id :orders :id)}
                  "aaaaaaaa" #{(mt/id :products :id)}}
                 (#'params/card->template-tag-id->field-ids card))))
        (testing "card->template-tag-field-ids"
          (is (= #{(mt/id :orders :id)
                   (mt/id :products :id)}
                 (params/card->template-tag-field-ids card))))))))

(deftest ^:parallel dashcards->param-field-ids-bulk-loads-metadata-test
  (testing "name-based parameter targets are resolved via filterable-columns, whose metadata is bulk-loaded across all
            the dashboard's cards up front instead of one card at a time (no N+1)"
    (mt/dataset test-data
      (let [mp             (mt/metadata-provider)
            orders-query   (lib/query mp (lib.metadata/table mp (mt/id :orders)))
            products-query (lib/query mp (lib.metadata/table mp (mt/id :products)))]
        (mt/with-temp
          [:model/Card          src1 {:database_id     (mt/id) :table_id (mt/id :orders)
                                      :dataset_query   orders-query
                                      :result_metadata (lib/returned-columns orders-query)}
           :model/Card          agg1 {:database_id   (mt/id)
                                      :dataset_query {:database (mt/id) :type :query
                                                      :query    {:source-table (str "card__" (:id src1)) :aggregation [[:count]]}}}
           :model/Card          src2 {:database_id     (mt/id) :table_id (mt/id :products)
                                      :dataset_query   products-query
                                      :result_metadata (lib/returned-columns products-query)}
           :model/Card          agg2 {:database_id   (mt/id)
                                      :dataset_query {:database (mt/id) :type :query
                                                      :query    {:source-table (str "card__" (:id src2)) :aggregation [[:count]]}}}
           :model/Dashboard     {dash-id :id} {}
           :model/DashboardCard dc1 {:dashboard_id dash-id :card_id (:id agg1)
                                     :parameter_mappings [{:parameter_id "p1" :card_id (:id agg1)
                                                           :target [:dimension [:field "PRODUCT_ID" {:base-type :type/Integer}]]}]}
           :model/DashboardCard dc2 {:dashboard_id dash-id :card_id (:id agg2)
                                     :parameter_mappings [{:parameter_id "p2" :card_id (:id agg2)
                                                           :target [:dimension [:field "CATEGORY" {:base-type :type/Text}]]}]}]
          (let [dashcards (-> (t2/select :model/DashboardCard :id [:in [(:id dc1) (:id dc2)]])
                              (t2/hydrate :card :series))]
            ;; Each is a single set load, so this count is constant in the number of cards -- it must NOT grow with more
            ;; dashcards/Cards/Tables (that would be the N+1 this preloading exists to prevent).
            ;; - one bulk fetch of the source Cards
            ;; - one bulk fetch of those Cards' result-metadata Fields
            ;; - one bulk fetch of those Fields' FK targets
            ;; - one bulk fetch of the FK-target Tables
            ;; - one bulk fetch of those Tables' columns
            (is (= 5 (lib-be/with-metadata-provider-cache
                       (t2/with-call-count [call-count]
                         (params/dashcards->param-field-ids dashcards)
                         (call-count)))))))))))

(deftest ^:parallel invalid-parameters-errors-are-humanized-test
  (testing "`:errors` are client-facing, so they are humanized messages rather than Malli explanations"
    (doseq [[thunk desc] [[#(params/assert-valid-parameters {:parameters [{:id 1}]})
                           "parameters"]
                          [#(params/assert-valid-parameter-mappings {:parameter_mappings [{:card_id "x"}]})
                           "parameter mappings"]]]
      (testing desc
        (let [errors (:errors (try (thunk) (catch clojure.lang.ExceptionInfo e (ex-data e))))]
          (is (some? errors))
          (is (not-any? #(and (map? %) (contains? % :schema)) (tree-seq coll? seq errors))))))))
