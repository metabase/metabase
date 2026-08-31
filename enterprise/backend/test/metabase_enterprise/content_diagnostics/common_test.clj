(ns metabase-enterprise.content-diagnostics.common-test
  "Direct contract tests for the shared module core both checkers and the read layer depend on: the
  collection-subject eligibility WHERE, the entity-type <-> model mapping and `attach-entity-attrs`, the
  scan-time denormalization helper. These pin the helper's semantics (batched per-type stamping,
  checker-set values win, missing entity is nil) independently of the full scan/serve pipeline that
  exercises them end to end, plus the module-wide fail-closed dispatch contract of the per-entity-type
  multimethods keyed off `common/hierarchy` and of the per-finding-type `finalize-finding` multimethod in
  the read layer."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.api.common :as api.common]
   [metabase-enterprise.content-diagnostics.checkers.duplicated :as checkers.duplicated]
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.common :as imbalanced.common]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest eligible-collection-where-contract-test
  (testing "the shared WHERE admits exactly the collection subjects the base principle allows"
    (mt/with-temp
      [:model/Collection {regular :id}         {}
       ;; transforms stands in for every non-{snippet,analytics} namespace: the WHERE treats them
       ;; identically, so this also covers the tenant namespaces (which can't be temp-created here -
       ;; they need `perms/use-tenants`)
       :model/Collection {transforms-coll :id} {:namespace "transforms"}
       :model/Collection {lib-metrics :id}     {:type collection/library-metrics-collection-type}
       :model/Collection {tenant-root :id}     {:type collection/tenant-specific-root-collection-type}
       :model/Collection {sample :id}          {:is_sample true}
       :model/Collection {lib-root :id}        {:type collection/library-collection-type}
       :model/Collection {lib-data :id}        {:type collection/library-data-collection-type}
       :model/Collection {ia :id}              {:type collection/instance-analytics-collection-type}
       :model/Collection {snippets :id}        {:namespace "snippets"}
       :model/Collection {archived :id}        {:archived true}]
      (let [eligible (t2/select-pks-set :model/Collection {:where common/eligible-collection-where})]
        (testing "in: regular, non-internal namespaces, library-metrics (user metric cards), tenant root"
          (doseq [[label id] {"regular"          regular
                              "transforms-ns"    transforms-coll
                              "library-metrics"  lib-metrics
                              "tenant-root-type" tenant-root}]
            (is (contains? eligible id) label)))
        (testing "out: sample, library root (holds only the sub-roots), library-data (Tables-only),
                  instance-analytics, snippets, archived, Trash"
          (doseq [[label id] {"sample"             sample
                              "library-root"       lib-root
                              "library-data"       lib-data
                              "instance-analytics" ia
                              "snippets-ns"        snippets
                              "archived"           archived
                              "trash"              (collection/trash-collection-id)}]
            (is (not (contains? eligible id)) label)))))))

(deftest imbalanced-subjects-match-the-shared-definition-test
  (testing "the imbalanced checkers scan exactly the shared collection-subject set"
    (mt/with-temp [:model/Collection {regular :id}         {}
                   :model/Collection {transforms-coll :id} {:namespace "transforms"}]
      (let [shared     (t2/select-pks-set :model/Collection {:where common/eligible-collection-where})
            imbalanced (into #{} (map :id) (imbalanced.common/eligible-collections))]
        (is (= shared imbalanced))
        (is (contains? imbalanced regular))
        (is (contains? imbalanced transforms-coll))))))

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
        "transform must not derive ::collection-item - it carries explicit methods")
    (is (not (isa? common/hierarchy :collection ::common/collection-item))
        "collection must not derive ::collection-item - it is a distinct, non-column-resident outlier"))
  (testing "the column registry covers every collection-resident type it feeds"
    (doseq [etype [:card :dashboard :document]]
      (is (vector? (common/context-cols etype)) (str etype " should have context-cols"))
      (is (vector? (common/peer-select-cols etype)))
      (is (vector? (common/candidate-cols etype))))
    (testing "transform is column-based for context only - its peer/candidate reads are bespoke methods"
      (is (vector? (common/context-cols :transform)))
      (is (nil? (common/peer-select-cols :transform)))
      (is (nil? (common/candidate-cols :transform))))
    (testing "collection has no context-cols entry - its breadcrumb anchor comes from location, not a column"
      (is (nil? (common/context-cols :collection))))))

