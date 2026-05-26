(ns metabase.explorations.composite-test
  "Unit tests for the composite-snapshot combine logic — pure functions, no DB."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.composite :as composite]))

;;; Triple constructors — match what
;;; `metabase.explorations.models.exploration-query-result/load-eq-result-triples`
;;; produces.

(defn- triple
  "Build an `{:eq … :qp-result …}` triple. `cols` and `rows` go into
  `qp-result.data`; everything else is shaped just enough to look like a
  cached snapshot."
  [eq-name cols rows]
  {:eq        {:name eq-name}
   :qp-result {:status    :completed
               :row_count (count rows)
               :data      {:cols cols :rows rows}}})

(deftest ^:parallel combine-single-query-passes-through
  (testing "N=1 returns the lone qp-result unchanged — no discriminator column"
    (let [t      (triple "Solo" [{:name "x"} {:name "y"}] [["a" 1] ["b" 2]])
          result (composite/combine [t] {})]
      (is (= (:qp-result t) result))
      (is (= [{:name "x"} {:name "y"}]
             (get-in result [:data :cols])))
      (is (= [["a" 1] ["b" 2]]
             (get-in result [:data :rows]))))))

(deftest ^:parallel combine-heat-map-appends-Segment-column
  (testing "When `:table.pivot` is truthy the combine appends a `Segment` column whose value is the source EQ's `:name`"
    (let [t1     (triple "All"        [{:name "dim"} {:name "value"}] [["A" 1] ["B" 2]])
          t2     (triple "Enterprise" [{:name "dim"} {:name "value"}] [["A" 3] ["B" 4]])
          t3     (triple "SMB"        [{:name "dim"} {:name "value"}] [["A" 5] ["B" 6]])
          result (composite/combine [t1 t2 t3] {:table.pivot true})]
      (testing "appends the Segment col with :source :breakout (parity with FE getHeatMapSeries)"
        (is (= [{:name "dim"}
                {:name "value"}
                {:name "Segment" :display_name "Segment" :source :breakout}]
               (get-in result [:data :cols]))))
      (testing "unions all rows, appending the EQ name as the Segment value"
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
    (let [t1     (triple "US" [{:name "ts"} {:name "count"}] [["2026-01" 10] ["2026-02" 20]])
          t2     (triple "EU" [{:name "ts"} {:name "count"}] [["2026-01" 30] ["2026-02" 40]])
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

(deftest ^:parallel combine-handles-nil-eq-name
  (testing "An EQ with a nil `:name` falls back to the empty string so combining never throws"
    (let [t1     {:eq {:name nil}
                  :qp-result {:status :completed
                              :row_count 1
                              :data {:cols [{:name "x"} {:name "y"}]
                                     :rows [["a" 1]]}}}
          t2     (triple "Other" [{:name "x"} {:name "y"}] [["a" 2]])
          result (composite/combine [t1 t2] {})]
      (is (= [["a" 1 ""] ["a" 2 "Other"]]
             (get-in result [:data :rows]))))))

(deftest ^:parallel combine-preserves-first-qp-result-scaffolding
  (testing "Non-`:data` fields (e.g. `:status`) come from the first triple's qp-result"
    (let [t1     (-> (triple "First"  [{:name "x"}] [[1]])
                     (assoc-in [:qp-result :status]      :completed)
                     (assoc-in [:qp-result :json_query]  {:scaffolding :ok}))
          t2     (triple "Second" [{:name "x"}] [[2]])
          result (composite/combine [t1 t2] {})]
      (is (= :completed (:status result)))
      (is (= {:scaffolding :ok} (:json_query result))))))
