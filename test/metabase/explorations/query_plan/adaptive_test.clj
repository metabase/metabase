(ns metabase.explorations.query-plan.adaptive-test
  "Tests for the adaptive (greedy best-first) planner.

  Issue 1 (spine): `:adaptive` augments the mechanical matrix — at depth 1 it
  emits exactly `mechanical/group-matrix-items`, so its output is identical to
  `:mechanical`. Measurement / scoring / descent tests arrive with later slices."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.adaptive :as qp.adaptive]
   [metabase.explorations.query-plan.mechanical :as qp.mech]
   [metabase.explorations.query-plan.planner :as planner]))

;;; ---------------------------------------------------------------------------
;;; Fixture helpers (mirror mechanical-test — hand-built metric-dim-ctx)
;;; ---------------------------------------------------------------------------

(defn- text-dim
  ([dim-id]                (text-dim dim-id nil))
  ([dim-id distinct-count] {:dimension_id   dim-id
                            :display_name   dim-id
                            :effective_type :type/Text
                            :semantic_type  :type/Category
                            :fingerprint    (when distinct-count
                                              {:global {:distinct-count distinct-count}})}))

(defn- datetime-dim [dim-id] {:dimension_id dim-id :display_name dim-id :effective_type :type/DateTime})
(defn- numeric-dim  [dim-id] {:dimension_id dim-id :display_name dim-id :effective_type :type/Float})

(defn- metric-with-dims
  "A metric-context entry matching `qp.context/metric-and-dim-context` shape,
  just enough for depth-1 matrix emission."
  ([metric-id dim-map] (metric-with-dims metric-id dim-map false []))
  ([metric-id dim-map metric-temporal?] (metric-with-dims metric-id dim-map metric-temporal? []))
  ([metric-id dim-map metric-temporal? segments]
   {:metric-id                         metric-id
    :default-temporal-breakout-summary (when metric-temporal? {:column "created_at" :unit "month"})
    :segments                          segments
    :applicability                     (into {}
                                             (map (fn [[did d]]
                                                    [did {:target [:field 1 nil] :dim d}]))
                                             dim-map)}))

(defn- plan-via
  "Dispatch `planner` over explicit group contexts, returning the `:plan` items."
  [planner-instance groups]
  (:plan (planner/plan! planner-instance {:metric-dim-ctx {:groups groups}})))

;;; ---------------------------------------------------------------------------
;;; Issue 1 — :adaptive ≡ mechanical depth-1 matrix
;;; ---------------------------------------------------------------------------

(deftest depth-1-matrix-parity-test
  (testing "the adaptive planner's output is identical to the mechanical planner's"
    (let [groups [{:group-id 1
                   :metrics  [(metric-with-dims 10 {"a" (text-dim "a" 8)            ; default
                                                    "b" (text-dim "b" 500)          ; top-n-other
                                                    "d" (datetime-dim "d")          ; temporal patterns
                                                    "n" (numeric-dim "n")} true)]}  ; metric temporal → facet
                  {:group-id 2
                   :metrics  [(metric-with-dims 20 {"x" (text-dim "x" 12)})
                              (metric-with-dims 21 {"y" (text-dim "y" 30)})]}]]
      (is (= (plan-via qp.mech/planner groups)
             (plan-via qp.adaptive/planner groups))))))

(deftest skip-when-empty-test
  (testing "no applicable pairs → :skip-not-applicable (matches mechanical's soft exit)"
    (let [groups [{:group-id 1 :metrics [(metric-with-dims 1 {})]}]]
      (is (= :skip-not-applicable
             (:outcome (planner/plan! qp.adaptive/planner {:metric-dim-ctx {:groups groups}})))))))
