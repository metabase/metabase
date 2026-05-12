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

;;; ---------------------------------------------- downsample-pairs ----------------------------------------------

(deftest downsample-pairs-passthrough-test
  (testing "Sequences at or under the cap are returned unchanged"
    (is (= [[:a 1] [:b 2] [:c 3]]
           (#'phase2/downsample-pairs [:a :b :c] [1 2 3] 5)))
    (is (= [[:a 1] [:b 2] [:c 3]]
           (#'phase2/downsample-pairs [:a :b :c] [1 2 3] 3)))))

(deftest downsample-pairs-preserves-endpoints-test
  (testing "Downsampled sequences always include first and last point"
    (let [xs   (vec (range 100))
          ys   (mapv (partial * 2) xs)
          out  (#'phase2/downsample-pairs xs ys 10)
          firsts (mapv first out)
          lasts  (mapv second out)]
      (is (<= (count out) 10))
      (is (= 0  (first firsts)) "first x preserved")
      (is (= 99 (last firsts))  "last x preserved")
      (is (= 0   (first lasts)) "first y preserved")
      (is (= 198 (last lasts))  "last y preserved"))))

(deftest downsample-pairs-evenly-spaced-test
  (testing "Indices are evenly distributed across the input range"
    (let [xs  (vec (range 21))   ; 0..20
          ys  (vec (range 21))
          out (#'phase2/downsample-pairs xs ys 5)]
      ;; step = 20 / 4 = 5 → indices 0, 5, 10, 15, 20
      (is (= [[0 0] [5 5] [10 10] [15 15] [20 20]] out)))))

(deftest downsample-pairs-distinct-indices-test
  (testing "Duplicate rounded indices are deduplicated (so output can be smaller than n)"
    ;; 3 inputs, asking for 4 samples — rounding produces duplicates that get
    ;; squeezed out. The function takes count(distinct indices) of pairs.
    (let [out (#'phase2/downsample-pairs [:a :b :c] [1 2 3] 4)]
      ;; 3 elements ≤ cap 4 → passthrough kicks in first; covered above.
      (is (= 3 (count out))))))

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

;;; ---------------------------------------------- all-exploration-chart-nodes ----------------------------------------------

(defn- doc-with-embeds
  "Build a small PM doc with the given explorationChart placeholder attrs
  (each map merged into a default `{:type \"explorationChart\" :attrs {...}}`
  node), interleaved with paragraphs so the walk has to descend."
  [& attrs-list]
  {:type    "doc"
   :content (vec
             (mapcat (fn [attrs]
                       [{:type "paragraph" :content [{:type "text" :text "p"}]}
                        {:type "explorationChart" :attrs attrs}])
                     attrs-list))})

(deftest all-exploration-chart-nodes-test
  (testing "Returns every explorationChart node in document order, descending into children"
    (let [doc (doc-with-embeds {:exploration_query_id 1}
                               {:exploration_query_id 2 :sort "value_desc"}
                               {:exploration_query_id 3})
          out (#'phase2/all-exploration-chart-nodes doc)]
      (is (= 3 (count out)))
      (is (= [1 2 3] (mapv (comp :exploration_query_id :attrs) out)))))
  (testing "Empty doc → empty"
    (is (= [] (#'phase2/all-exploration-chart-nodes {:type "doc" :content []}))))
  (testing "Tolerates string keys"
    (is (= 1 (count (#'phase2/all-exploration-chart-nodes
                     {"type"    "doc"
                      "content" [{"type"  "explorationChart"
                                  "attrs" {"exploration_query_id" 1}}]}))))))

;;; ---------------------------------------------- validate-categorical-sorts ----------------------------------------------

(deftest validate-categorical-sorts-flags-missing-sort-on-categorical-test
  (testing "Categorical embed with no sort attr → one error naming the id and the allowed values"
    (let [doc  (doc-with-embeds {:exploration_query_id 64})
          errs (#'phase2/validate-categorical-sorts doc #{64})]
      (is (= 1 (count errs)))
      (is (str/includes? (first errs) "exploration_query_id=64"))
      (is (str/includes? (first errs) "categorical x-axis"))
      (is (str/includes? (first errs) "value_desc")))))

(deftest validate-categorical-sorts-passes-with-sort-test
  (testing "Categorical embed with a valid sort attr → no error"
    (let [doc (doc-with-embeds {:exploration_query_id 64 :sort "value_desc"})]
      (is (= [] (#'phase2/validate-categorical-sorts doc #{64}))))))

(deftest validate-categorical-sorts-ignores-non-categorical-test
  (testing "Time/numeric chart (id not in categorical set) without sort is fine"
    (let [doc (doc-with-embeds {:exploration_query_id 55})]
      (is (= [] (#'phase2/validate-categorical-sorts doc #{64}))))))

(deftest validate-categorical-sorts-multiple-violations-test
  (testing "Each violating embed produces its own error in document order"
    (let [doc  (doc-with-embeds {:exploration_query_id 64}
                                {:exploration_query_id 55 :sort "value_desc"}
                                {:exploration_query_id 64 :sort "value_asc"}
                                {:exploration_query_id 68})
          errs (#'phase2/validate-categorical-sorts doc #{64 68})]
      ;; The two violating ones are #1 (id 64 no sort) and #4 (id 68 no sort).
      (is (= 2 (count errs)))
      (is (str/includes? (nth errs 0) "exploration_query_id=64"))
      (is (str/includes? (nth errs 1) "exploration_query_id=68")))))

(deftest validate-categorical-sorts-empty-categorical-set-test
  (testing "When no top-tier charts are categorical, this check is a no-op"
    (let [doc (doc-with-embeds {:exploration_query_id 64})]
      (is (= [] (#'phase2/validate-categorical-sorts doc #{}))))))

;;; ---------------------------------------------- validate-no-duplicate-embeds ----------------------------------------------

(deftest validate-no-duplicate-embeds-flags-same-id-same-sort-test
  (testing "Two embeds of the same chart with the same (missing) sort → one error"
    (let [doc  (doc-with-embeds {:exploration_query_id 64}
                                {:exploration_query_id 64})
          errs (#'phase2/validate-no-duplicate-embeds doc)]
      (is (= 1 (count errs)))
      (is (str/includes? (first errs) "exploration_query_id=64"))
      (is (str/includes? (first errs) "appears 2 times"))
      (is (str/includes? (first errs) "distinct sorts"))))
  (testing "Two embeds of the same chart with the same explicit sort → still flagged"
    (let [doc  (doc-with-embeds {:exploration_query_id 64 :sort "value_desc"}
                                {:exploration_query_id 64 :sort "value_desc"})
          errs (#'phase2/validate-no-duplicate-embeds doc)]
      (is (= 1 (count errs)))
      (is (str/includes? (first errs) "value_desc")))))

(deftest validate-no-duplicate-embeds-passes-with-different-sorts-test
  (testing "Same chart with different sorts is the legitimate case — no error"
    (let [doc (doc-with-embeds {:exploration_query_id 64 :sort "value_desc"}
                               {:exploration_query_id 64 :sort "value_asc"})]
      (is (= [] (#'phase2/validate-no-duplicate-embeds doc))))))

(deftest validate-no-duplicate-embeds-passes-with-different-ids-test
  (testing "Different charts (regardless of sort) don't conflict"
    (let [doc (doc-with-embeds {:exploration_query_id 64}
                               {:exploration_query_id 71})]
      (is (= [] (#'phase2/validate-no-duplicate-embeds doc))))))

(deftest validate-no-duplicate-embeds-triple-count-test
  (testing "Three or more copies → the error message says how many"
    (let [doc  (doc-with-embeds {:exploration_query_id 64}
                                {:exploration_query_id 64}
                                {:exploration_query_id 64})
          errs (#'phase2/validate-no-duplicate-embeds doc)]
      (is (= 1 (count errs)))
      (is (str/includes? (first errs) "appears 3 times")))))

;;; ---------------------------------------------- validate-doc combined ----------------------------------------------

(deftest validate-doc-combines-errors-test
  (testing "validate-doc concatenates schema, categorical-sort, and duplicate errors"
    ;; This doc has two distinct problems on a single embed shape:
    ;;   - id 64 is categorical but no sort → categorical-sort error
    ;;   - id 64 appears twice with the same (missing) sort → duplicate error
    (let [doc  (doc-with-embeds {:exploration_query_id 64}
                                {:exploration_query_id 64})
          errs (#'phase2/validate-doc doc #{64})]
      (is (some #(str/includes? % "categorical x-axis") errs))
      (is (some #(str/includes? % "appears 2 times") errs)))))
