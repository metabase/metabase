(ns metabase-enterprise.semantic-search.spec-trace-test-util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.spec-trace-test-util :as spec-trace]))

(deftest trace-collection-id-source-models-test
  (testing "traces `:collection-id` through `[:= a b]` equalities to every equivalent model"
    ;; Mirrors the `indexed-entity` spec shape: `:collection-id` → `:collection.id`, which joins to
    ;; `:model.collection_id`, so both :model/Collection and :model/Card are valid claims.
    (is (= #{:model/Collection :model/Card}
           (spec-trace/trace-collection-id-source-models
            {:model :model/ModelIndexValue
             :attrs {:collection-id :collection.id}
             :joins {:model_index [:model/ModelIndex [:= :model_index.id :this.model_index_id]]
                     :model       [:model/Card [:= :model.id :model_index.model_id]]
                     :collection  [:model/Collection [:= :collection.id :model.collection_id]]}}))))
  (testing "unrelated joins do not pollute the source set"
    ;; A join for some other field must not count: `:table` is joined for display but `:collection.id`
    ;; only resolves through `:this.collection_id`.
    (is (= #{:model/Collection :model/Base}
           (spec-trace/trace-collection-id-source-models
            {:model :model/Base
             :attrs {:collection-id :collection.id}
             :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                     :table      [:model/Table [:= :table.id :this.table_id]]}}))))
  (testing "handles compound `:and` conditions"
    (is (= #{:model/Collection :model/Base}
           (spec-trace/trace-collection-id-source-models
            {:model :model/Base
             :attrs {:collection-id :collection.id}
             :joins {:collection [:model/Collection
                                  [:and [:= :this.is_published true]
                                   [:= :collection.id :this.collection_id]]]}}))))
  (testing "normalizes shorthand `true` to `:this.<attr-name-in-snake-case>`"
    ;; Mirrors the card/dashboard spec shape where `:collection-id true` means the direct column on
    ;; the base model. Without this normalization the walk would start from `true` and reach nothing.
    (is (= #{:model/Base :model/Collection}
           (spec-trace/trace-collection-id-source-models
            {:model :model/Base
             :attrs {:collection-id true}
             :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]}}))))
  (testing "extracts referenced columns from a vector attr expression"
    ;; A computed `:collection-id` seeds the walk from every column keyword in the expression.
    ;; The fixture is shaped so each referenced column reaches a distinct model: without extracting
    ;; `:collection.id` the walk misses `:model/Collection`, and without extracting `:other.foo` it
    ;; misses `:model/Other`. A regression that only seeded from the first column would fail.
    (is (= #{:model/Base :model/Collection :model/Other}
           (spec-trace/trace-collection-id-source-models
            {:model :model/Base
             :attrs {:collection-id [:coalesce :collection.id :other.foo]}
             :joins {:collection [:model/Collection [:= :collection.id :this.c]]
                     :other      [:model/Other [:= :other.foo :this.o]]}}))))
  (testing "recurses into nested vector expressions"
    ;; Mirrors `find-fields-expr`: a `:case` form contains a nested `[:= ...]` predicate plus a
    ;; direct branch keyword. The recursive walk must pull column refs out of the nested predicate —
    ;; if it didn't descend, `:other.flag` would never seed the walk and `:model/Other` would be
    ;; missing from the reachable set.
    (is (= #{:model/Base :model/Collection :model/Other}
           (spec-trace/trace-collection-id-source-models
            {:model :model/Base
             :attrs {:collection-id [:case [:= :other.flag true] :collection.id :this.collection_id]}
             :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                     :other      [:model/Other [:= :other.flag :this.other_flag]]}}))))
  (testing "descends into `{:fn ... :fields [...]}` attr maps"
    ;; The search spec allows `{:fn f :fields [:a :b]}` attr values; `find-fields-expr` descends
    ;; into `:fields`. The test helper must do the same.
    (is (= #{:model/Base :model/Collection}
           (spec-trace/trace-collection-id-source-models
            {:model :model/Base
             :attrs {:collection-id {:fn identity :fields [:collection.id]}}
             :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]}})))))

(deftest attr-expr-columns-skips-control-keywords-test
  (testing "control and SQL-function keywords are dropped instead of being qualified to `:this.<kw>`"
    ;; `qualify-this` would otherwise turn `:else` into `:this.else` and let branch/type keywords
    ;; masquerade as column references. Integration coverage can't distinguish filtered from
    ;; unfiltered behavior because `:this` usually resolves to a model already in the expected set,
    ;; so assert directly against the extractor.
    (doseq [kw [:else :integer :float :%now :%foo]]
      (testing kw
        (is (= #{} (spec-trace/attr-expr-columns kw))
            (str kw " should be filtered, not returned as a column reference"))))
    (testing "filtering happens inside nested vector expressions too"
      (is (= #{:other.flag :collection.id}
             (spec-trace/attr-expr-columns [:case [:= :other.flag true] :collection.id :else :integer]))))
    (testing "non-control keywords are still qualified to `:this`"
      (is (= #{:this.foo} (spec-trace/attr-expr-columns :foo))))))
