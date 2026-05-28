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
  to `:na` so a test that sets only `:grounded-source-share` exercises
  Data-Source Quality as grounding alone; execution defaults to a healthy
  run (no tool errors, clean termination)."
  [& {:keys [canonical-source-share search-efficiency
             grounded-source-share tool-call-failure-rate termination-health
             artifact-validity-share]
      :or   {canonical-source-share :na
             search-efficiency      :na
             grounded-source-share  1.0
             tool-call-failure-rate 0.0
             termination-health     1.0
             artifact-validity-share :na}}]
  {:canonical-source-share canonical-source-share
   :search-efficiency      search-efficiency
   :grounded-source-share  grounded-source-share
   :tool-call-failure-rate tool-call-failure-rate
   :termination-health     termination-health
   :artifact-validity-share artifact-validity-share})

;;; ---------------------------------------------------------------------------
;;; Data-Source Quality
;;; ---------------------------------------------------------------------------

(deftest data-source-quality-is-grounding-when-present-test
  (testing "grounding being the only live data-source metric, Data-Source Quality = its health"
    (let [out (subscores/compose (metrics :grounded-source-share 0.8))]
      (is (= 0.8 (:data-source-quality out)))
      (is (= #{:artifact-validity} (:na out))
          "no authoring attempted → Artifact Validity is the lone N/A subscore"))))

(deftest data-source-quality-is-mean-over-non-na-metrics-test
  (testing "Data-Source Quality is the arithmetic mean over the non-N/A metric healths"
    ;; canonical-source-share 1.0, search-efficiency 0.0, grounded-source-share 1.0 → mean(1.0, 0.0, 1.0) = 2/3
    (let [out (subscores/compose (metrics :canonical-source-share 1.0
                                          :search-efficiency      0.0
                                          :grounded-source-share  1.0))]
      (is (< 0.666 (:data-source-quality out) 0.667))
      (is (= #{:artifact-validity} (:na out)))
      (testing "an N/A metric is excluded rather than counted as 0"
        (is (not= 0.5 (:data-source-quality out)))))))

(deftest data-source-quality-na-when-all-metrics-na-test
  (testing "every data-source metric N/A → Data-Source Quality N/A; composite = Execution Health"
    (let [out (subscores/compose (metrics :grounded-source-share :na :tool-call-failure-rate 0.0))]
      (is (nil? (:data-source-quality out)))
      (is (= #{:data-source-quality :artifact-validity} (:na out)))
      (is (= 1.0 (:execution-health out)))
      (is (= 1.0 (:composite out))
          "composite is the geometric mean over the lone applicable subscore"))))

;;; ---------------------------------------------------------------------------
;;; Execution Health — mean(1 - failure-rate, termination-health)
;;; ---------------------------------------------------------------------------

(deftest execution-health-folds-failure-and-termination-test
  (testing "Execution Health = mean(tool-call success rate, termination health)"
    (testing "no failures and a clean exit → 1.0"
      (is (= 1.0 (:execution-health (subscores/compose (metrics))))))
    (testing "no failures but a forced exit → 0.5"
      (is (= 0.5 (:execution-health
                  (subscores/compose (metrics :tool-call-failure-rate 0.0 :termination-health 0.0))))))
    (testing "half the calls failed on a clean exit → 0.75"
      (is (= 0.75 (:execution-health
                   (subscores/compose (metrics :tool-call-failure-rate 0.5 :termination-health 1.0))))))
    (testing "every call failed and a forced exit → 0.0"
      (is (= 0.0 (:execution-health
                  (subscores/compose (metrics :tool-call-failure-rate 1.0 :termination-health 0.0))))))))

(deftest execution-health-always-applicable-test
  (testing "Execution Health is never N/A, even when Data-Source Quality is"
    (let [out (subscores/compose (metrics :grounded-source-share :na :tool-call-failure-rate 0.5 :termination-health 1.0))]
      (is (= 0.75 (:execution-health out)))
      (is (not (contains? (:na out) :execution-health))))))

;;; ---------------------------------------------------------------------------
;;; Artifact Validity — its own weakest-link subscore (the artifact-validity share)
;;; ---------------------------------------------------------------------------

(deftest artifact-validity-na-when-no-authoring-test
  (testing "no stamped authoring call → Artifact Validity N/A, excluded from the composite"
    (let [out (subscores/compose (metrics :artifact-validity-share :na))]
      (is (nil? (:artifact-validity out)))
      (is (contains? (:na out) :artifact-validity)))))

(deftest artifact-validity-is-the-validity-share-test
  (testing "Artifact Validity = the artifact-validity share, its lone member health"
    (is (= 1.0 (:artifact-validity (subscores/compose (metrics :artifact-validity-share 1.0)))))
    (is (= 0.5 (:artifact-validity (subscores/compose (metrics :artifact-validity-share 0.5)))))
    (is (= 0.0 (:artifact-validity (subscores/compose (metrics :artifact-validity-share 0.0)))))))

(deftest artifact-validity-zeros-composite-test
  (testing "all authoring invalid → Artifact Validity 0.0 geometrically zeros the composite"
    ;; ac38193d shape: clean data-source + forced exit (exec 0.5) but every authoring call invalid
    (let [out (subscores/compose (metrics :grounded-source-share 1.0
                                          :tool-call-failure-rate 0.0
                                          :termination-health     0.0
                                          :artifact-validity-share 0.0))]
      (is (= 0.5 (:execution-health out)))
      (is (= 0.0 (:artifact-validity out)))
      (is (= 0.0 (:composite out))))))

(deftest artifact-validity-thrash-then-succeed-is-materially-penalized-test
  (testing "one invalid then one valid authoring call (share 0.5) materially lowers the composite
            without zeroing it — per-call scoring punishes thrash-then-succeed"
    (let [out (subscores/compose (metrics :grounded-source-share 1.0
                                          :tool-call-failure-rate 0.0
                                          :termination-health     1.0
                                          :artifact-validity-share 0.5))]
      (is (= 0.5 (:artifact-validity out)))
      ;; geomean[dsq=1.0, exec=1.0, validity=0.5] = 0.5^(1/3) ≈ 0.7937
      (is (< 0.79 (:composite out) 0.80)))))

;;; ---------------------------------------------------------------------------
;;; Composite — geometric mean over non-N/A subscores
;;; ---------------------------------------------------------------------------

(deftest composite-geometric-mean-over-subscores-test
  (testing "composite = geometric mean over the non-N/A subscores"
    ;; Data-Source Quality = 1.0, Execution Health = 0.5 → sqrt(0.5) ≈ 0.707
    (let [out (subscores/compose (metrics :grounded-source-share 1.0 :tool-call-failure-rate 0.0 :termination-health 0.0))]
      (is (= 1.0 (:data-source-quality out)))
      (is (= 0.5 (:execution-health out)))
      (is (< 0.7071 (:composite out) 0.7072)))))

(deftest composite-equals-execution-health-when-data-source-na-test
  (testing "Data-Source Quality N/A → composite = Execution Health alone"
    (let [out (subscores/compose (metrics :grounded-source-share :na :tool-call-failure-rate 0.0 :termination-health 0.0))]
      (is (nil? (:data-source-quality out)))
      (is (= 0.5 (:execution-health out)))
      (is (= 0.5 (:composite out))))))

(deftest composite-zero-subscore-zeros-composite-test
  (testing "any subscore at 0.0 → composite 0.0 (geometric-mean property)"
    (let [out (subscores/compose (metrics :grounded-source-share 0.0))]
      (is (= 0.0 (:data-source-quality out)))
      (is (= 0.0 (:composite out))))))

(deftest composite-weakest-link-domination-test
  (testing "geometric mean punishes a single weak subscore harder than arithmetic mean would"
    ;; Data-Source Quality = 0.9, Execution Health = 0.1 → sqrt(0.09) = 0.3
    (let [out (subscores/compose (metrics :grounded-source-share 0.9 :tool-call-failure-rate 0.8 :termination-health 0.0))]
      (is (= 0.9 (:data-source-quality out)))
      (is (< 0.099 (:execution-health out) 0.101))
      (is (< 0.29 (:composite out) 0.31)))))

;;; ---------------------------------------------------------------------------
;;; na-set ordering
;;; ---------------------------------------------------------------------------

(deftest na-set-sorts-deterministically-test
  (testing "(sort (:na out)) gives a stable seq of the N/A subscore keys"
    (let [out (subscores/compose (metrics :grounded-source-share :na))]
      (is (= [:artifact-validity :data-source-quality] (sort (:na out)))))))

;;; ---------------------------------------------------------------------------
;;; project-json — persisted shape shared by breakdown + attribution
;;; ---------------------------------------------------------------------------

(deftest project-json-surfaces-composite-as-quality-score-test
  (testing "project-json lifts the composite to a top-level quality_score and
            nests each subscore's value and member metrics under it"
    (let [m    (metrics :grounded-source-share 1.0
                        :tool-call-failure-rate 0.0
                        :termination-health     1.0)
          subs (subscores/compose m)]
      (is (= {:quality_score 1.0
              :subscores     {:data_source_quality {:value   1.0
                                                    :metrics {:canonical_source_share nil
                                                              :search_efficiency      nil
                                                              :grounded_source_share  1.0}}
                              :execution_health    {:value   1.0
                                                    :metrics {:tool_call_failure_rate 0.0
                                                              :termination_health     1.0}}
                              :artifact_validity   {:value   nil
                                                    :metrics {:artifact_validity_share nil}}}}
             (subscores/project-json m subs))))))

(deftest project-json-renders-na-data-source-quality-as-nil-test
  (testing "an N/A Data-Source Quality projects its value as nil (JSON null), never :na,
            and its N/A member metrics likewise as nil"
    (let [m    (metrics :grounded-source-share :na)
          subs (subscores/compose m)
          dsq  (:data_source_quality (:subscores (subscores/project-json m subs)))]
      (is (nil? (:value dsq)))
      (is (nil? (:grounded_source_share (:metrics dsq)))))))
