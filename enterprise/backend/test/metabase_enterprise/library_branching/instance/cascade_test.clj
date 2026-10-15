(ns metabase-enterprise.library-branching.instance.cascade-test
  "The cascades of the save paths of the kinds: a write or a trash of an item changes no content outside the Library
  tree. The Card save path clears each parameter whose values come from a card that goes to the trash; outside the
  Library, the parameter keeps its values source."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance.write-test :as write-test]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users) features.tu/with-features)

(defn- values-source-param
  "A parameter `p1` whose values come from the column `sum` of card `card-id`."
  [card-id]
  {:id                   "p1"
   :name                 "Total"
   :slug                 "total"
   :type                 :number/=
   :values_source_type   :card
   :values_source_config {:card_id card-id :value_field [:field "sum" {:base-type :type/Integer}]}})

(defn- add-values-source!
  "Gives the dashboard or card `row` of `model` the parameter of [[values-source-param]] for card `card-id`, through the
  model, so that the model also writes its ParameterCard row."
  [model row card-id]
  (t2/update! model (:id row) {:parameters [(values-source-param card-id)]}))

(defn- user-rows
  "Every column of the rows of the dashboard `dashboard-id` and the card `card-id`, and the ParameterCard rows of the
  cards `source-ids`."
  [dashboard-id card-id source-ids]
  {:dashboard       (t2/select-one :report_dashboard :id dashboard-id)
   :card            (t2/select-one :report_card :id card-id)
   :parameter-cards (t2/select :parameter_card :card_id [:in source-ids] {:order-by [:id]})})

(defn- source-of
  "The values source of the parameter `p1` of the dashboard or card `id` of `model`."
  [model id]
  (-> (t2/select-one-fn :parameters model id)
      first
      (select-keys [:values_source_type :values_source_config])))

(defn- default-values [] {:values [["default"]] :has_more_values false})

(defn- listed-values
  "The values that the filter of the parameter `p1` of dashboard `id` lists, with [[default-values]] as its default."
  [id]
  (mt/with-current-user (mt/user->id :crowberto)
    (custom-values/parameter->values (first (t2/select-one-fn :parameters :model/Dashboard id)) nil default-values)))

(deftest metric-trash-keeps-outside-values-sources-test
  (testing "a trash of a Library metric changes no dashboard and no card outside the Library that takes parameter
            values from it, and their filters still list values"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Card       metric  {:name          "Price total"
                                                :type          :metric
                                                :display       :scalar
                                                :collection_id (:id metrics)
                                                :dataset_query (write-test/sum-query :venues :price)}
                     :model/Collection folder  {:name "Outside" :location "/"}
                     :model/Dashboard  outside {:name "Outside dashboard" :collection_id (:id folder)}
                     :model/Card       user    {:name          "Outside question"
                                                :type          :question
                                                :display       :table
                                                :collection_id (:id folder)
                                                :dataset_query (write-test/sum-query :venues :price)}]
        (add-values-source! :model/Dashboard outside (:id metric))
        (add-values-source! :model/Card user (:id metric))
        (let [before   (user-rows (:id outside) (:id user) [(:id metric)])
              source   (source-of :model/Dashboard (:id outside))
              restored (write-test/current :metric (:entity_id metric))]
          (is (= :card (:values_source_type source)))
          (is (= 2 (count (:parameter-cards before))))
          (write-test/trash! :metric (:entity_id metric))
          (is (t2/select-one-fn :archived :model/Card (:id metric)))
          (testing "the rows of the users and their ParameterCard rows do not change"
            (is (= before (user-rows (:id outside) (:id user) [(:id metric)]))))
          (testing "the filter lists its default values while the metric is in the trash"
            (is (= (default-values) (listed-values (:id outside)))))
          (testing "a restore of the metric gives the users their values source back"
            (write-test/write! :metric (:entity_id metric) restored)
            (is (not (t2/select-one-fn :archived :model/Card (:id metric))))
            (is (= source (source-of :model/Dashboard (:id outside))))
            (is (= source (source-of :model/Card (:id user))))))))))

