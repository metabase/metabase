(ns metabase.metabot.tools.charts.select-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.charts.select :as select]))

(def ^:private summary
  {:status         :completed
   :result_columns [{:name "product" :display_name "Product"}
                    {:name "count" :display_name "Count"}]
   :rows           [["Widget" 1] ["Gadget" 1137] ["Gizmo" 1] ["Doohickey" 42]]})

(deftest select-targets-test
  (testing "equality filter selects the matching points (the '1 order' case)"
    (is (= [["Widget" 1] ["Gizmo" 1]]
           (mapv :row (select/select-targets summary ["=" "count" 1])))))

  (testing "numeric comparison filters"
    (is (= [["Gadget" 1137]]
           (mapv :row (select/select-targets summary [">" "count" 100]))))
    (is (= [["Widget" 1] ["Gizmo" 1] ["Doohickey" 42]]
           (mapv :row (select/select-targets summary ["<" "count" 1000])))))

  (testing "between filter"
    (is (= [["Doohickey" 42]]
           (mapv :row (select/select-targets summary ["between" "count" 10 100])))))

  (testing "and / or / not combinators"
    (is (= [["Doohickey" 42]]
           (mapv :row (select/select-targets summary ["and" [">" "count" 1] ["<" "count" 1000]]))))
    (is (= [["Widget" 1] ["Gadget" 1137] ["Gizmo" 1]]
           (mapv :row (select/select-targets summary ["or" ["=" "count" 1] ["=" "count" 1137]]))))
    (is (= [["Gadget" 1137] ["Doohickey" 42]]
           (mapv :row (select/select-targets summary ["not" ["=" "count" 1]])))))

  (testing "in / not-in over a dimension column, matched by display name (case-insensitive)"
    (is (= [["Widget" 1] ["Gizmo" 1]]
           (mapv :row (select/select-targets summary ["in" "Product" ["Widget" "Gizmo"]]))))
    (is (= [["Gadget" 1137] ["Doohickey" 42]]
           (mapv :row (select/select-targets summary ["not-in" "product" ["Widget" "Gizmo"]])))))

  (testing "targets mirror the data-point target shape (columns, row, last-column value index)"
    (let [[t] (select/select-targets summary ["=" "count" 1137])]
      (is (= {:columns ["product" "count"] :row ["Gadget" 1137] :value_column_index 1} t))))

  (testing "an unknown column is an agent error"
    (is (thrown-with-msg? Exception #"Unknown column"
                          (select/select-targets summary ["=" "nope" 1]))))

  (testing "selection is capped to keep streamed state small"
    (let [big {:status :completed
               :result_columns [{:name "v"}]
               :rows (mapv (fn [_] [1]) (range 5000))}]
      (is (= 1000 (count (select/select-targets big ["=" "v" 1])))))))

(deftest format-selection-result-test
  (let [targets (select/select-targets summary ["=" "count" 1])
        result  (select/format-selection-result {:selection-id "sel-1"
                                                 :targets       targets
                                                 :label         "single-order products"})]
    (testing "output references the selection with a data-selection link and point count"
      (is (str/includes? (:output result) "metabase://data-selection/sel-1"))
      (is (str/includes? (:output result) "points=\"2\""))
      (is (str/includes? (:output result) "highlights all 2 selected points")))
    (testing "structured-output carries the selection for the agent state"
      (is (= {:targets targets :count 2 :label "single-order products"}
             (get-in result [:structured-output :data-selections "sel-1"]))))))

(deftest resolve-selection-query-test
  (testing "prefers an explicit query id"
    (is (= {:database 1}
           (select/resolve-selection-query {} {"q-1" {:database 1}} nil "q-1"))))

  (testing "falls back to the first query backing a chart"
    (is (= {:database 2}
           (select/resolve-selection-query {"c-1" {:queries [{:database 2}]}} {} "c-1" nil))))

  (testing "throws an agent error when nothing resolves"
    (is (thrown-with-msg? Exception #"No chart or query"
                          (select/resolve-selection-query {} {} "missing" nil)))))
