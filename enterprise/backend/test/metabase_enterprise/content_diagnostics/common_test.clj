(ns metabase-enterprise.content-diagnostics.common-test
  "Direct contract tests for the shared module core both checkers and the read layer depend on: the
  entity-type <-> model mapping and `attach-entity-attrs`, the scan-time denormalization helper. These
  pin the helper's semantics (batched per-type stamping, checker-set values win, missing entity is nil)
  independently of the full scan/serve pipeline that exercises them end to end, plus the fail-closed
  dispatch contract of the per-entity-type multimethods keyed off `common/hierarchy` and of the
  per-finding-type `finalize-finding` multimethod in the read layer."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.api.common :as api.common]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase.test :as mt]))

(deftest entity-type->model-is-an-invertible-source-of-truth-test
  (testing "entity-type->model and model->entity-type are mutual inverses over every covered type"
    (doseq [[etype model] common/entity-type->model]
      (is (= etype (common/model->entity-type model)))
      (is (= model (common/entity-type->model etype)))))
  (testing "it covers exactly the five content-diagnostics entity types"
    (is (= #{:card :collection :dashboard :document :transform} (set (keys common/entity-type->model))))))

(deftest entity-type-hierarchy-and-registry-test
  (testing "card/dashboard/document derive ::collection-item; transform and collection are explicit outliers"
    (doseq [etype [:card :dashboard :document]]
      (is (isa? common/hierarchy etype ::common/collection-item)
          (str etype " should derive ::collection-item")))
    (is (not (isa? common/hierarchy :transform ::common/collection-item))
        "transform must not derive ::collection-item - it carries an explicit method")
    (is (not (isa? common/hierarchy :collection ::common/collection-item))
        "collection must not derive ::collection-item - it is a distinct, non-column-resident outlier"))
  (testing "the context-cols registry covers every column-resident type entity-context feeds through it"
    (doseq [etype [:card :dashboard :document :transform]]
      (is (vector? (common/context-cols etype)) (str etype " should have context-cols")))
    (testing "collection has no context-cols entry - its breadcrumb anchor comes from location, not a column"
      (is (nil? (common/context-cols :collection))))))

(deftest entity-type-multimethods-are-fail-closed-test
  ;; The per-entity-type multimethods dispatch through `common/hierarchy` with NO permissive :default, so
  ;; (1) every type each one serves must resolve a method - a new type left unregistered fails here, not in
  ;; prod - and (2) an unregistered type throws at dispatch rather than silently inheriting the
  ;; collection_id/owner assumptions it violates.
  (testing "entity-context covers all five imbalanced entity-types (card/dashboard/document via
            ::collection-item, transform + collection explicit)"
    (doseq [etype #{:card :dashboard :document :transform :collection}]
      (is (some? (get-method @#'api.common/entity-context etype))
          (format "entity-context has no method for %s" etype))))
  (testing "hydrate-owner covers the four column-resident types; collection sets its owner inside
            collection-context, so it is deliberately NOT a hydrate-owner subject"
    (doseq [etype #{:card :dashboard :document :transform}]
      (is (some? (get-method @#'api.common/hydrate-owner etype))
          (format "hydrate-owner has no method for %s" etype)))
    (is (nil? (get-method @#'api.common/hydrate-owner :collection))
        "collection must not resolve a hydrate-owner method - its owner is baked into collection-context"))
  (testing "no permissive :default - an unregistered entity-type resolves no method"
    (is (nil? (get-method @#'api.common/entity-context :not-an-entity-type)))
    (is (nil? (get-method @#'api.common/hydrate-owner :not-an-entity-type))))
  (testing "invoking a multimethod with an unregistered entity-type throws at dispatch"
    (is (thrown? IllegalArgumentException (@#'api.common/hydrate-owner :not-an-entity-type [])))
    (is (thrown? IllegalArgumentException (@#'api.common/entity-context :not-an-entity-type #{})))))

(deftest finding-type-multimethod-is-fail-closed-test
  ;; `finalize-finding` dispatches per row on the stored `finding_type` with NO permissive :default, so a
  ;; new finding type left unregistered fails here (and at dispatch), not by silently serving an unfinalized
  ;; row missing its native top-level column / details rewrite.
  (let [served-finding-types #{:stale :slow :empty :sparse :crowded}]
    (testing "every finding-type this branch serves resolves a method (registry completeness)"
      (doseq [ftype served-finding-types]
        (is (some? (get-method @#'api.common/finalize-finding ftype))
            (format "finalize-finding has no method for finding-type %s" ftype))))
    (testing "an unregistered finding-type resolves no method (no catch-all :default)"
      (is (nil? (get-method @#'api.common/finalize-finding :not-a-finding-type))))
    (testing "invoking with an unregistered finding-type throws at dispatch"
      (is (thrown? IllegalArgumentException
                   (@#'api.common/finalize-finding :not-a-finding-type {} {} {}))))))

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

(deftest attach-entity-attrs-collection-has-no-creator-test
  (testing "a collection finding gets name/created_at but NULL creator columns - collections have no
            creator_id, and a personal collection's owner is not a creator proxy"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Team Reports"}]
      (let [[out] (common/attach-entity-attrs
                   [{:entity-type :collection :entity-id coll-id :finding-type :empty}])]
        (is (= "Team Reports" (:entity-name out)))
        (is (some? (:entity-created-at out)))
        (is (nil? (:entity-creator-id out)))
        (is (nil? (:entity-creator-name out)))))))

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
