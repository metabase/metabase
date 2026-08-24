(ns metabase.util.hierarchy-visualization-test
  "Tests for the dev-only hierarchy renderers in [[dev.hierarchy-visualization]]."
  (:require
   [clojure.test :refer [deftest is testing]]
   [dev.hierarchy-visualization :as hierarchy.visualization]
   [metabase.util.ordered-hierarchy :as ordered-hierarchy]))

(set! *warn-on-reflection* true)

(def ^:private regular-hierarchy
  (-> (make-hierarchy)
      (derive :left :root)
      (derive :right :root)
      (derive :shared :left)
      (derive :shared :right)))

(deftest ^:parallel hierarchy->graph-test
  (testing "Regular hierarchies have stable default ordering"
    (is (= {:nodes    [:left :right :root :shared]
            :roots    [:root]
            :children {:left   [:shared]
                       :right  [:shared]
                       :root   [:left :right]
                       :shared []}}
           (hierarchy.visualization/hierarchy->graph regular-hierarchy))))
  (testing "Ordered hierarchies retain basis and root order"
    (let [hierarchy (ordered-hierarchy/make-hierarchy
                     [:first-root :leaf [:branch :grandchild]]
                     [:second-root])]
      (is (= {:nodes    [:first-root :leaf :branch :grandchild :second-root]
              :roots    [:first-root :second-root]
              :children {:first-root  [:leaf :branch]
                         :leaf        []
                         :branch      [:grandchild]
                         :grandchild  []
                         :second-root []}}
             (hierarchy.visualization/hierarchy->graph hierarchy))))))

(deftest ^:parallel tree-str-test
  (is (= (str ":root\n"
              "├── :left\n"
              "│   └── :shared\n"
              "└── :right\n"
              "    └── :shared ↩")
         (hierarchy.visualization/tree-str regular-hierarchy)))
  (testing "Shared subtrees can be repeated"
    (is (= (str ":root\n"
                "|-- :left\n"
                "|   `-- :shared\n"
                "`-- :right\n"
                "    `-- :shared")
           (hierarchy.visualization/tree-str regular-hierarchy
                                             {:ascii? true, :repeat-shared? true}))))
  (testing "Depth and node limits are rendered explicitly"
    (is (= (str ":root\n"
                "├── :left\n"
                "│   └── …\n"
                "└── :right\n"
                "    └── …")
           (hierarchy.visualization/tree-str regular-hierarchy {:max-depth 1})))
    (is (= (str ":root\n"
                "├── :left\n"
                "│   └── …")
           (hierarchy.visualization/tree-str regular-hierarchy {:max-nodes 2}))))
  (testing "Empty hierarchies have useful REPL output"
    (is (= "(empty hierarchy)"
           (hierarchy.visualization/tree-str (make-hierarchy)))))
  (testing "print-tree adds a trailing newline and returns nil"
    (is (= ":root\n"
           (with-out-str
             (is (nil? (hierarchy.visualization/print-tree
                        (ordered-hierarchy/make-hierarchy [:root])))))))))

(deftest ^:parallel dot-str-test
  (is (= (str "digraph hierarchy {\n"
              "  rankdir=LR;\n"
              "  n0 [label=\"left\"];\n"
              "  n1 [label=\"right\"];\n"
              "  n2 [label=\"root\"];\n"
              "  n3 [label=\"shared\"];\n"
              "  n0 -> n3;\n"
              "  n1 -> n3;\n"
              "  n2 -> n0;\n"
              "  n2 -> n1;\n"
              "}")
         (hierarchy.visualization/dot-str regular-hierarchy
                                          {:direction "LR", :label-fn name})))
  (testing "Windows and old-Mac newlines are normalized"
    (is (= (str "digraph hierarchy {\n"
                "  rankdir=TB;\n"
                "  n0 [label=\"first\\nsecond\\nthird\"];\n"
                "}")
           (hierarchy.visualization/dot-str
            (ordered-hierarchy/make-hierarchy [:root])
            {:label-fn (constantly "first\r\nsecond\rthird")})))))

(deftest ^:parallel mermaid-str-test
  (is (= (str "flowchart TD\n"
              "  n0[\"left\"]\n"
              "  n1[\"right\"]\n"
              "  n2[\"root\"]\n"
              "  n3[\"shared\"]\n"
              "  n0 --> n3\n"
              "  n1 --> n3\n"
              "  n2 --> n0\n"
              "  n2 --> n1")
         (hierarchy.visualization/mermaid-str regular-hierarchy {:label-fn name})))
  (testing "Windows and old-Mac newlines are normalized"
    (is (= (str "flowchart TD\n"
                "  n0[\"first<br/>second<br/>third\"]")
           (hierarchy.visualization/mermaid-str
            (ordered-hierarchy/make-hierarchy [:root])
            {:label-fn (constantly "first\r\nsecond\rthird")})))))