(deftest metric-trash-keeps-the-cascade-inside-the-library-test
  (testing "a trash of a Library metric clears the values source of a parameter of Library content"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Card metric {:name          "Price total"
                                         :type          :metric
                                         :display       :scalar
                                         :collection_id (:id metrics)
                                         :dataset_query (write-test/sum-query :venues :price)}
                     :model/Card inside {:name          "Library user"
                                         :type          :metric
                                         :display       :scalar
                                         :collection_id (:id metrics)
                                         :dataset_query (write-test/sum-query :venues :price)}]
        (add-values-source! :model/Card inside (:id metric))
        (write-test/trash! :metric (:entity_id metric))
        (is (= {:values_source_type nil} (source-of :model/Card (:id inside))))
        (is (not (t2/exists? :model/ParameterCard :card_id (:id metric))))))))

(deftest collection-trash-keeps-outside-values-sources-test
  (testing "a trash of a Library collection changes no dashboard outside the Library that takes parameter values from
            a metric in its subtree"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Collection folder  {:name     "Folder"
                                                :type     "library-metrics"
                                                :location (write-test/children-location metrics)}
                     :model/Collection sub     {:name     "Sub"
                                                :type     "library-metrics"
                                                :location (write-test/children-location folder)}
                     :model/Card       metric  {:name          "Price total"
                                                :type          :metric
                                                :display       :scalar
                                                :collection_id (:id sub)
                                                :dataset_query (write-test/sum-query :venues :price)}
                     :model/Collection outer   {:name "Outside" :location "/"}
                     :model/Dashboard  outside {:name "Outside dashboard" :collection_id (:id outer)}
                     :model/Card       user    {:name          "Outside question"
                                                :type          :question
                                                :display       :table
                                                :collection_id (:id outer)
                                                :dataset_query (write-test/sum-query :venues :price)}]
        (add-values-source! :model/Dashboard outside (:id metric))
        (add-values-source! :model/Card user (:id metric))
        (let [before (user-rows (:id outside) (:id user) [(:id metric)])]
          (write-test/trash! :collection (:entity_id folder))
          (is (t2/select-one-fn :archived :model/Card (:id metric)))
          (is (= before (user-rows (:id outside) (:id user) [(:id metric)])))
          (is (= (default-values) (listed-values (:id outside)))))))))

(deftest metric-write-keeps-outside-values-sources-test
  (testing "a write of a Library metric with a query of other columns changes no dashboard outside the Library that
            takes parameter values from it: a write sets no result metadata, so the Card save path keeps the values
            source"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Card      metric  {:name          "Price total"
                                               :type          :metric
                                               :display       :scalar
                                               :collection_id (:id metrics)
                                               :dataset_query (write-test/sum-query :venues :price)}
                     :model/Dashboard outside {:name "Outside dashboard"}
                     :model/Card      user    {:name          "Outside question"
                                               :type          :question
                                               :display       :table
                                               :dataset_query (write-test/sum-query :venues :price)}]
        (add-values-source! :model/Dashboard outside (:id metric))
        (add-values-source! :model/Card user (:id metric))
        (let [before    (user-rows (:id outside) (:id user) [(:id metric)])
              mp        (mt/metadata-provider)
              count-row (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                            (lib/aggregate (lib/count)))
              item      (write-test/current :metric (:entity_id metric))]
          ;; The new query has the column `count`, not `sum`, so the values field of the users is not in its result.
          (t2/with-transaction [_ nil {:rollback-only true}]
            (t2/update! :model/Card (:id metric) {:dataset_query count-row})
            (let [counted (write-test/current :metric (:entity_id metric))]
              (t2/update! :model/Card (:id metric) {:dataset_query (write-test/sum-query :venues :price)})
              (write-test/write! :metric (:entity_id metric) counted)
              (is (= (:attrs counted) (:attrs (write-test/current :metric (:entity_id metric)))))
              (is (not= (:attrs item) (:attrs counted)))
              (is (= before (user-rows (:id outside) (:id user) [(:id metric)]))))))))))
