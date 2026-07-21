(ns metabase-enterprise.content-diagnostics.common-test
  "Direct contract tests for the shared module core both checkers and the read layer depend on: the
  entity-type <-> model mapping and `attach-entity-attrs`, the scan-time denormalization helper. These
  pin the helper's semantics (batched per-type stamping, checker-set values win, missing entity is nil)
  independently of the full scan/serve pipeline that exercises them end to end, plus the module-wide
  fail-closed dispatch contract of the per-entity-type multimethods keyed off `common/hierarchy`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.api.common :as api.common]
   [metabase-enterprise.content-diagnostics.checkers.duplicated :as checkers.duplicated]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase.test :as mt]))

(deftest entity-type->model-is-an-invertible-source-of-truth-test
  (testing "entity-type->model and model->entity-type are mutual inverses over every covered type"
    (doseq [[etype model] common/entity-type->model]
      (is (= etype (common/model->entity-type model)))
      (is (= model (common/entity-type->model etype)))))
  (testing "it covers exactly the four content-diagnostics entity types"
    (is (= #{:card :dashboard :document :transform} (set (keys common/entity-type->model))))))

(deftest entity-type-hierarchy-and-registry-test
  (testing "card/dashboard/document derive ::collection-item; transform is an explicit outlier"
    (doseq [etype [:card :dashboard :document]]
      (is (isa? common/hierarchy etype ::common/collection-item)
          (str etype " should derive ::collection-item")))
    (is (not (isa? common/hierarchy :transform ::common/collection-item))
        "transform must not derive ::collection-item - it carries explicit methods"))
  (testing "the column registry covers every collection-resident type it feeds"
    (doseq [etype [:card :dashboard :document]]
      (is (vector? (common/context-cols etype)))
      (is (vector? (common/peer-select-cols etype)))
      (is (vector? (common/candidate-cols etype))))
    (testing "transform is column-based for context only - its peer/candidate reads are bespoke methods"
      (is (vector? (common/context-cols :transform)))
      (is (nil? (common/peer-select-cols :transform)))
      (is (nil? (common/candidate-cols :transform))))))

(deftest entity-type-multimethods-are-fail-closed-test
  ;; The per-entity-type multimethods all dispatch through `common/hierarchy` with NO permissive :default, so
  ;; (1) every covered type must resolve a method - a new type left unregistered fails here, not in prod -
  ;; and (2) an unregistered type throws at dispatch rather than silently inheriting collection_id/owner
  ;; assumptions it violates.
  (let [mm-by-name {"read-entity-rows" @#'api.common/read-entity-rows
                    "hydrate-owner"    @#'api.common/hydrate-owner
                    "entity-context"   @#'api.common/entity-context
                    "candidate-rows"   @#'checkers.duplicated/candidate-rows}]
    (testing "every covered entity-type resolves a method (registry completeness)"
      (doseq [[mm-name mm] mm-by-name
              etype        api.common/covered-entity-types]
        (is (some? (get-method mm etype))
            (format "%s has no method for covered type %s" mm-name etype))))
    (testing "an unregistered entity-type resolves no method (no catch-all :default)"
      (doseq [[mm-name mm] mm-by-name]
        (is (nil? (get-method mm :not-an-entity-type))
            (format "%s must stay fail-closed for unregistered types" mm-name))))
    (testing "invoking a multimethod with an unregistered entity-type throws at dispatch"
      (is (thrown? IllegalArgumentException (@#'api.common/hydrate-owner :not-an-entity-type [])))
      (is (thrown? IllegalArgumentException (@#'api.common/entity-context :not-an-entity-type #{})))
      (is (thrown? IllegalArgumentException (@#'api.common/read-entity-rows :not-an-entity-type #{} nil)))
      (is (thrown? IllegalArgumentException (@#'checkers.duplicated/candidate-rows :not-an-entity-type))))))

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
