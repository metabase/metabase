(ns metabase.explorations.auto-insights.phase2-test
  "Unit tests for phase-2 pure helpers: extraction, the explorationChart
  placeholder validator, MBQL shape detection, the prose-mirror tree walker,
  and the small placeholder-node parsers.

  No DB, no LLM, no MLv2 (apply-chart-sort is covered by integration tests since
  it requires a real metadata provider)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.explorations.auto-insights.phase2 :as phase2]))

;;; ---------------------------------------------- extract-doc ----------------------------------------------

(deftest extract-doc-tolerates-key-shapes-test
  (testing "Keyword document field"
    (is (= {:type "doc"} (#'phase2/extract-doc {:document {:type "doc"}}))))
  (testing "String document field"
    (is (= {:type "doc"} (#'phase2/extract-doc {"document" {:type "doc"}}))))
  (testing "Missing field or non-map input returns nil"
    (is (nil? (#'phase2/extract-doc {})))
    (is (nil? (#'phase2/extract-doc "not a map")))
    (is (nil? (#'phase2/extract-doc nil)))))

;;; ---------------------------------------------- validate-exploration-chart ----------------------------------------------

(def ^:private valid-placeholder
  {:type  "explorationChart"
   :attrs {:exploration_query_id 42}})

(deftest validate-exploration-chart-happy-path-test
  (testing "Integer id, no sort, no content → valid"
    (is (= [] (#'phase2/validate-exploration-chart valid-placeholder "$.content[0]")))))

(deftest validate-exploration-chart-id-errors-test
  (testing "Missing id is rejected"
    (let [errs (#'phase2/validate-exploration-chart {:type "explorationChart" :attrs {}} "$")]
      (is (some #(str/includes? % "must be an integer") errs))))
  (testing "Non-numeric string id is rejected"
    (let [errs (#'phase2/validate-exploration-chart
                {:type "explorationChart" :attrs {:exploration_query_id "abc"}} "$")]
      (is (some #(str/includes? % "must be an integer") errs))))
  (testing "Numeric string id is accepted (e.g. \"42\")"
    (is (= [] (#'phase2/validate-exploration-chart
               {:type "explorationChart" :attrs {:exploration_query_id "42"}} "$"))))
  (testing "Errors include the path prefix"
    (is (some #(str/starts-with? % "$.foo.attrs.exploration_query_id")
              (#'phase2/validate-exploration-chart
               {:type "explorationChart" :attrs {:exploration_query_id nil}} "$.foo")))))

(deftest validate-exploration-chart-sort-enum-test
  (testing "Allowed sort values pass"
    (doseq [s ["value_desc" "value_asc" "label_asc" "label_desc"]]
      (is (= [] (#'phase2/validate-exploration-chart
                 (assoc-in valid-placeholder [:attrs :sort] s) "$"))
          (str "sort=" s " should validate"))))
  (testing "Disallowed sort values produce an error naming the allowed set"
    (let [errs (#'phase2/validate-exploration-chart
                (assoc-in valid-placeholder [:attrs :sort] "bogus") "$")]
      (is (some #(and (str/includes? % "must be one of")
                      (str/includes? % "value_desc"))
                errs))))
  (testing "Omitted sort is fine"
    (is (= [] (#'phase2/validate-exploration-chart valid-placeholder "$")))))

(deftest validate-exploration-chart-leaf-test
  (testing "explorationChart with a content array is rejected (it's a leaf node)"
    (let [errs (#'phase2/validate-exploration-chart
                (assoc valid-placeholder :content [{:type "text" :text "no"}]) "$")]
      (is (some #(str/includes? % "must not have a `content` array") errs)))))

(deftest validate-exploration-chart-string-keyed-attrs-test
  (testing "String-keyed attrs / content are tolerated (post-JSON-decode shape)"
    (is (= [] (#'phase2/validate-exploration-chart
               {"type" "explorationChart"
                "attrs" {"exploration_query_id" 42 "sort" "value_desc"}}
               "$")))))

;;; ---------------------------------------------- mbql-query? ----------------------------------------------

(deftest mbql-query-test
  (testing "pMBQL shape (`:lib/type :mbql/query`) — keyword and string variants"
    (is (true? (#'phase2/mbql-query? {:lib/type :mbql/query})))
    (is (true? (#'phase2/mbql-query? {"lib/type" "mbql/query"}))))
  (testing "Legacy MBQLv1 shape (`:type :query`) — keyword and string variants"
    (is (true? (#'phase2/mbql-query? {:type :query})))
    (is (true? (#'phase2/mbql-query? {"type" "query"}))))
  (testing "Native queries are not MBQL"
    (is (false? (#'phase2/mbql-query? {:type :native})))
    (is (false? (#'phase2/mbql-query? {"type" "native"}))))
  (testing "Empty or unrelated maps are not MBQL"
    (is (false? (#'phase2/mbql-query? {})))
    (is (false? (#'phase2/mbql-query? {:something :else})))))

;;; ---------------------------------------------- has-existing-order-by? ----------------------------------------------

(deftest has-existing-order-by-test
  (testing "MBQLv1 with an inner order-by"
    (is (#'phase2/has-existing-order-by? {:type :query :query {:order-by [[:asc [:field 1 nil]]]}})))
  (testing "MBQLv1 with no order-by"
    (is (not (#'phase2/has-existing-order-by? {:type :query :query {:source-table 1}}))))
  (testing "pMBQL with an order-by on the last stage"
    (is (#'phase2/has-existing-order-by? {:stages [{:lib/type :mbql.stage/mbql
                                                    :order-by [[:asc {} [:field 1 nil]]]}]})))
  (testing "pMBQL with no order-by on any stage"
    (is (not (#'phase2/has-existing-order-by? {:stages [{:lib/type :mbql.stage/mbql}]}))))
  (testing "pMBQL with string keys (post-JSON-decode)"
    (is (#'phase2/has-existing-order-by? {"stages" [{"order-by" [[:asc {} [:field 1 nil]]]}]}))))

;;; ---------------------------------------------- node-type / explorationchart-* ----------------------------------------------

(deftest node-type-test
  (is (= "paragraph" (#'phase2/node-type {:type "paragraph"})))
  (is (= "paragraph" (#'phase2/node-type {"type" "paragraph"})))
  (is (nil? (#'phase2/node-type "not a map")))
  (is (nil? (#'phase2/node-type nil))))

(deftest explorationchart-eq-id-test
  (testing "Integer ids pass through"
    (is (= 42 (#'phase2/explorationchart-eq-id
               {:type "explorationChart" :attrs {:exploration_query_id 42}}))))
  (testing "Numeric strings parse"
    (is (= 42 (#'phase2/explorationchart-eq-id
               {:type "explorationChart" :attrs {:exploration_query_id "42"}}))))
  (testing "Non-numeric strings return nil (not throw)"
    (is (nil? (#'phase2/explorationchart-eq-id
               {:type "explorationChart" :attrs {:exploration_query_id "abc"}}))))
  (testing "Non-explorationChart nodes return nil even with a valid id attr"
    (is (nil? (#'phase2/explorationchart-eq-id
               {:type "paragraph" :attrs {:exploration_query_id 42}}))))
  (testing "String-keyed attrs work"
    (is (= 42 (#'phase2/explorationchart-eq-id
               {"type" "explorationChart" "attrs" {"exploration_query_id" 42}})))))

(deftest explorationchart-sort-test
  (testing "Allowed sort values pass through"
    (is (= "value_desc" (#'phase2/explorationchart-sort
                         {:attrs {:sort "value_desc"}}))))
  (testing "Disallowed sort values return nil (validator should have rejected upstream)"
    (is (nil? (#'phase2/explorationchart-sort {:attrs {:sort "bogus"}}))))
  (testing "Missing sort returns nil"
    (is (nil? (#'phase2/explorationchart-sort {:attrs {}})))))

;;; ---------------------------------------------- transform-nodes ----------------------------------------------

(deftest transform-nodes-passthrough-test
  (testing "Identity f returns an equivalent tree"
    (let [doc {:type "doc"
               :content [{:type "paragraph"
                          :content [{:type "text" :text "hello"}]}]}]
      (is (= doc (#'phase2/transform-nodes identity doc))))))

(deftest transform-nodes-replace-single-test
  (testing "Returning a single replacement node swaps that node"
    (let [doc {:type "doc"
               :content [{:type "explorationChart" :attrs {:exploration_query_id 1}}
                         {:type "paragraph" :content []}]}
          out (#'phase2/transform-nodes
               (fn [n] (if (= "explorationChart" (:type n))
                         {:type "cardEmbed" :attrs {:id 100}}
                         n))
               doc)]
      (is (= [{:type "cardEmbed" :attrs {:id 100}}
              {:type "paragraph" :content []}]
             (:content out))))))

(deftest transform-nodes-drop-test
  (testing "Returning nil drops the node from its parent's content"
    (let [doc {:type "doc"
               :content [{:type "paragraph" :content []}
                         {:type "explorationChart" :attrs {:exploration_query_id 1}}
                         {:type "paragraph" :content []}]}
          out (#'phase2/transform-nodes
               (fn [n] (when-not (= "explorationChart" (:type n)) n))
               doc)]
      (is (= 2 (count (:content out))))
      (is (every? #(= "paragraph" (:type %)) (:content out))))))

(deftest transform-nodes-splice-test
  (testing "Returning a vector splices the children in place of the original node"
    (let [doc {:type "doc" :content [{:type "marker"}]}
          out (#'phase2/transform-nodes
               (fn [n] (if (= "marker" (:type n))
                         [{:type "a"} {:type "b"} {:type "c"}]
                         n))
               doc)]
      (is (= [{:type "a"} {:type "b"} {:type "c"}] (:content out))))))

(deftest transform-nodes-depth-first-test
  (testing "Children are transformed before the parent (depth-first post-order)"
    (let [trail (atom [])
          doc   {:type "doc"
                 :content [{:type "paragraph"
                            :content [{:type "text" :text "leaf"}]}]}]
      (#'phase2/transform-nodes
       (fn [n] (swap! trail conj (:type n)) n)
       doc)
      (is (= ["text" "paragraph" "doc"] @trail)))))

(deftest transform-nodes-non-map-passthrough-test
  (testing "Non-map inputs pass through unchanged (e.g. for accidental string content)"
    (is (= "raw string" (#'phase2/transform-nodes (constantly :ignored) "raw string")))
    (is (= 42          (#'phase2/transform-nodes (constantly :ignored) 42)))))
