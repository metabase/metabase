(ns metabase.metabot.quality.subscores-test
  "Pure unit tests. Each test hand-builds a metrics map and feeds it
  through [[metabase.metabot.quality.subscores/compose]]. The full
  pipeline composition is exercised end-to-end in `quality.core-test`."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.subscores :as subscores]))

(set! *warn-on-reflection* true)

(defn- metrics
  "Compact metrics-map builder. The canonical data-source metrics default
  to `:na` so a test that sets only `:grounding` exercises Data-Source
  Quality as grounding alone; execution defaults to a healthy run (no tool
  errors, clean termination)."
  [& {:keys [canonical-authoring-share canonical-bypass-rate unproductive-search-rate
             grounding tool-call-failure-rate termination-signal]
      :or   {canonical-authoring-share :na
             canonical-bypass-rate     :na
             unproductive-search-rate  :na
             grounding                 1.0
             tool-call-failure-rate    0.0
             termination-signal        0.0}}]
  {:canonical-authoring-share canonical-authoring-share
   :canonical-bypass-rate     canonical-bypass-rate
   :unproductive-search-rate  unproductive-search-rate
   :grounding                 grounding
   :tool-call-failure-rate    tool-call-failure-rate
   :termination-signal        termination-signal})

;;; ---------------------------------------------------------------------------
;;; Data-Source Quality
;;; ---------------------------------------------------------------------------

(deftest data-source-quality-is-grounding-when-present-test
  (testing "grounding being the only live data-source metric, Data-Source Quality = its health"
    (let [out (subscores/compose (metrics :grounding 0.8))]
      (is (= 0.8 (:data-source-quality out)))
      (is (= #{} (:na out))))))

(deftest data-source-quality-is-mean-over-non-na-metrics-test
  (testing "Data-Source Quality is the arithmetic mean over the non-N/A metric healths"
    ;; authoring 1.0, unproductive-search 0.0, grounding 1.0 → mean(1.0, 0.0, 1.0) = 2/3
    (let [out (subscores/compose (metrics :canonical-authoring-share 1.0
                                          :unproductive-search-rate  0.0
                                          :grounding                 1.0))]
      (is (< 0.666 (:data-source-quality out) 0.667))
      (is (= #{} (:na out)))
      (testing "an N/A metric is excluded rather than counted as 0"
        (is (not= 0.5 (:data-source-quality out)))))
    (testing "canonical-bypass-rate is not a member, so a live value never moves the mean"
      (is (= (:data-source-quality
              (subscores/compose (metrics :canonical-authoring-share 1.0
                                          :unproductive-search-rate  0.0
                                          :grounding                 1.0)))
             (:data-source-quality
              (subscores/compose (metrics :canonical-authoring-share 1.0
                                          :unproductive-search-rate  0.0
                                          :grounding                 1.0
                                          :canonical-bypass-rate     0.0))))))))

(deftest data-source-quality-na-when-all-metrics-na-test
  (testing "every data-source metric N/A → Data-Source Quality N/A; composite = Execution Health"
    (let [out (subscores/compose (metrics :grounding :na :tool-call-failure-rate 0.0))]
      (is (nil? (:data-source-quality out)))
      (is (= #{:data-source-quality} (:na out)))
      (is (= 1.0 (:execution-health out)))
      (is (= 1.0 (:composite out))
          "composite is the geometric mean over the lone applicable subscore"))))

;;; ---------------------------------------------------------------------------
;;; Execution Health — 1 − mean(failure-rate, termination-signal)
;;; ---------------------------------------------------------------------------

(deftest execution-health-folds-failure-and-termination-test
  (testing "Execution Health = 1 − mean(tool-call failure rate, termination signal)"
    (testing "no failures and a clean exit → 1.0"
      (is (= 1.0 (:execution-health (subscores/compose (metrics))))))
    (testing "no failures but a forced exit → 0.5"
      (is (= 0.5 (:execution-health
                  (subscores/compose (metrics :tool-call-failure-rate 0.0 :termination-signal 1.0))))))
    (testing "half the calls failed on a clean exit → 0.75"
      (is (= 0.75 (:execution-health
                   (subscores/compose (metrics :tool-call-failure-rate 0.5 :termination-signal 0.0))))))
    (testing "every call failed and a forced exit → 0.0"
      (is (= 0.0 (:execution-health
                  (subscores/compose (metrics :tool-call-failure-rate 1.0 :termination-signal 1.0))))))))

(deftest execution-health-always-applicable-test
  (testing "Execution Health is never N/A, even when Data-Source Quality is"
    (let [out (subscores/compose (metrics :grounding :na :tool-call-failure-rate 0.5 :termination-signal 0.0))]
      (is (= 0.75 (:execution-health out)))
      (is (not (contains? (:na out) :execution-health))))))

;;; ---------------------------------------------------------------------------
;;; Composite — geometric mean over non-N/A subscores
;;; ---------------------------------------------------------------------------

(deftest composite-geometric-mean-over-subscores-test
  (testing "composite = geometric mean over the non-N/A subscores"
    ;; Data-Source Quality = 1.0, Execution Health = 0.5 → sqrt(0.5) ≈ 0.707
    (let [out (subscores/compose (metrics :grounding 1.0 :tool-call-failure-rate 0.0 :termination-signal 1.0))]
      (is (= 1.0 (:data-source-quality out)))
      (is (= 0.5 (:execution-health out)))
      (is (< 0.7071 (:composite out) 0.7072)))))

(deftest composite-equals-execution-health-when-data-source-na-test
  (testing "Data-Source Quality N/A → composite = Execution Health alone"
    (let [out (subscores/compose (metrics :grounding :na :tool-call-failure-rate 0.0 :termination-signal 1.0))]
      (is (nil? (:data-source-quality out)))
      (is (= 0.5 (:execution-health out)))
      (is (= 0.5 (:composite out))))))

(deftest composite-zero-subscore-zeros-composite-test
  (testing "any subscore at 0.0 → composite 0.0 (geometric-mean property)"
    (let [out (subscores/compose (metrics :grounding 0.0))]
      (is (= 0.0 (:data-source-quality out)))
      (is (= 0.0 (:composite out))))))

(deftest composite-weakest-link-domination-test
  (testing "geometric mean punishes a single weak subscore harder than arithmetic mean would"
    ;; Data-Source Quality = 0.9, Execution Health = 0.1 → sqrt(0.09) = 0.3
    (let [out (subscores/compose (metrics :grounding 0.9 :tool-call-failure-rate 0.8 :termination-signal 1.0))]
      (is (= 0.9 (:data-source-quality out)))
      (is (< 0.099 (:execution-health out) 0.101))
      (is (< 0.29 (:composite out) 0.31)))))

;;; ---------------------------------------------------------------------------
;;; na-set ordering
;;; ---------------------------------------------------------------------------

(deftest na-set-sorts-deterministically-test
  (testing "(sort (:na out)) gives a stable seq for the breakdown's subscore_na slot"
    (let [out (subscores/compose (metrics :grounding :na))]
      (is (= [:data-source-quality] (sort (:na out)))))))
