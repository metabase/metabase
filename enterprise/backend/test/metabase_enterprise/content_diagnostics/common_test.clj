(ns metabase-enterprise.content-diagnostics.common-test
  "Direct contract tests for the shared module core both checkers and the read layer depend on: the
  entity-type <-> model mapping and `attach-entity-attrs`, the scan-time denormalization helper. These
  pin the helper's semantics (batched per-type stamping, checker-set values win, missing entity is nil)
  independently of the full scan/serve pipeline that exercises them end to end."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase.test :as mt]))

(deftest entity-type->model-is-an-invertible-source-of-truth-test
  (testing "entity-type->model and model->entity-type are mutual inverses over every covered type"
    (doseq [[etype model] common/entity-type->model]
      (is (= etype (common/model->entity-type model)))
      (is (= model (common/entity-type->model etype)))))
  (testing "it covers exactly the four content-diagnostics entity types"
    (is (= #{:card :dashboard :document :transform} (set (keys common/entity-type->model))))))

(deftest attach-entity-attrs-stamps-denormalized-columns-test
  (testing "each finding is stamped with its entity's name/created_at/creator across multiple entity types"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card      {card-id :id} {:collection_id coll-id
                                                   :name          "Revenue"
                                                   :creator_id    (mt/user->id :rasta)}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id
                                                   :name          "Ops"
                                                   :creator_id    (mt/user->id :crowberto)}]
      (let [by-key (into {}
                         (map (juxt (juxt :entity-type :entity-id) identity))
                         (common/attach-entity-attrs
                          [{:entity-type :card :entity-id card-id :finding-type :slow}
                           {:entity-type :dashboard :entity-id dash-id :finding-type :slow}]))]
        (testing "card: name + created_at + creator id and resolved common_name"
          (let [f (by-key [:card card-id])]
            (is (= "Revenue" (:entity-name f)))
            (is (some? (:entity-created-at f)))
            (is (= (mt/user->id :rasta) (:entity-creator-id f)))
            (is (= "Rasta Toucan" (:entity-creator-name f)))))
        (testing "dashboard: resolves its own creator, distinct from the card's"
          (let [f (by-key [:dashboard dash-id])]
            (is (= "Ops" (:entity-name f)))
            (is (= (mt/user->id :crowberto) (:entity-creator-id f)))
            (is (= "Crowberto Corv" (:entity-creator-name f)))))))))

(deftest attach-entity-attrs-lets-checker-set-values-win-test
  (testing "a value the checker already set (e.g. stale's scan-time entity-name) is not overwritten"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card {card-id :id} {:collection_id coll-id :name "Live Name"}]
      (let [[out] (common/attach-entity-attrs
                   [{:entity-type :card :entity-id card-id :finding-type :stale
                     :entity-name "Scan-Time Name"}])]
        (testing "the checker's entity-name wins over the live model name"
          (is (= "Scan-Time Name" (:entity-name out))))
        (testing "attrs the checker did not set are still filled from the model"
          (is (some? (:entity-created-at out))))))))

(deftest attach-entity-attrs-tolerates-a-missing-entity-test
  (testing "a finding whose entity no longer exists gets nil denormalized attrs, not an error"
    (let [[out] (common/attach-entity-attrs
                 [{:entity-type :card :entity-id Integer/MAX_VALUE :finding-type :slow}])]
      (is (nil? (:entity-name out)))
      (is (nil? (:entity-created-at out)))
      (is (nil? (:entity-creator-id out)))
      (is (nil? (:entity-creator-name out))))))
