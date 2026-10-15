(ns metabase-enterprise.library-branching.instance.save-rule-test
  "The save rule: a save that makes an in-scope item refer to an item that is not in scope is refused, with the users
  named, and changes nothing. Each test saves in a transaction that rolls back."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.instance.save-rule :as save-rule]
   [metabase-enterprise.library-branching.instance.write-test :as write-test]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- metric-query
  "A query of the venues table whose aggregation is the metric `card-id`."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib.metadata/metric mp card-id)))))

(defn- refusal
  "`{:message :findings}` of the refusal of the save `f` by the save rule, or `:saved`."
  [f]
  (try
    (save-rule/do-with-save-rule f)
    :saved
    (catch clojure.lang.ExceptionInfo e
      (if (= ::save-rule/refused (:type (ex-data e)))
        (select-keys (ex-data e) [:findings :status-code])
        (throw e)))))

(defn- metric
  [card-name collection-id query]
  {:name card-name :type :metric :display :scalar :collection_id collection-id :dataset_query query})

(deftest trash-of-a-used-item-is-refused-test
  (collections.tu/with-library [{:keys [metrics]}]
    (mt/with-temp [:model/Card base  (metric "Base revenue" (:id metrics) (write-test/sum-query :venues :price))
                   :model/Card user  (metric "Revenue on base" (:id metrics) (metric-query (:id base)))]
      (let [refused {:status-code 400
                     :findings    [{:user      (:entity_id user)
                                    :user-kind :metric
                                    :user-name "Revenue on base"
                                    :role      :metric
                                    :target    (:entity_id base)}]}]
        (testing "a trash of a Library metric that a Library metric uses is refused, with the user named"
          (is (= refused (refusal #(t2/update! :model/Card (:id base) {:archived true}))))
          (is (false? (t2/select-one-fn :archived :model/Card (:id base)))))
        (testing "a move out of the Library of a used metric is refused the same way"
          (is (= refused (refusal #(t2/update! :model/Card (:id base) {:collection_id nil}))))
          (is (= (:id metrics) (t2/select-one-fn :collection_id :model/Card (:id base)))))
        (testing "after the user leaves first, the metric can go"
          (is (= :saved (refusal #(t2/update! :model/Card (:id user) {:archived true}))))
          (is (= :saved (refusal #(t2/update! :model/Card (:id base) {:archived true})))))))))

(deftest reference-out-of-scope-is-refused-test
  (collections.tu/with-library [{:keys [metrics]}]
    (let [personal (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :rasta))]
      (mt/with-temp [:model/Card       outside (metric "My base" personal (write-test/sum-query :venues :price))
                     :model/Card       inside  (metric "Library metric" (:id metrics)
                                                       (write-test/sum-query :venues :price))
                     :model/Collection folder  {:name "Moving folder" :location "/"}
                     :model/Card       _       (metric "Moving metric" (:id folder) (metric-query (:id outside)))]
        (testing "a save that makes a Library metric use a metric outside the Library is refused"
          (is (= [{:user      (:entity_id inside)
                   :user-kind :metric
                   :user-name "Library metric"
                   :role      :metric
                   :target    (:entity_id outside)}]
                 (:findings (refusal #(t2/update! :model/Card (:id inside)
                                                  {:dataset_query (metric-query (:id outside))})))))
          (is (= :sum (-> (t2/select-one-fn :dataset_query :model/Card (:id inside))
                          :stages first :aggregation first first))))
        (testing "a move of a collection into the Library whose metric uses an outside metric is refused"
          (is (= ["Moving metric"]
                 (map :user-name (:findings (refusal #(t2/update! :model/Collection (:id folder)
                                                                  {:location (write-test/children-location metrics)
                                                                   :type     "library-metrics"}))))))
          (is (= "/" (t2/select-one-fn :location :model/Collection (:id folder)))))))))

(deftest saves-the-rule-allows-test
  (collections.tu/with-library [{:keys [metrics]}]
    (let [personal (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :rasta))]
      (mt/with-temp [:model/Card base    (metric "Base revenue" (:id metrics) (write-test/sum-query :venues :price))
                     :model/Card mine    (metric "My revenue" personal (metric-query (:id base)))
                     :model/Card other   (metric "My other" personal (write-test/sum-query :venues :price))
                     :model/Card user    (metric "Uses mine" personal (metric-query (:id other)))]
        (testing "a trash of a Library metric that only content outside the Library uses"
          (is (= :saved (refusal #(t2/update! :model/Card (:id base) {:archived true})))))
        (testing "saves outside the Library, of content that uses content outside the Library"
          (is (= :saved (refusal #(t2/update! :model/Card (:id user) {:name "Uses mine, renamed"}))))
          (is (= :saved (refusal #(t2/update! :model/Card (:id other) {:archived true})))))
        (testing "a save in the Library that adds nothing, while an older reference out of scope stays"
          (t2/update! :model/Card (:id mine) {:collection_id (:id metrics)})
          (t2/update! :model/Card (:id base) {:collection_id personal})
          (is (= :saved (refusal #(t2/update! :model/Card (:id mine) {:description "Still uses base"})))))
        (is (= "Uses mine, renamed" (t2/select-one-fn :name :model/Card (:id user))))))))

(deftest trash-of-a-used-snippet-is-refused-test
  (mt/with-temp [:model/NativeQuerySnippet base  {:name "Base for the save rule" :content "x > 1"}
                 :model/NativeQuerySnippet combo {:name    "Combo for the save rule"
                                                  :content "{{snippet: Base for the save rule}}"}]
    (is (= [{:user      (:entity_id combo)
             :user-kind :snippet
             :user-name "Combo for the save rule"
             :role      :snippet
             :target    (:entity_id base)}]
           (:findings (refusal #(t2/update! :model/NativeQuerySnippet (:id base) {:archived true})))))
    (is (false? (t2/select-one-fn :archived :model/NativeQuerySnippet (:id base))))))
