(ns metabase.explorations.auto-insights.phase2-test
  "Unit tests for phase-2 pure helpers: extraction, the staticCardEmbed
  validator, the small node parsers, and the doc-level cross-cutting
  validators.

  No DB, no LLM."
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

;;; ---------------------------------------------- validate-static-card-embed ----------------------------------------------

(def ^:private valid-node
  {:type  "staticCardEmbed"
   :attrs {:exploration_query_id 42}})

(deftest validate-static-card-embed-happy-path-test
  (testing "Integer id, no sort, no content → valid"
    (is (= [] (#'phase2/validate-static-card-embed valid-node "$.content[0]")))))

(deftest validate-static-card-embed-id-errors-test
  (testing "Missing id is rejected"
    (let [errs (#'phase2/validate-static-card-embed {:type "staticCardEmbed" :attrs {}} "$")]
      (is (some #(str/includes? % "must be an integer") errs))))
  (testing "Non-numeric string id is rejected"
    (let [errs (#'phase2/validate-static-card-embed
                {:type "staticCardEmbed" :attrs {:exploration_query_id "abc"}} "$")]
      (is (some #(str/includes? % "must be an integer") errs))))
  (testing "Numeric string id is accepted (e.g. \"42\")"
    (is (= [] (#'phase2/validate-static-card-embed
               {:type "staticCardEmbed" :attrs {:exploration_query_id "42"}} "$"))))
  (testing "Errors include the path prefix"
    (is (some #(str/starts-with? % "$.foo.attrs.exploration_query_id")
              (#'phase2/validate-static-card-embed
               {:type "staticCardEmbed" :attrs {:exploration_query_id nil}} "$.foo")))))

(deftest validate-static-card-embed-sort-enum-test
  (testing "Allowed sort values pass"
    (doseq [s ["value_desc" "value_asc" "label_asc" "label_desc"]]
      (is (= [] (#'phase2/validate-static-card-embed
                 (assoc-in valid-node [:attrs :sort] s) "$"))
          (str "sort=" s " should validate"))))
  (testing "Disallowed sort values produce an error naming the allowed set"
    (let [errs (#'phase2/validate-static-card-embed
                (assoc-in valid-node [:attrs :sort] "bogus") "$")]
      (is (some #(and (str/includes? % "must be one of")
                      (str/includes? % "value_desc"))
                errs))))
  (testing "Omitted sort is fine"
    (is (= [] (#'phase2/validate-static-card-embed valid-node "$")))))

(deftest validate-static-card-embed-leaf-test
  (testing "staticCardEmbed with a content array is rejected (it's a leaf node)"
    (let [errs (#'phase2/validate-static-card-embed
                (assoc valid-node :content [{:type "text" :text "no"}]) "$")]
      (is (some #(str/includes? % "must not have a `content` array") errs)))))

(deftest validate-static-card-embed-string-keyed-attrs-test
  (testing "String-keyed attrs / content are tolerated (post-JSON-decode shape)"
    (is (= [] (#'phase2/validate-static-card-embed
               {"type" "staticCardEmbed"
                "attrs" {"exploration_query_id" 42 "sort" "value_desc"}}
               "$")))))

;;; ---------------------------------------------- node-type / static-card-embed-* ----------------------------------------------

(deftest node-type-test
  (is (= "paragraph" (#'phase2/node-type {:type "paragraph"})))
  (is (= "paragraph" (#'phase2/node-type {"type" "paragraph"})))
  (is (nil? (#'phase2/node-type "not a map")))
  (is (nil? (#'phase2/node-type nil))))

(deftest static-card-embed-eq-id-test
  (testing "Integer ids pass through"
    (is (= 42 (#'phase2/static-card-embed-eq-id
               {:type "staticCardEmbed" :attrs {:exploration_query_id 42}}))))
  (testing "Numeric strings parse"
    (is (= 42 (#'phase2/static-card-embed-eq-id
               {:type "staticCardEmbed" :attrs {:exploration_query_id "42"}}))))
  (testing "Non-numeric strings return nil (not throw)"
    (is (nil? (#'phase2/static-card-embed-eq-id
               {:type "staticCardEmbed" :attrs {:exploration_query_id "abc"}}))))
  (testing "Non-staticCardEmbed nodes return nil even with a valid id attr"
    (is (nil? (#'phase2/static-card-embed-eq-id
               {:type "paragraph" :attrs {:exploration_query_id 42}}))))
  (testing "String-keyed attrs work"
    (is (= 42 (#'phase2/static-card-embed-eq-id
               {"type" "staticCardEmbed" "attrs" {"exploration_query_id" 42}})))))

(deftest static-card-embed-sort-test
  (testing "Allowed sort values pass through"
    (is (= "value_desc" (#'phase2/static-card-embed-sort
                         {:attrs {:sort "value_desc"}}))))
  (testing "Disallowed sort values return nil (validator should have rejected upstream)"
    (is (nil? (#'phase2/static-card-embed-sort {:attrs {:sort "bogus"}}))))
  (testing "Missing sort returns nil"
    (is (nil? (#'phase2/static-card-embed-sort {:attrs {}})))))

;;; ---------------------------------------------- all-static-card-embed-nodes ----------------------------------------------

(defn- doc-with-embeds
  "Build a small PM doc with the given staticCardEmbed attrs (each map merged
  into a default `{:type \"staticCardEmbed\" :attrs {...}}` node), interleaved
  with paragraphs so the walk has to descend."
  [& attrs-list]
  {:type    "doc"
   :content (vec
             (mapcat (fn [attrs]
                       [{:type "paragraph" :content [{:type "text" :text "p"}]}
                        {:type "staticCardEmbed" :attrs attrs}])
                     attrs-list))})

(deftest all-static-card-embed-nodes-test
  (testing "Returns every staticCardEmbed in document order, descending into children"
    (let [doc (doc-with-embeds {:exploration_query_id 1}
                               {:exploration_query_id 2 :sort "value_desc"}
                               {:exploration_query_id 3})
          out (#'phase2/all-static-card-embed-nodes doc)]
      (is (= 3 (count out)))
      (is (= [1 2 3] (mapv (comp :exploration_query_id :attrs) out)))))
  (testing "Empty doc → empty"
    (is (= [] (#'phase2/all-static-card-embed-nodes {:type "doc" :content []}))))
  (testing "Tolerates string keys"
    (is (= 1 (count (#'phase2/all-static-card-embed-nodes
                     {"type"    "doc"
                      "content" [{"type"  "staticCardEmbed"
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