(deftest entity-type-multimethods-are-fail-closed-test
  ;; The per-entity-type multimethods all dispatch through `common/hierarchy` with NO permissive :default, so
  ;; (1) every covered type must resolve a method - a new type left unregistered fails here, not in prod -
  ;; and (2) an unregistered type throws at dispatch rather than silently inheriting collection_id/owner
  ;; assumptions it violates.
  (let [mm-by-name {"read-entity-rows" @#'api.common/read-entity-rows
                    "hydrate-owner"    @#'api.common/hydrate-owner
                    "entity-context"   @#'api.common/entity-context
                    "candidate-rows"   @#'checkers.duplicated/candidate-rows}]
    (testing "every duplicated/serve covered entity-type resolves a method (registry completeness)"
      (doseq [[mm-name mm] mm-by-name
              etype        api.common/covered-entity-types]
        (is (some? (get-method mm etype))
            (format "%s has no method for covered type %s" mm-name etype))))
    (testing ":collection resolves candidate-rows/read-entity-rows/entity-context,
              but is intentionally NOT a hydrate-owner subject (collections have no owner column)"
      (doseq [[mm-name mm] (dissoc mm-by-name "hydrate-owner")]
        (is (some? (get-method mm :collection))
            (format "%s must resolve :collection" mm-name)))
      (is (nil? (get-method @#'api.common/hydrate-owner :collection))
          "hydrate-owner must stay collection-free - collection context comes from entity-context"))
    (testing "an unregistered entity-type resolves no method (no catch-all :default)"
      (doseq [[mm-name mm] mm-by-name]
        (is (nil? (get-method mm :not-an-entity-type))
            (format "%s must stay fail-closed for unregistered types" mm-name))))
    (testing "invoking a multimethod with an unregistered entity-type throws at dispatch"
      (is (thrown? IllegalArgumentException (@#'api.common/hydrate-owner :not-an-entity-type [])))
      (is (thrown? IllegalArgumentException (@#'api.common/entity-context :not-an-entity-type #{})))
      (is (thrown? IllegalArgumentException (@#'api.common/read-entity-rows :not-an-entity-type #{} nil)))
      (is (thrown? IllegalArgumentException (@#'checkers.duplicated/candidate-rows :not-an-entity-type))))))

(deftest finding-type-multimethod-is-fail-closed-test
  ;; `finalize-finding` dispatches per row on the stored `finding_type` with NO permissive :default, so a
  ;; new finding type left unregistered fails here (and at dispatch), not by silently serving an unfinalized
  ;; row missing its native top-level column / details rewrite.
  ;; This branch serves stale/slow/duplicated plus the imbalanced umbrella (empty/sparse/crowded).
  (let [served-finding-types #{:stale :slow :duplicated :empty :sparse :crowded}]
    (testing "every served finding-type resolves a method (registry completeness)"
      (doseq [ftype served-finding-types]
        (is (some? (get-method @#'api.common/finalize-finding ftype))
            (format "finalize-finding has no method for finding-type %s" ftype))))
    (testing "an unregistered finding-type resolves no method (no catch-all :default)"
      (is (nil? (get-method @#'api.common/finalize-finding :not-a-finding-type))))
    (testing "invoking a multimethod with an unregistered finding-type throws at dispatch"
      (is (thrown? IllegalArgumentException
                   (@#'api.common/finalize-finding :not-a-finding-type {} {} {}))))))

(deftest hydrate-findings-tolerates-a-deleted-card-test
  (testing "a card finding whose entity is gone still hydrates - and keeps its stored card_type"
    ;; Not reachable over HTTP - `visible-findings-clause` already drops a finding whose entity row is gone -
    ;; so the hydrator's guard is pinned directly here. It still fires in the wild: a card can be deleted
    ;; between the findings query and the hydration query. card_type is denormalized on the finding row,
    ;; so unlike the live-hydrated fields (description/collection) it survives the entity's deletion.
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card {card-id :id} {:collection_id coll-id :type :model}]
      (t2/delete! :model/Card :id card-id)
      (let [[row] (api.common/hydrate-findings [{:id           1
                                                 :finding_type :stale
                                                 :entity_type  :card
                                                 :entity_id    card-id
                                                 :card_type    :model
                                                 :details      {}}]
                                               nil)]
        (is (some? row))
        (is (= :model (:card_type row)))
        (testing "the live-hydrated fields degrade to nil"
          (is (nil? (get-in row [:details :description])))
          (is (nil? (get-in row [:details :collection]))))))))

(deftest hydrate-findings-attaches-can-write-test
  (testing "can_write reflects whether the current user can trash the entity (curate its collection)"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card {card-id :id} {:collection_id coll-id}]
      (let [can-write? #(-> (api.common/hydrate-findings [{:id           1
                                                           :finding_type :stale
                                                           :entity_type  :card
                                                           :entity_id    card-id
                                                           :details      {}}]
                                                         nil)
                            first
                            :can_write)]
        (testing "an admin can"
          (mt/with-current-user (mt/user->id :crowberto)
            (is (true? (can-write?)))))
        (testing "a user without curate permission on its collection cannot"
          (mt/with-non-admin-groups-no-collection-perms coll-id
            (mt/with-current-user (mt/user->id :rasta)
              (is (false? (can-write?))))))))))

(deftest root-resident-collection-breadcrumb-names-its-own-tree-test
  (testing "a root-resident collection subject's root breadcrumb is labeled by its own namespace, not
            blanket \"Our analytics\" (duplicated spans transforms-ns collections)"
    (mt/with-temp [:model/Collection {transforms-coll :id} {:namespace "transforms"}
                   :model/Collection {default-coll :id}    {}]
      (let [crumb (fn [coll-id]
                    (-> (api.common/hydrate-findings
                         [{:id           1
                           :finding_type :duplicated
                           :entity_type  :collection
                           :entity_id    coll-id
                           :details      {}}]
                         nil)
                        first
                        (get-in [:details :collection])))]
        (testing "a transforms-namespace collection at its tree's root gets the Transforms root label"
          (let [{:keys [id name effective_ancestors]} (crumb transforms-coll)]
            (is (= "root" id))
            (is (= "Transforms" (str name)))
            (is (= [] effective_ancestors))))
        (testing "a default-namespace collection at the root keeps Our analytics"
          (let [{:keys [id name]} (crumb default-coll)]
            (is (= "root" id))
            (is (= "Our analytics" (str name)))))))))

(deftest attach-entity-attrs-stamps-denormalized-columns-test
  (testing "each finding is stamped with its entity's name/created_at/creator across multiple entity types"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card      {card-id :id} {:collection_id coll-id
                                                   :name          "Revenue"
                                                   :type          :model
                                                   :creator_id    (mt/user->id :rasta)}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id
                                                   :name          "Ops"
                                                   :creator_id    (mt/user->id :crowberto)}]
      (let [by-key (into {}
                         (map (juxt (juxt :entity-type :entity-id) identity))
                         (common/attach-entity-attrs
                          [{:entity-type :card :entity-id card-id :finding-type :slow}
                           {:entity-type :dashboard :entity-id dash-id :finding-type :slow}]))]
        (testing "card: name + created_at + creator id and resolved common_name + card-type"
          (let [f (by-key [:card card-id])]
            (is (= "Revenue" (:entity-name f)))
            (is (some? (:entity-created-at f)))
            (is (= (mt/user->id :rasta) (:entity-creator-id f)))
            (is (= "Rasta Toucan" (:entity-creator-name f)))
            (is (= :model (:card-type f)))))
        (testing "dashboard: resolves its own creator, distinct from the card's; no card-type"
          (let [f (by-key [:dashboard dash-id])]
            (is (= "Ops" (:entity-name f)))
            (is (= (mt/user->id :crowberto) (:entity-creator-id f)))
            (is (= "Crowberto Corv" (:entity-creator-name f)))
            (is (nil? (:card-type f)))))))))

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
      (is (nil? (:entity-creator-name out)))
      (testing "a missing card gets :entity-kind :card (the fallback)"
        (is (= :card (:entity-kind out)))))))

(deftest attach-entity-attrs-stamps-entity-kind-test
  (testing "entity-kind = card_type for cards, entity-type otherwise"
    (mt/with-temp [:model/Card      {model-id :id} {:type :model}
                   :model/Card      {q-id :id}     {:type :question}
                   :model/Dashboard {dash-id :id}  {}]
      (is (=? [{:entity-kind :model}
               {:entity-kind :question}
               {:entity-kind :dashboard}]
              (common/attach-entity-attrs
               [{:entity-type :card      :entity-id model-id}
                {:entity-type :card      :entity-id q-id}
                {:entity-type :dashboard :entity-id dash-id}]))))))
