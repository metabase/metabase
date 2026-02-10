(ns metabase-enterprise.replacement.source-swap-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(deftest swap-native-card-source!-updates-query-test
  (testing "Card referencing the old card gets its query text and template tags updated"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999}}")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)
                tags          (lib/template-tags updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (not (str/includes? query "{{#999}}")))
            (is (contains? tags "#888"))
            (is (not (contains? tags "#999")))
            (is (= 888 (get-in tags ["#888" :card-id])))
            (is (= "#888" (get-in tags ["#888" :name])))
            (is (= "#888" (get-in tags ["#888" :display-name])))))))))

(deftest swap-native-card-source!-no-op-test
  (testing "Card NOT referencing the old card is unchanged"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#777}}")}]
          (let [before (t2/select-one :model/Card :id card-id)]
            (source-swap/swap-native-card-source! card-id 999 888)
            (let [after (t2/select-one :model/Card :id card-id)]
              (is (= (:dataset_query before) (:dataset_query after))))))))))

(deftest swap-native-card-source!-updates-dependencies-test
  (testing "Dependencies are updated after swap"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp       (mt/metadata-provider)
              products (lib.metadata/table mp (mt/id :products))
              orders   (lib.metadata/table mp (mt/id :orders))]
          (mt/with-temp [:model/Card {old-source-id :id} {:dataset_query (lib/query mp products)}
                         :model/Card {new-source-id :id} {:dataset_query (lib/query mp orders)}
                         :model/Card {native-card-id :id :as native-card}
                         {:dataset_query (lib/native-query mp (str "SELECT * FROM {{#" old-source-id "}}"))}]
            ;; Seed initial dependencies
            (events/publish-event! :event/card-dependency-backfill {:object native-card})
            (is (contains?
                 (into #{} (map #(select-keys % [:to_entity_type :to_entity_id])
                                (t2/select :model/Dependency
                                           :from_entity_id native-card-id
                                           :from_entity_type :card)))
                 {:to_entity_type :card :to_entity_id old-source-id})
                "Before swap: dependency on old source should exist")
            ;; Perform the swap
            (source-swap/swap-native-card-source! native-card-id old-source-id new-source-id)
            (let [deps (into #{} (map #(select-keys % [:to_entity_type :to_entity_id])
                                      (t2/select :model/Dependency
                                                 :from_entity_id native-card-id
                                                 :from_entity_type :card)))]
              (is (contains? deps {:to_entity_type :card :to_entity_id new-source-id})
                  "After swap: dependency on new source should exist")
              (is (not (contains? deps {:to_entity_type :card :to_entity_id old-source-id}))
                  "After swap: dependency on old source should be gone"))))))))
