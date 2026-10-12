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

(deftest ^:parallel nodes-alphabetical-test
  (is (= [:left :right :root :shared]
         (hierarchy.visualization/nodes regular-hierarchy {:order :alphabetical})))
  (testing "Ordered hierarchies sort alphabetically too, ignoring derivation order"
    (let [hierarchy (ordered-hierarchy/make-hierarchy [:root :zebra :apple])]
      (is (= [:apple :root :zebra]
             (hierarchy.visualization/nodes hierarchy {:order :alphabetical})))))
  (testing "`:sort-by` replaces the default node sort key"
    (is (= [:root :left :right :shared]
           (hierarchy.visualization/nodes regular-hierarchy
                                          {:order   :alphabetical
                                           :sort-by {:root 0, :left 1, :right 2, :shared 3}})))))

(deftest ^:parallel nodes-topological-test
  (testing "Every node precedes its parents, with alphabetical tie-breaks"
    (is (= [:shared :left :right :root]
           (hierarchy.visualization/nodes regular-hierarchy))))
  (testing "Ordered hierarchies break ties by derivation order instead"
    (let [hierarchy (ordered-hierarchy/make-hierarchy [:root :zebra :apple])]
      (is (= [:zebra :apple :root]
             (hierarchy.visualization/nodes hierarchy))))))

(deftest ^:parallel nodes-matches-ordered-hierarchy-test
  (testing "Ordered hierarchies get the same order the runtime itself uses"
    (doseq [[description hierarchy]
            {"a diamond"    (-> (ordered-hierarchy/make-hierarchy [:root :left :right])
                                (ordered-hierarchy/derive :shared :left)
                                (ordered-hierarchy/derive :shared :right))
             "nested bases" (ordered-hierarchy/make-hierarchy
                             [:first-root :leaf [:branch :grandchild]]
                             [:second-root])}]
      (testing description
        (is (= (vec (ordered-hierarchy/sorted-tags hierarchy))
               (hierarchy.visualization/nodes hierarchy)))))))

(deftest ^:parallel nodes-malformed-test
  (testing "A hand-built cycle still emits every node exactly once"
    (let [cyclic {:parents {:a #{:b}, :b #{:a}}}]
      (is (= [:a :b]
             (sort (hierarchy.visualization/nodes cyclic))))))
  (testing "An unsupported order is rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unsupported node order"
                          (hierarchy.visualization/nodes regular-hierarchy {:order :random})))))

(deftest ^:parallel print-nodes-test
  (is (= ":shared\n:left\n:right\n:root\n"
         (with-out-str (hierarchy.visualization/print-nodes regular-hierarchy))))
  (testing "`:label-fn` controls how each node is rendered"
    (is (= "shared\nleft\nright\nroot\n"
           (with-out-str (hierarchy.visualization/print-nodes regular-hierarchy {:label-fn name})))))
  (testing "An empty hierarchy says so instead of printing a blank line"
    (is (= "(empty hierarchy)\n"
           (with-out-str (hierarchy.visualization/print-nodes (make-hierarchy)))))))
