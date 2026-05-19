(ns metabase.agent-lib.repair.context.passes-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.repair.context.passes :as passes]
   [metabase.agent-lib.test-util :as agent-lib.tu]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel effective-source-for-context-rewrites-metric-context-source-test
  (let [program {:source {:type "context" :ref "source"}}
        context {:source-entity {:model "metric" :id 42}}]
    (is (= {:type "metric" :id 42}
           (passes/effective-source-for-context program context)))))

(deftest ^:parallel rewrite-source-stage-only-touches-the-first-stage-test
  (let [operations [["aggregate" ["count"]]
                    ["append-stage"]
                    ["aggregate" ["sum" ["field" 1]]]]
        rewritten  (passes/rewrite-source-stage
                    operations
                    (fn [{:keys [in-source-stage? operations] :as state} operation]
                      (assoc state
                             :operations
                             (conj operations
                                   (if in-source-stage?
                                     ["seen" operation]
                                     operation)))))]
    (is (= [["seen" ["aggregate" ["count"]]]
            ["append-stage"]
            ["aggregate" ["sum" ["field" 1]]]]
           rewritten))))

(deftest ^:parallel normalize-source-metric-quarter-window-rewrites-rolling-quarter-filter-test
  (let [context    {:source-entity {:model "metric" :id 42}}
        operation  ["filter" ["between"
                              ["field" (meta/id :orders :created-at)]
                              ["relative-datetime" -3 "month"]
                              ["now"]]]
        normalized (passes/normalize-source-metric-quarter-window context operation)]
    (is (= ["filter" ["between"
                      ["field" (meta/id :orders :created-at)]
                      ["relative-datetime" -1 "quarter"]
                      ["relative-datetime" 0 "quarter"]]]
           normalized))))

(deftest ^:parallel remove-redundant-operations-drops-source-metric-and-implicit-join-noise-test
  (let [metric-context {:source-entity {:model "metric" :id 7}}
        table-context  {:source-entity      {:model "table" :id (meta/id :venues)}
                        :surrounding-tables [(agent-lib.tu/entity-summary :categories)]
                        :join-edges         [(agent-lib.tu/join-edge :venues :category-id :categories :id)]}
        metric-aggregate ["aggregate" ["metric" 7]]
        explicit-join    ["join"
                          ["with-join-conditions"
                           ["join-clause" ["table" (meta/id :categories)]]
                           [["=" ["field" (meta/id :venues :category-id)]
                             ["field" (meta/id :categories :id)]]]]]
        kept-operation   ["filter" ["=" ["field" (meta/id :venues :name)] "Red Medicine"]]]
    (testing "source-metric reuse is dropped in metric contexts"
      (is (= [kept-operation]
             (vec (passes/remove-redundant-operations metric-context
                                                      [metric-aggregate kept-operation])))))
    (testing "implicit joins already represented by the context are dropped for table sources"
      (is (= [kept-operation]
             (vec (passes/remove-redundant-operations table-context
                                                      [explicit-join kept-operation])))))))
