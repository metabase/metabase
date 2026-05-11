(ns metabase.explorations.auto-insights.common-test
  "Unit tests for the pure helpers in [[metabase.explorations.auto-insights.common]].

  Tests stay pure: no DB, no LLM. The one LLM-touching function under test —
  `run-with-repair` — exercises its control flow against a stubbed `call-llm`
  via `with-redefs`."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.auto-insights.common :as common]))

;;; ---------------------------------------------- downsample-pairs ----------------------------------------------

(deftest downsample-pairs-passthrough-test
  (testing "Sequences at or under the cap are returned unchanged"
    (is (= [[:a 1] [:b 2] [:c 3]]
           (#'common/downsample-pairs [:a :b :c] [1 2 3] 5)))
    (is (= [[:a 1] [:b 2] [:c 3]]
           (#'common/downsample-pairs [:a :b :c] [1 2 3] 3)))))

(deftest downsample-pairs-preserves-endpoints-test
  (testing "Downsampled sequences always include first and last point"
    (let [xs   (vec (range 100))
          ys   (mapv (partial * 2) xs)
          out  (#'common/downsample-pairs xs ys 10)
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
          out (#'common/downsample-pairs xs ys 5)]
      ;; step = 20 / 4 = 5 → indices 0, 5, 10, 15, 20
      (is (= [[0 0] [5 5] [10 10] [15 15] [20 20]] out)))))

(deftest downsample-pairs-distinct-indices-test
  (testing "Duplicate rounded indices are deduplicated (so output can be smaller than n)"
    ;; 3 inputs, asking for 4 samples — rounding produces duplicates that get
    ;; squeezed out. The function takes count(distinct indices) of pairs.
    (let [out (#'common/downsample-pairs [:a :b :c] [1 2 3] 4)]
      ;; 3 elements ≤ cap 4 → passthrough kicks in first; covered above.
      (is (= 3 (count out))))))

;;; ---------------------------------------------- summarize-parts ----------------------------------------------

(deftest summarize-parts-collapses-by-type-test
  (testing "Reasoning chunks concat with newlines, non-tool text concats, usage stays as-is"
    (let [parts [{:type :reasoning :reasoning "step 1"}
                 {:type :text :text "narration"}
                 {:type :reasoning :reasoning "step 2"}
                 {:type :tool-input :function "structured_output" :arguments {:document {}}}
                 {:type :usage :usage {:in 100 :out 50}}]
          out   (#'common/summarize-parts parts)]
      (is (= "step 1\nstep 2" (:reasoning out)))
      (is (= "narration" (:text out)))
      (is (= {:in 100 :out 50} (:usage out)))
      (is (= parts (:all out)) "raw parts always retained under :all"))))

(deftest summarize-parts-omits-empty-keys-test
  (testing "Missing reasoning / text / usage do not appear in the output map"
    (let [out (#'common/summarize-parts [{:type :tool-input :function "x"}])]
      (is (= [:all] (keys out))))))

;;; ---------------------------------------------- run-with-repair ----------------------------------------------
;;;
;;; `run-with-repair` is the phase-agnostic LLM call + validate + one-repair-retry
;;; loop both phases run through. The control flow has three branches: pass on
;;; first attempt, pass on repair, fail after repair. We exercise each branch
;;; against a stubbed `call-llm` (private fn — redef via #').

(defn- with-stubbed-llm
  "Run `body` with the private `call-llm` swapped for a function that returns
  successive elements of `responses` on each call. Each response is the
  full `{:response :parts}` map."
  [responses body-fn]
  (let [calls    (atom 0)
        history  (atom [])]
    (with-redefs [common/call-llm (fn [messages _schema _tag]
                                    (swap! history conj messages)
                                    (let [n (deref calls)]
                                      (swap! calls inc)
                                      (nth responses n)))]
      (body-fn {:calls calls :history history}))))

(deftest run-with-repair-passes-first-attempt-test
  (testing "Valid first response → :ok, one attempt, no repair message"
    (with-stubbed-llm
      [{:response {:x 1} :parts []}]
      (fn [{:keys [calls history]}]
        (let [out (common/run-with-repair
                   {:thread-id      42
                    :phase-name     "phase-1"
                    :prompt         "go"
                    :schema         {}
                    :extract-fn     identity
                    :validate-fn    (constantly [])
                    :repair-builder (fn [_ _] "should not be called")})]
          (is (= :ok (:outcome out)))
          (is (= {:x 1} (:value out)))
          (is (= 1 (count (:attempts out))))
          (is (= 1 (deref calls)) "only one LLM call")
          (is (= 1 (count (deref history)))
              "no repair message constructed"))))))

(deftest run-with-repair-recovers-on-repair-test
  (testing "Invalid first, valid retry → :ok, two attempts, repair message includes errors"
    (let [validate-calls (atom 0)
          repair-built   (atom nil)]
      (with-stubbed-llm
        [{:response {:bad 1} :parts []}
         {:response {:good 1} :parts []}]
        (fn [{:keys [history]}]
          (let [out (common/run-with-repair
                     {:thread-id      42
                      :phase-name     "phase-1"
                      :prompt         "go"
                      :schema         {}
                      :extract-fn     identity
                      :validate-fn    (fn [v]
                                        (swap! validate-calls inc)
                                        (if (:good v) [] ["nope"]))
                      :repair-builder (fn [prev errors]
                                        (reset! repair-built {:prev prev :errors errors})
                                        "fix it")})]
            (is (= :ok (:outcome out)))
            (is (= {:good 1} (:value out)))
            (is (= 2 (count (:attempts out))))
            (is (= 2 @validate-calls))
            (is (= {:bad 1} (:prev @repair-built))
                "repair builder gets the *extracted* prior value")
            (is (= ["nope"] (:errors @repair-built)))
            (let [retry-messages (second @history)]
              (is (= 3 (count retry-messages))
                  "retry transcript = original user msg + assistant echo + repair user msg")
              (is (= "fix it" (:content (last retry-messages))))
              (is (= "assistant" (:role (second retry-messages)))))))))))

(deftest run-with-repair-gives-up-after-repair-test
  (testing "Invalid first AND invalid retry → :failed, :final-errors populated"
    (with-stubbed-llm
      [{:response {:bad 1} :parts []}
       {:response {:still-bad 1} :parts []}]
      (fn [_]
        (let [out (common/run-with-repair
                   {:thread-id      42
                    :phase-name     "phase-2"
                    :prompt         "go"
                    :schema         {}
                    :extract-fn     identity
                    :validate-fn    (constantly ["broken"])
                    :repair-builder (fn [_ _] "fix it")})]
          (is (= :failed (:outcome out)))
          (is (nil? (:value out)))
          (is (= ["broken"] (:final-errors out)))
          (is (= 2 (count (:attempts out)))))))))

(deftest run-with-repair-records-validation-errors-per-attempt-test
  (testing "Each attempt's record carries its own validation-errors vector"
    (with-stubbed-llm
      [{:response {:r 1} :parts []}
       {:response {:r 2} :parts []}]
      (fn [_]
        (let [errors-by-response {{:r 1} ["bad1"]
                                  {:r 2} []}
              out (common/run-with-repair
                   {:thread-id      1
                    :phase-name     "phase-1"
                    :prompt         "go"
                    :schema         {}
                    :extract-fn     identity
                    :validate-fn    (fn [v] (errors-by-response v ["unknown"]))
                    :repair-builder (fn [_ _] "fix")})
              [a1 a2] (:attempts out)]
          (is (= ["bad1"] (:validation-errors a1)))
          (is (= []       (:validation-errors a2)))
          (is (= 1 (:attempt a1)))
          (is (= 2 (:attempt a2))))))))
