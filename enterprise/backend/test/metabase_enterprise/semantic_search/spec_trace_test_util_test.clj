(ns metabase-enterprise.semantic-search.spec-trace-test-util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.spec-trace-test-util :as spec-trace]))

;; Seed extraction (shorthand `true`, vector/`:case`/`:fields` expressions, control-keyword filtering) is
;; `search.spec/find-fields-attr`'s behavior and is tested there. These tests cover this util's own logic:
;; the join-equality graph walk, and that the two attr forms real specs use (`true` and a `:alias.col`
;; keyword) seed it correctly.

(deftest trace-reaches-every-model-on-the-collection-id-path-test
  ;; indexed-entity shape: `:collection-id` → `:collection.id` joins to `:model.collection_id`, so both
  ;; Collection and Card are structurally valid `:denormalized-from` claims.
  (is (= #{:model/Collection :model/Card}
         (spec-trace/trace-collection-id-source-models
          {:model :model/ModelIndexValue
           :attrs {:collection-id :collection.id}
           :joins {:model_index [:model/ModelIndex [:= :model_index.id :this.model_index_id]]
                   :model       [:model/Card [:= :model.id :model_index.model_id]]
                   :collection  [:model/Collection [:= :collection.id :model.collection_id]]}}))))

(deftest trace-excludes-joins-not-on-the-collection-id-path-test
  ;; `:table` is joined for display only; models reached through joins that don't connect to the
  ;; `:collection-id` seed must not appear.
  (is (= #{:model/Collection :model/Base}
         (spec-trace/trace-collection-id-source-models
          {:model :model/Base
           :attrs {:collection-id :collection.id}
           :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                   :table      [:model/Table [:= :table.id :this.table_id]]}}))))

(deftest trace-walks-equalities-inside-compound-and-conditions-test
  (is (= #{:model/Collection :model/Base}
         (spec-trace/trace-collection-id-source-models
          {:model :model/Base
           :attrs {:collection-id :collection.id}
           :joins {:collection [:model/Collection
                                [:and [:= :this.is_published true]
                                 [:= :collection.id :this.collection_id]]]}}))))

(deftest trace-seeds-from-true-shorthand-test
  ;; card/dashboard shape: `:collection-id true` means `:this.collection_id`. The seed must expand the
  ;; shorthand or the walk starts from `true` and reaches nothing.
  (is (= #{:model/Base :model/Collection}
         (spec-trace/trace-collection-id-source-models
          {:model :model/Base
           :attrs {:collection-id true}
           :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]}}))))
