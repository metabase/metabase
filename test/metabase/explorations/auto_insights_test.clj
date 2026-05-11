(ns metabase.explorations.auto-insights-test
  "Unit tests for the orchestrator-namespace helpers that don't need a DB or LLM:
  the reasoning-trace filter, the error-doc builder, and the
  append-reasoning-section no-op / append behavior."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.explorations.auto-insights :as auto-insights]))

;;; ---------------------------------------------- attempt-reasonings ----------------------------------------------

(deftest attempt-reasonings-test
  (testing "Keeps attempts that produced a reasoning trace, drops the rest"
    (let [attempts [{:attempt 1 :trace {:reasoning "step one"}}
                    {:attempt 2 :trace {}}
                    {:attempt 3 :trace {:reasoning "step three"}}]]
      (is (= [{:attempt 1 :reasoning "step one"}
              {:attempt 3 :reasoning "step three"}]
             (#'auto-insights/attempt-reasonings attempts)))))
  (testing "Blank reasoning is treated as no reasoning (not-empty)"
    (is (= [] (#'auto-insights/attempt-reasonings
               [{:attempt 1 :trace {:reasoning ""}}]))))
  (testing "Empty input → empty vector"
    (is (= [] (#'auto-insights/attempt-reasonings [])))))

;;; ---------------------------------------------- error-doc ----------------------------------------------

(defn- find-text
  "Concatenate every text-node string in a PM doc tree (depth-first) for
  easy substring assertions."
  [node]
  (cond
    (and (map? node) (= "text" (:type node))) (:text node)
    (map? node) (apply str (map find-text (:content node)))
    (sequential? node) (apply str (map find-text node))
    :else ""))

(deftest error-doc-shape-test
  (testing "Error doc is a ProseMirror doc with the expected top-level structure"
    (let [d (#'auto-insights/error-doc {:phase        :phase-1
                                        :thread-id    42
                                        :final-errors ["something broke"]
                                        :detail       "extra context"})]
      (is (= "doc" (:type d)))
      (is (= "heading"   (-> d :content (nth 0) :type)))
      (is (= 2           (-> d :content (nth 0) :attrs :level)))
      (let [all-text (find-text d)]
        (is (str/includes? all-text "Automatic Insights generation failed"))
        (is (str/includes? all-text "Phase 1 — Chart curation"))
        (is (str/includes? all-text "something broke"))
        (is (str/includes? all-text "extra context"))
        (is (str/includes? all-text "(metabase.explorations.auto-insights/debug-transcript 42)"))))))

(deftest error-doc-no-detail-test
  (testing "When :detail is omitted, no Details heading is emitted"
    (let [d (#'auto-insights/error-doc {:phase :phase-2 :thread-id 7 :final-errors ["x"]})]
      (is (not (str/includes? (find-text d) "Details"))
          "Details heading should not appear when :detail is nil"))))

(deftest error-doc-empty-errors-test
  (testing "Empty final-errors → a fallback paragraph, no bulletList"
    (let [d (#'auto-insights/error-doc {:phase :phase-2 :thread-id 7 :final-errors []})]
      (is (str/includes? (find-text d) "(no specific errors captured")))))

(deftest error-doc-phase-labels-test
  (testing "Phase keyword maps to a human label"
    (is (str/includes? (find-text (#'auto-insights/error-doc
                                   {:phase :phase-2 :thread-id 1 :final-errors []}))
                       "Phase 2 — Analysis"))
    (is (str/includes? (find-text (#'auto-insights/error-doc
                                   {:phase :something-else :thread-id 1 :final-errors []}))
                       ":something-else")
        "Unknown phases fall back to (str phase)")))

;;; ---------------------------------------------- append-reasoning-section ----------------------------------------------

(def ^:private bare-doc
  {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "body"}]}]})

(deftest append-reasoning-section-noop-when-empty-test
  (testing "No rationale, no reasonings → doc returned unchanged"
    (is (= bare-doc
           (#'auto-insights/append-reasoning-section
            bare-doc
            {:phase-1 {:reasonings [] :rationale nil}
             :phase-2 {:reasonings []}
             :thread-id 7}))))
  (testing "Blank rationale + empty reasonings → still a no-op"
    (is (= bare-doc
           (#'auto-insights/append-reasoning-section
            bare-doc
            {:phase-1 {:reasonings [] :rationale ""}
             :phase-2 {:reasonings []}
             :thread-id 7})))))

(deftest append-reasoning-section-appends-test
  (testing "When there's something to show, a Reasoning section is appended at level 2"
    (let [out (#'auto-insights/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [{:attempt 1 :reasoning "p1 thought"}]
                          :rationale  "curator picked these"}
                :phase-2 {:reasonings [{:attempt 1 :reasoning "p2 thought"}]}
                :thread-id 42})
          all-text (find-text out)]
      ;; original content is preserved at the front
      (is (= "paragraph" (-> out :content (nth 0) :type)))
      ;; the appended Reasoning heading is at level 2
      (let [headings-l2 (filter #(and (map? %)
                                      (= "heading" (:type %))
                                      (= 2 (-> % :attrs :level)))
                                (:content out))]
        (is (>= (count headings-l2) 1))
        (is (some #(= "Reasoning" (find-text %)) headings-l2)))
      ;; both phases and the rationale show up in the text
      (is (str/includes? all-text "Phase 1 — Chart curation"))
      (is (str/includes? all-text "Phase 2 — Analysis"))
      (is (str/includes? all-text "curator picked these"))
      (is (str/includes? all-text "p1 thought"))
      (is (str/includes? all-text "p2 thought"))
      ;; REPL helpers footer included
      (is (str/includes? all-text "REPL helpers"))
      (is (str/includes? all-text "(metabase.explorations.auto-insights/debug-transcript 42)")))))

(deftest append-reasoning-section-multi-attempt-headings-test
  (testing "Multi-attempt phases use level-4 'Attempt N' sub-headings"
    (let [out (#'auto-insights/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [{:attempt 1 :reasoning "first try"}
                                       {:attempt 2 :reasoning "retry"}]
                          :rationale  nil}
                :phase-2 {:reasonings []}
                :thread-id 42})
          all-text (find-text out)
          headings-l4 (filter #(and (map? %)
                                    (= "heading" (:type %))
                                    (= 4 (-> % :attrs :level)))
                              (:content out))]
      (is (some #(str/includes? (find-text %) "Attempt 1") headings-l4))
      (is (some #(str/includes? (find-text %) "Attempt 2") headings-l4))
      (is (str/includes? all-text "first try"))
      (is (str/includes? all-text "retry")))))

(deftest append-reasoning-section-single-attempt-flat-test
  (testing "Single-attempt phase has no per-attempt heading — just the paragraphs"
    (let [out (#'auto-insights/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [{:attempt 1 :reasoning "only thought"}]
                          :rationale  nil}
                :phase-2 {:reasonings []}
                :thread-id 1})
          headings-l4 (filter #(and (map? %)
                                    (= "heading" (:type %))
                                    (= 4 (-> % :attrs :level)))
                              (:content out))]
      (is (empty? headings-l4)
          "No 'Attempt N' heading when there's only one attempt"))))

(deftest append-reasoning-section-paragraph-split-test
  (testing "Reasoning blocks are split on blank lines into separate paragraphs"
    (let [out (#'auto-insights/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [{:attempt 1
                                        :reasoning "para one\n\npara two\n\npara three"}]
                          :rationale  nil}
                :phase-2 {:reasonings []}
                :thread-id 1})
          paragraphs (filter #(and (map? %) (= "paragraph" (:type %))) (:content out))
          texts (map find-text paragraphs)]
      (is (some #(= "para one" %)   texts))
      (is (some #(= "para two" %)   texts))
      (is (some #(= "para three" %) texts)))))
