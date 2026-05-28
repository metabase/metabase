(ns metabase.explorations.composite-test
  "Unit tests for the composite-snapshot combine logic — pure functions, no DB."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.composite :as composite]))

;;; eq-result constructors — match what
;;; `metabase.explorations.models.exploration-query-result/load-eq-results`
;;; produces.

(defn- eq-result
  "Build an `{:eq … :qp-result …}` eq-result. `cols` and `rows` go into
  `qp-result.data`; everything else is shaped just enough to look like a
  cached snapshot. `segment-name` becomes the EQ's hydrated `:segment_name`,
  the discriminator value combine appends."
  [segment-name cols rows]
  {:eq        {:segment_name segment-name}
   :qp-result {:status    :completed
               :row_count (count rows)
               :data      {:cols cols :rows rows}}})

(deftest ^:parallel combine-single-query-passes-through
  (testing "N=1 returns the lone qp-result unchanged — no discriminator column"
    (let [t      (eq-result "Solo" [{:name "x"} {:name "y"}] [["a" 1] ["b" 2]])
          result (composite/combine [t] {})]
      (is (= (:qp-result t) result))
      (is (= [{:name "x"} {:name "y"}]
             (get-in result [:data :cols])))
      (is (= [["a" 1] ["b" 2]]
             (get-in result [:data :rows]))))))

(deftest ^:parallel combine-heat-map-appends-Segment-column
  (testing "When `:table.pivot` is truthy the combine appends a `Segment` column whose value is the source EQ's `:segment_name`"
    (let [t1     (eq-result "All"        [{:name "dim"} {:name "value"}] [["A" 1] ["B" 2]])
          t2     (eq-result "Enterprise" [{:name "dim"} {:name "value"}] [["A" 3] ["B" 4]])
          t3     (eq-result "SMB"        [{:name "dim"} {:name "value"}] [["A" 5] ["B" 6]])
          result (composite/combine [t1 t2 t3] {:table.pivot true})]
      (testing "appends the Segment col with :source :breakout (parity with FE getHeatMapSeries)"
        (is (= [{:name "dim"}
                {:name "value"}
                {:name "Segment" :display_name "Segment" :source :breakout}]
               (get-in result [:data :cols]))))
      (testing "unions all rows, appending the EQ segment_name as the Segment value"
        (is (= [["A" 1 "All"]
                ["B" 2 "All"]
                ["A" 3 "Enterprise"]
                ["B" 4 "Enterprise"]
                ["A" 5 "SMB"]
                ["B" 6 "SMB"]]
               (get-in result [:data :rows]))))
      (testing "refreshes :row_count for the combined result"
        (is (= 6 (:row_count result)))))))

(deftest ^:parallel combine-multi-series-cartesian-appends-Series-column
  (testing "When `:table.pivot` is falsy/missing the combine appends a `Series` column for multi-series cartesian rendering"
    (let [t1     (eq-result "US" [{:name "ts"} {:name "count"}] [["2026-01" 10] ["2026-02" 20]])
          t2     (eq-result "EU" [{:name "ts"} {:name "count"}] [["2026-01" 30] ["2026-02" 40]])
          result (composite/combine [t1 t2] {:graph.split_panels true})]
      (is (= [{:name "ts"}
              {:name "count"}
              {:name "Series" :display_name "Series" :source :breakout}]
             (get-in result [:data :cols])))
      (is (= [["2026-01" 10 "US"]
              ["2026-02" 20 "US"]
              ["2026-01" 30 "EU"]
              ["2026-02" 40 "EU"]]
             (get-in result [:data :rows])))
      (is (= 4 (:row_count result))))))

(deftest ^:parallel combine-handles-nil-segment-name
  (testing "An EQ with a nil `:segment_name` falls back to `(All)` so combining never throws"
    (let [t1     {:eq {:segment_name nil}
                  :qp-result {:status :completed
                              :row_count 1
                              :data {:cols [{:name "x"} {:name "y"}]
                                     :rows [["a" 1]]}}}
          t2     (eq-result "Other" [{:name "x"} {:name "y"}] [["a" 2]])
          result (composite/combine [t1 t2] {})]
      (is (= [["a" 1 "(All)"] ["a" 2 "Other"]]
             (get-in result [:data :rows]))))))

(deftest ^:parallel combine-preserves-first-qp-result-scaffolding
  (testing "Non-`:data` fields (e.g. `:status`) come from the first eq-result's qp-result"
    (let [t1     (-> (eq-result "First"  [{:name "x"}] [[1]])
                     (assoc-in [:qp-result :status]      :completed)
                     (assoc-in [:qp-result :json_query]  {:scaffolding :ok}))
          t2     (eq-result "Second" [{:name "x"}] [[2]])
          result (composite/combine [t1 t2] {})]
      (is (= :completed (:status result)))
      (is (= {:scaffolding :ok} (:json_query result))))))
