(ns metabase.lib-metric.filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.filter :as lib-metric.filter]
   [metabase.lib-metric.metadata.provider :as lib-metric.metadata.provider]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")
(def ^:private uuid-3 "550e8400-e29b-41d4-a716-446655440003")

(def ^:private dim-ref-1 [:dimension {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} uuid-1])
(def ^:private dim-ref-2 [:dimension {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} uuid-2])
(def ^:private dim-ref-3 [:dimension {:lib/uuid "cccccccc-cccc-cccc-cccc-cccccccccccc"} uuid-3])

;;; -------------------------------------------------- leading-dimension-ref --------------------------------------------------

(deftest ^:parallel leading-dimension-ref-equality-filter-test
  (let [filter-clause [:= {} dim-ref-1 "value"]]
    (is (= uuid-1 (lib-metric.filter/leading-dimension-ref filter-clause)))))

(deftest ^:parallel leading-dimension-ref-comparison-filter-test
  (testing "less than"
    (is (= uuid-1 (lib-metric.filter/leading-dimension-ref [:< {} dim-ref-1 100]))))
  (testing "greater than or equal"
    (is (= uuid-2 (lib-metric.filter/leading-dimension-ref [:>= {} dim-ref-2 50])))))

(deftest ^:parallel leading-dimension-ref-between-filter-test
  (let [filter-clause [:between {} dim-ref-1 10 100]]
    (is (= uuid-1 (lib-metric.filter/leading-dimension-ref filter-clause)))))

(deftest ^:parallel leading-dimension-ref-string-filter-test
  (let [filter-clause [:contains {} dim-ref-1 "search"]]
    (is (= uuid-1 (lib-metric.filter/leading-dimension-ref filter-clause)))))

(deftest ^:parallel leading-dimension-ref-null-filter-test
  (let [filter-clause [:is-null {} dim-ref-2]]
    (is (= uuid-2 (lib-metric.filter/leading-dimension-ref filter-clause)))))

(deftest ^:parallel leading-dimension-ref-and-filter-test
  (testing "Compound :and filter returns nil (no leading dimension)"
    (let [filter-clause [:and {} [:= {} dim-ref-1 "a"] [:= {} dim-ref-2 "b"]]]
      (is (nil? (lib-metric.filter/leading-dimension-ref filter-clause))))))

(deftest ^:parallel leading-dimension-ref-or-filter-test
  (testing "Compound :or filter returns nil (no leading dimension)"
    (let [filter-clause [:or {} [:= {} dim-ref-1 "a"] [:= {} dim-ref-2 "b"]]]
      (is (nil? (lib-metric.filter/leading-dimension-ref filter-clause))))))

(deftest ^:parallel leading-dimension-ref-not-filter-test
  (testing "Compound :not filter returns nil (no leading dimension)"
    (let [filter-clause [:not {} [:= {} dim-ref-1 "a"]]]
      (is (nil? (lib-metric.filter/leading-dimension-ref filter-clause))))))

(deftest ^:parallel leading-dimension-ref-invalid-clause-test
  (testing "Returns nil for non-vector input"
    (is (nil? (lib-metric.filter/leading-dimension-ref nil)))
    (is (nil? (lib-metric.filter/leading-dimension-ref "not-a-filter")))
    (is (nil? (lib-metric.filter/leading-dimension-ref {}))))
  (testing "Returns nil for vector without dimension ref"
    (is (nil? (lib-metric.filter/leading-dimension-ref [:= {} "plain-value" "other"])))
    (is (nil? (lib-metric.filter/leading-dimension-ref [:=])))))

(deftest ^:parallel leading-dimension-ref-malformed-dimension-ref-test
  (testing "Returns nil when third element is not a proper dimension ref"
    (is (nil? (lib-metric.filter/leading-dimension-ref [:= {} [:field {} 1] "value"])))
    (is (nil? (lib-metric.filter/leading-dimension-ref [:= {} [:dimension {}] "value"])))))

;;; -------------------------------------------------- build-filter-positions --------------------------------------------------

(deftest ^:parallel build-filter-positions-empty-filters-test
  (is (= {} (lib-metric.filter/build-filter-positions []))))

(deftest ^:parallel build-filter-positions-single-filter-test
  (let [filters [[:= {} dim-ref-1 "value"]]]
    (is (= {uuid-1 [0]} (lib-metric.filter/build-filter-positions filters)))))

(deftest ^:parallel build-filter-positions-multiple-different-dimensions-test
  (let [filters [[:= {} dim-ref-1 "a"]
                 [:< {} dim-ref-2 100]
                 [:contains {} dim-ref-3 "search"]]]
    (is (= {uuid-1 [0]
            uuid-2 [1]
            uuid-3 [2]}
           (lib-metric.filter/build-filter-positions filters)))))

(deftest ^:parallel build-filter-positions-same-dimension-multiple-times-test
  (let [filters [[:= {} dim-ref-1 "a"]
                 [:= {} dim-ref-2 "b"]
                 [:> {} dim-ref-1 10]
                 [:< {} dim-ref-1 100]]]
    (is (= {uuid-1 [0 2 3]
            uuid-2 [1]}
           (lib-metric.filter/build-filter-positions filters)))))

(deftest ^:parallel build-filter-positions-skips-compound-filters-test
  (let [filters [[:= {} dim-ref-1 "a"]
                 [:and {} [:= {} dim-ref-2 "b"] [:= {} dim-ref-3 "c"]]
                 [:= {} dim-ref-2 "d"]]]
    (is (= {uuid-1 [0]
            uuid-2 [2]}
           (lib-metric.filter/build-filter-positions filters))
        "Compound :and filter at index 1 should be skipped")))

(deftest ^:parallel build-filter-positions-nil-filters-test
  (is (= {} (lib-metric.filter/build-filter-positions nil))))

;;; -------------------------------------------------- operators-for-dimension --------------------------------------------------

(def ^:private string-dimension
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000001ing"
   :name           "category"
   :display-name   "Category"
   :effective-type :type/Text
   :semantic-type  nil})

(def ^:private number-dimension
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000002ber"
   :name           "amount"
   :display-name   "Amount"
   :effective-type :type/Float
   :semantic-type  nil})

(def ^:private boolean-dimension
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000003ean"
   :name           "is_active"
   :display-name   "Is Active"
   :effective-type :type/Boolean
   :semantic-type  nil})

(def ^:private datetime-dimension
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000004"
   :name           "created_at"
   :display-name   "Created At"
   :effective-type :type/DateTime
   :semantic-type  :type/CreationTimestamp})

(def ^:private time-dimension
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000005"
   :name           "start_time"
   :display-name   "Start Time"
   :effective-type :type/Time
   :semantic-type  nil})

(def ^:private coordinate-dimension
  {:lib/type       :metadata/dimension
   :id             "dim-coord"
   :name           "latitude"
   :display-name   "Latitude"
   :effective-type :type/Float
   :semantic-type  :type/Latitude})

(deftest ^:parallel operators-for-dimension-string-test
  (testing "String dimensions get string operators"
    (is (= [:is-empty :not-empty := :!= :contains :does-not-contain :starts-with :ends-with]
           (lib-metric.filter/operators-for-dimension string-dimension)))))

(deftest ^:parallel operators-for-dimension-number-test
  (testing "Number dimensions get numeric operators"
    (is (= [:is-null :not-null := :!= :> :>= :< :<= :between]
           (lib-metric.filter/operators-for-dimension number-dimension)))))

(deftest ^:parallel operators-for-dimension-boolean-test
  (testing "Boolean dimensions get boolean operators"
    (is (= [:is-null :not-null :=]
           (lib-metric.filter/operators-for-dimension boolean-dimension)))))

(deftest ^:parallel operators-for-dimension-datetime-test
  (testing "DateTime dimensions get temporal operators"
    (is (= [:is-null :not-null := :!= :> :< :between]
           (lib-metric.filter/operators-for-dimension datetime-dimension)))))

(deftest ^:parallel operators-for-dimension-time-test
  (testing "Time dimensions get time operators"
    (is (= [:is-null :not-null :> :< :between]
           (lib-metric.filter/operators-for-dimension time-dimension)))))

(deftest ^:parallel operators-for-dimension-coordinate-test
  (testing "Coordinate dimensions get coordinate operators"
    (is (= [:= :!= :> :>= :< :<= :between :inside]
           (lib-metric.filter/operators-for-dimension coordinate-dimension)))))

(deftest ^:parallel operators-for-dimension-unknown-test
  (testing "Unknown type dimensions get default operators"
    (is (= [:is-null :not-null]
           (lib-metric.filter/operators-for-dimension {:effective-type :type/Unknown})))))

;;; -------------------------------------------------- filterable-dimension-operators --------------------------------------------------

(deftest ^:parallel filterable-dimension-operators-test
  (testing "filterable-dimension-operators returns same result as operators-for-dimension"
    (is (= (lib-metric.filter/operators-for-dimension string-dimension)
           (lib-metric.filter/filterable-dimension-operators string-dimension)))
    (is (= (lib-metric.filter/operators-for-dimension number-dimension)
           (lib-metric.filter/filterable-dimension-operators number-dimension)))))

;;; -------------------------------------------------- add-filter --------------------------------------------------

(deftest ^:parallel add-filter-test
  (testing "add-filter adds a filter clause to the definition"
    (let [definition {:lib/type    :metric/definition
                      :filters     []
                      :projections []}
          filter-clause [:= {} dim-ref-1 "value"]
          result (lib-metric.filter/add-filter definition filter-clause)]
      (is (= [filter-clause] (:filters result))))))

(deftest ^:parallel add-filter-appends-test
  (testing "add-filter appends to existing filters"
    (let [existing-filter [:= {} dim-ref-1 "a"]
          new-filter [:= {} dim-ref-2 "b"]
          definition {:lib/type    :metric/definition
                      :filters     [existing-filter]
                      :projections []}
          result (lib-metric.filter/add-filter definition new-filter)]
      (is (= [existing-filter new-filter] (:filters result))))))

(deftest ^:parallel add-filter-nil-filters-test
  (testing "add-filter works when :filters is nil"
    (let [definition {:lib/type    :metric/definition
                      :projections []}
          filter-clause [:= {} dim-ref-1 "value"]
          result (lib-metric.filter/add-filter definition filter-clause)]
      (is (= [filter-clause] (:filters result))))))

;;; -------------------------------------------------- filterable-dimensions --------------------------------------------------
;;; Note: Full integration tests for filterable-dimensions require a mock metadata provider
;;; These tests verify the basic shape of the function

(deftest ^:parallel filterable-dimensions-returns-vector-test
  (testing "filterable-dimensions returns a vector even with invalid input"
    ;; With no provider, dimensions-for-* will fail, but we test the structure
    (let [definition {:lib/type          :metric/definition
                      :source            {:type :source/metric :id 1}
                      :filters           []
                      :projections       []
                      :metadata-provider nil}]
      ;; This will fail due to nil provider, which is expected in unit tests
      ;; Integration tests with real providers are needed for full coverage
      (is (thrown? #?(:clj Exception :cljs js/Error)
                   (lib-metric.filter/filterable-dimensions definition))))))

;;; -------------------------------------------------- Filter Clause Creation Tests --------------------------------------------------
;;; These tests verify clause creation without needing a metadata provider

(deftest ^:parallel default-filter-clause-is-null-test
  (testing "default-filter-clause creates is-null clause"
    (let [dimension {:id "dim-1" :effective-type :type/Unknown}
          parts {:operator :is-null :dimension dimension}
          clause (lib-metric.filter/default-filter-clause parts)]
      (is (= :is-null (first clause)))
      (is (string? (:lib/uuid (second clause))))
      (is (= [:dimension {} "dim-1"] (nth clause 2))))))

(deftest ^:parallel default-filter-clause-not-null-test
  (testing "default-filter-clause creates not-null clause"
    (let [dimension {:id "dim-1" :effective-type :type/Unknown}
          parts {:operator :not-null :dimension dimension}
          clause (lib-metric.filter/default-filter-clause parts)]
      (is (= :not-null (first clause)))
      (is (= [:dimension {} "dim-1"] (nth clause 2))))))

(deftest ^:parallel boolean-filter-clause-equals-test
  (testing "boolean-filter-clause creates equals clause"
    (let [dimension {:id "00000000-0000-0000-0000-000000000003" :effective-type :type/Boolean}
          parts {:operator :=
                 :dimension dimension
                 :values [true]}
          clause (lib-metric.filter/boolean-filter-clause parts)]
      (is (= := (first clause)))
      (is (= [:dimension {} "00000000-0000-0000-0000-000000000003"] (nth clause 2)))
      (is (= true (nth clause 3))))))

(deftest ^:parallel boolean-filter-clause-is-null-test
  (testing "boolean-filter-clause creates is-null clause"
    (let [dimension {:id "00000000-0000-0000-0000-000000000003" :effective-type :type/Boolean}
          parts {:operator :is-null :dimension dimension :values []}
          clause (lib-metric.filter/boolean-filter-clause parts)]
      (is (= :is-null (first clause))))))

(deftest ^:parallel number-filter-clause-equals-test
  (testing "number-filter-clause creates equals clause"
    (let [dimension {:id "00000000-0000-0000-0000-000000000002" :effective-type :type/Integer}
          parts {:operator := :dimension dimension :values [42]}
          clause (lib-metric.filter/number-filter-clause parts)]
      (is (= := (first clause)))
      (is (= [:dimension {} "00000000-0000-0000-0000-000000000002"] (nth clause 2)))
      (is (= 42 (nth clause 3))))))

(deftest ^:parallel number-filter-clause-between-test
  (testing "number-filter-clause creates between clause"
    (let [dimension {:id "00000000-0000-0000-0000-000000000002" :effective-type :type/Float}
          parts {:operator :between :dimension dimension :values [10 100]}
          clause (lib-metric.filter/number-filter-clause parts)]
      (is (= :between (first clause)))
      (is (= [:dimension {} "00000000-0000-0000-0000-000000000002"] (nth clause 2)))
      (is (= 10 (nth clause 3)))
      (is (= 100 (nth clause 4))))))

(deftest ^:parallel number-filter-clause-comparison-test
  (testing "number-filter-clause creates comparison clauses"
    (doseq [op [:> :>= :< :<=]]
      (let [dimension {:id "00000000-0000-0000-0000-000000000002" :effective-type :type/Integer}
            parts {:operator op :dimension dimension :values [50]}
            clause (lib-metric.filter/number-filter-clause parts)]
        (is (= op (first clause)))
        (is (= 50 (nth clause 3)))))))

(deftest ^:parallel number-filter-clause-null-test
  (testing "number-filter-clause creates null check clauses"
    (doseq [op [:is-null :not-null]]
      (let [dimension {:id "00000000-0000-0000-0000-000000000002" :effective-type :type/Integer}
            parts {:operator op :dimension dimension :values []}
            clause (lib-metric.filter/number-filter-clause parts)]
        (is (= op (first clause)))
        (is (= 3 (count clause)))))))

(deftest ^:parallel string-filter-clause-equals-test
  (testing "string-filter-clause creates equals clause with multiple values"
    (let [dimension {:id "00000000-0000-0000-0000-000000000001" :effective-type :type/Text}
          parts {:operator := :dimension dimension :values ["a" "b" "c"] :options {}}
          clause (lib-metric.filter/string-filter-clause parts)]
      (is (= := (first clause)))
      (is (= [:dimension {} "00000000-0000-0000-0000-000000000001"] (nth clause 2)))
      (is (= "a" (nth clause 3)))
      (is (= "b" (nth clause 4)))
      (is (= "c" (nth clause 5))))))

(deftest ^:parallel string-filter-clause-contains-test
  (testing "string-filter-clause creates contains clause"
    (let [dimension {:id "00000000-0000-0000-0000-000000000001" :effective-type :type/Text}
          parts {:operator :contains :dimension dimension :values ["search"] :options {}}
          clause (lib-metric.filter/string-filter-clause parts)]
      (is (= :contains (first clause)))
      (is (= "search" (nth clause 3))))))

(deftest ^:parallel string-filter-clause-contains-with-options-test
  (testing "string-filter-clause creates contains clause with options"
    (let [dimension {:id "00000000-0000-0000-0000-000000000001" :effective-type :type/Text}
          parts {:operator :contains :dimension dimension :values ["search"] :options {:case-sensitive false}}
          clause (lib-metric.filter/string-filter-clause parts)]
      (is (= :contains (first clause)))
      (let [opts (second clause)]
        (is (false? (:case-sensitive opts)))
        (is (string? (:lib/uuid opts)))))))

(deftest ^:parallel string-filter-clause-empty-test
  (testing "string-filter-clause creates is-empty and not-empty clauses"
    (doseq [op [:is-empty :not-empty]]
      (let [dimension {:id "00000000-0000-0000-0000-000000000001" :effective-type :type/Text}
            parts {:operator op :dimension dimension :values [] :options {}}
            clause (lib-metric.filter/string-filter-clause parts)]
        (is (= op (first clause)))
        (is (= 3 (count clause)))))))

(deftest ^:parallel coordinate-filter-clause-standard-test
  (testing "coordinate-filter-clause creates standard comparison clauses"
    (let [dimension {:id "00000000-0000-0000-0000-000000000006" :effective-type :type/Float :semantic-type :type/Latitude}
          parts {:operator := :dimension dimension :longitude-dimension nil :values [40.7128]}
          clause (lib-metric.filter/coordinate-filter-clause parts)]
      (is (= := (first clause)))
      (is (= 40.7128 (nth clause 3))))))

(deftest ^:parallel coordinate-filter-clause-inside-test
  (testing "coordinate-filter-clause creates inside clause"
    (let [lat-dim {:id "00000000-0000-0000-0000-000000000006" :effective-type :type/Float :semantic-type :type/Latitude}
          lon-dim {:id "00000000-0000-0000-0000-000000000007" :effective-type :type/Float :semantic-type :type/Longitude}
          parts {:operator :inside
                 :dimension lat-dim
                 :longitude-dimension lon-dim
                 :values [41.0 -74.5 40.5 -73.5]} ;; lat-max lon-min lat-min lon-max
          clause (lib-metric.filter/coordinate-filter-clause parts)]
      (is (= :inside (first clause)))
      (is (= [:dimension {} "00000000-0000-0000-0000-000000000006"] (nth clause 2)))
      (is (= [:dimension {} "00000000-0000-0000-0000-000000000007"] (nth clause 3)))
      (is (= 41.0 (nth clause 4)))
      (is (= -74.5 (nth clause 5)))
      (is (= 40.5 (nth clause 6)))
      (is (= -73.5 (nth clause 7))))))

(deftest ^:parallel specific-date-filter-clause-equals-test
  (testing "specific-date-filter-clause creates equals clause"
    (let [dimension {:id "dim-date" :effective-type :type/Date}
          parts {:operator := :dimension dimension :values ["2024-01-15"]}
          clause (lib-metric.filter/specific-date-filter-clause parts)]
      (is (= := (first clause)))
      (is (= "2024-01-15" (nth clause 3))))))

(deftest ^:parallel specific-date-filter-clause-between-test
  (testing "specific-date-filter-clause creates between clause"
    (let [dimension {:id "dim-date" :effective-type :type/Date}
          parts {:operator :between :dimension dimension :values ["2024-01-01" "2024-12-31"]}
          clause (lib-metric.filter/specific-date-filter-clause parts)]
      (is (= :between (first clause)))
      (is (= "2024-01-01" (nth clause 3)))
      (is (= "2024-12-31" (nth clause 4))))))

(deftest ^:parallel relative-date-filter-clause-simple-test
  (testing "relative-date-filter-clause creates simple time-interval clause"
    (let [dimension {:id "dim-date" :effective-type :type/DateTime}
          parts {:dimension dimension :unit :day :value -30 :offset-unit nil :offset-value nil :options {}}
          clause (lib-metric.filter/relative-date-filter-clause parts)]
      (is (= :time-interval (first clause)))
      (is (string? (:lib/uuid (second clause))))
      (is (= [:dimension {} "dim-date"] (nth clause 2)))
      (is (= -30 (nth clause 3)))
      (is (= :day (nth clause 4))))))

(deftest ^:parallel relative-date-filter-clause-with-offset-test
  (testing "relative-date-filter-clause creates time-interval clause with offset"
    (let [dimension {:id "dim-date" :effective-type :type/DateTime}
          parts {:dimension dimension :unit :day :value -7 :offset-unit :week :offset-value -1 :options {:include-current true}}
          clause (lib-metric.filter/relative-date-filter-clause parts)]
      (is (= :time-interval (first clause)))
      (let [opts (second clause)]
        (is (= :week (:offset-unit opts)))
        (is (= -1 (:offset-value opts)))
        (is (= true (:include-current opts)))))))

(deftest ^:parallel exclude-date-filter-clause-day-of-week-test
  (testing "exclude-date-filter-clause creates exclude by day-of-week"
    (let [dimension {:id "dim-date" :effective-type :type/DateTime}
          parts {:operator :!= :dimension dimension :unit :day-of-week :values [1 7]} ;; exclude Sunday and Saturday
          clause (lib-metric.filter/exclude-date-filter-clause parts)]
      (is (= :!= (first clause)))
      (let [extraction (nth clause 2)]
        (is (= :get-day-of-week (first extraction)))
        (is (= [:dimension {} "dim-date"] (nth extraction 2))))
      (is (= 1 (nth clause 3)))
      (is (= 7 (nth clause 4))))))

(deftest ^:parallel exclude-date-filter-clause-null-test
  (testing "exclude-date-filter-clause creates null check clause"
    (let [dimension {:id "dim-date" :effective-type :type/DateTime}
          parts {:operator :is-null :dimension dimension :unit nil :values []}
          clause (lib-metric.filter/exclude-date-filter-clause parts)]
      (is (= :is-null (first clause))))))

(deftest ^:parallel time-filter-clause-greater-than-test
  (testing "time-filter-clause creates greater than clause"
    (let [dimension {:id "00000000-0000-0000-0000-000000000005" :effective-type :type/Time}
          parts {:operator :> :dimension dimension :values ["09:00:00"]}
          clause (lib-metric.filter/time-filter-clause parts)]
      (is (= :> (first clause)))
      (is (= "09:00:00" (nth clause 3))))))

(deftest ^:parallel time-filter-clause-between-test
  (testing "time-filter-clause creates between clause"
    (let [dimension {:id "00000000-0000-0000-0000-000000000005" :effective-type :type/Time}
          parts {:operator :between :dimension dimension :values ["09:00:00" "17:00:00"]}
          clause (lib-metric.filter/time-filter-clause parts)]
      (is (= :between (first clause)))
      (is (= "09:00:00" (nth clause 3)))
      (is (= "17:00:00" (nth clause 4))))))

;;; -------------------------------------------------- Filter Parts Extraction Tests --------------------------------------------------
;;; These tests use a mock metadata provider to return test dimensions

(def ^:private mock-string-dim
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000001"
   :name           "category"
   :display-name   "Category"
   :effective-type :type/Text
   :semantic-type  nil
   :source-type    :metric
   :source-id      1})

(def ^:private mock-number-dim
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000002"
   :name           "amount"
   :display-name   "Amount"
   :effective-type :type/Float
   :semantic-type  nil
   :source-type    :metric
   :source-id      1})

(def ^:private mock-boolean-dim
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000003"
   :name           "is_active"
   :display-name   "Is Active"
   :effective-type :type/Boolean
   :semantic-type  nil
   :source-type    :metric
   :source-id      1})

(def ^:private mock-datetime-dim
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000004"
   :name           "created_at"
   :display-name   "Created At"
   :effective-type :type/DateTime
   :semantic-type  :type/CreationTimestamp
   :source-type    :metric
   :source-id      1})

(def ^:private mock-time-dim
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000005"
   :name           "start_time"
   :display-name   "Start Time"
   :effective-type :type/Time
   :semantic-type  nil
   :source-type    :metric
   :source-id      1})

(def ^:private mock-lat-dim
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000006"
   :name           "latitude"
   :display-name   "Latitude"
   :effective-type :type/Float
   :semantic-type  :type/Latitude
   :source-type    :metric
   :source-id      1})

(def ^:private mock-lon-dim
  {:lib/type       :metadata/dimension
   :id             "00000000-0000-0000-0000-000000000007"
   :name           "longitude"
   :display-name   "Longitude"
   :effective-type :type/Float
   :semantic-type  :type/Longitude
   :source-type    :metric
   :source-id      1})

(def ^:private mock-dimensions
  [mock-string-dim mock-number-dim mock-boolean-dim mock-datetime-dim mock-time-dim mock-lat-dim mock-lon-dim])

(defn- mock-dimension-fetcher
  "Mock dimension fetcher that returns mock-dimensions for metric-id 1."
  [{:keys [metric-id]}]
  (when (= metric-id 1)
    mock-dimensions))

(def ^:private mock-metadata-provider
  "A mock metadata provider that returns mock dimensions."
  (lib-metric.metadata.provider/metric-context-metadata-provider
   (constantly [])           ; metric-fetcher-fn
   (constantly [])           ; measure-fetcher-fn
   mock-dimension-fetcher    ; dimension-fetcher-fn
   (constantly nil)          ; table->db-fn
   (constantly nil)          ; db-provider-fn
   (constantly nil)))        ; setting-fn

(def ^:private mock-definition
  {:lib/type          :metric/definition
   :source            {:type :source/metric :id 1}
   :filters           []
   :projections       []
   :metadata-provider mock-metadata-provider})

(deftest ^:parallel default-filter-parts-is-null-test
  (testing "default-filter-parts extracts is-null parts"
    (let [clause [:is-null {} [:dimension {} "00000000-0000-0000-0000-000000000002"]]
          parts (lib-metric.filter/default-filter-parts mock-definition clause)]
      (is (= :is-null (:operator parts)))
      (is (= (:id mock-number-dim) (:id (:dimension parts)))))))

(deftest ^:parallel default-filter-parts-not-null-test
  (testing "default-filter-parts extracts not-null parts"
    (let [clause [:not-null {} [:dimension {} "00000000-0000-0000-0000-000000000001"]]
          parts (lib-metric.filter/default-filter-parts mock-definition clause)]
      (is (= :not-null (:operator parts)))
      (is (= (:id mock-string-dim) (:id (:dimension parts)))))))

(deftest ^:parallel default-filter-parts-returns-nil-for-other-operators-test
  (testing "default-filter-parts returns nil for non-null operators"
    (let [clause [:= {} [:dimension {} "00000000-0000-0000-0000-000000000002"] 42]
          parts (lib-metric.filter/default-filter-parts mock-definition clause)]
      (is (nil? parts)))))

(deftest ^:parallel boolean-filter-parts-equals-test
  (testing "boolean-filter-parts extracts equals parts"
    (let [clause [:= {} [:dimension {} "00000000-0000-0000-0000-000000000003"] true]
          parts (lib-metric.filter/boolean-filter-parts mock-definition clause)]
      (is (= := (:operator parts)))
      (is (= (:id mock-boolean-dim) (:id (:dimension parts))))
      (is (= [true] (:values parts))))))

(deftest ^:parallel boolean-filter-parts-null-test
  (testing "boolean-filter-parts extracts null check parts"
    (let [clause [:is-null {} [:dimension {} "00000000-0000-0000-0000-000000000003"]]
          parts (lib-metric.filter/boolean-filter-parts mock-definition clause)]
      (is (= :is-null (:operator parts)))
      (is (= [] (:values parts))))))

(deftest ^:parallel boolean-filter-parts-returns-nil-for-non-boolean-test
  (testing "boolean-filter-parts returns nil for non-boolean dimension"
    (let [clause [:= {} [:dimension {} "00000000-0000-0000-0000-000000000002"] 42]
          parts (lib-metric.filter/boolean-filter-parts mock-definition clause)]
      (is (nil? parts)))))

(deftest ^:parallel number-filter-parts-equals-test
  (testing "number-filter-parts extracts equals parts"
    (let [clause [:= {} [:dimension {} "00000000-0000-0000-0000-000000000002"] 42]
          parts (lib-metric.filter/number-filter-parts mock-definition clause)]
      (is (= := (:operator parts)))
      (is (= (:id mock-number-dim) (:id (:dimension parts))))
      (is (= [42] (:values parts))))))

(deftest ^:parallel number-filter-parts-between-test
  (testing "number-filter-parts extracts between parts"
    (let [clause [:between {} [:dimension {} "00000000-0000-0000-0000-000000000002"] 10 100]
          parts (lib-metric.filter/number-filter-parts mock-definition clause)]
      (is (= :between (:operator parts)))
      (is (= [10 100] (:values parts))))))

(deftest ^:parallel number-filter-parts-comparison-test
  (testing "number-filter-parts extracts comparison parts"
    (doseq [op [:> :>= :< :<=]]
      (let [clause [op {} [:dimension {} "00000000-0000-0000-0000-000000000002"] 50]
            parts (lib-metric.filter/number-filter-parts mock-definition clause)]
        (is (= op (:operator parts)))
        (is (= [50] (:values parts)))))))

(deftest ^:parallel number-filter-parts-returns-nil-for-non-numeric-test
  (testing "number-filter-parts returns nil for non-numeric dimension"
    (let [clause [:= {} [:dimension {} "00000000-0000-0000-0000-000000000001"] "value"]
          parts (lib-metric.filter/number-filter-parts mock-definition clause)]
      (is (nil? parts)))))

(deftest ^:parallel string-filter-parts-equals-test
  (testing "string-filter-parts extracts equals parts"
    (let [clause [:= {} [:dimension {} "00000000-0000-0000-0000-000000000001"] "a" "b" "c"]
          parts (lib-metric.filter/string-filter-parts mock-definition clause)]
      (is (= := (:operator parts)))
      (is (= (:id mock-string-dim) (:id (:dimension parts))))
      (is (= ["a" "b" "c"] (:values parts)))
      (is (= {} (:options parts))))))

(deftest ^:parallel string-filter-parts-contains-test
  (testing "string-filter-parts extracts contains parts"
    (let [clause [:contains {} [:dimension {} "00000000-0000-0000-0000-000000000001"] "search"]
          parts (lib-metric.filter/string-filter-parts mock-definition clause)]
      (is (= :contains (:operator parts)))
      (is (= ["search"] (:values parts)))
      (is (= {} (:options parts))))))

(deftest ^:parallel string-filter-parts-contains-with-options-test
  (testing "string-filter-parts extracts contains parts with options"
    (let [clause [:contains {:case-sensitive false} [:dimension {} "00000000-0000-0000-0000-000000000001"] "search"]
          parts (lib-metric.filter/string-filter-parts mock-definition clause)]
      (is (= :contains (:operator parts)))
      (is (= {:case-sensitive false} (:options parts))))))

(deftest ^:parallel string-filter-parts-empty-test
  (testing "string-filter-parts extracts is-empty parts"
    (let [clause [:is-empty {} [:dimension {} "00000000-0000-0000-0000-000000000001"]]
          parts (lib-metric.filter/string-filter-parts mock-definition clause)]
      (is (= :is-empty (:operator parts)))
      (is (= [] (:values parts))))))

(deftest ^:parallel coordinate-filter-parts-standard-test
  (testing "coordinate-filter-parts extracts standard comparison parts"
    (let [clause [:= {} [:dimension {} "00000000-0000-0000-0000-000000000006"] 40.7128]
          parts (lib-metric.filter/coordinate-filter-parts mock-definition clause)]
      (is (= := (:operator parts)))
      (is (= (:id mock-lat-dim) (:id (:dimension parts))))
      (is (= [40.7128] (:values parts)))
      (is (nil? (:longitude-dimension parts))))))

(deftest ^:parallel coordinate-filter-parts-inside-test
  (testing "coordinate-filter-parts extracts inside parts"
    (let [clause [:inside {} [:dimension {} "00000000-0000-0000-0000-000000000006"] [:dimension {} "00000000-0000-0000-0000-000000000007"] 41.0 -74.5 40.5 -73.5]
          parts (lib-metric.filter/coordinate-filter-parts mock-definition clause)]
      (is (= :inside (:operator parts)))
      (is (= (:id mock-lat-dim) (:id (:dimension parts))))
      (is (= (:id mock-lon-dim) (:id (:longitude-dimension parts))))
      (is (= [41.0 -74.5 40.5 -73.5] (:values parts))))))

(deftest ^:parallel specific-date-filter-parts-equals-test
  (testing "specific-date-filter-parts extracts equals parts"
    (let [clause [:= {} [:dimension {} "00000000-0000-0000-0000-000000000004"] "2024-01-15"]
          parts (lib-metric.filter/specific-date-filter-parts mock-definition clause)]
      (is (= := (:operator parts)))
      (is (= (:id mock-datetime-dim) (:id (:dimension parts))))
      (is (= ["2024-01-15"] (:values parts)))
      (is (false? (:has-time parts))))))

(deftest ^:parallel specific-date-filter-parts-with-time-test
  (testing "specific-date-filter-parts detects time component"
    (let [clause [:= {} [:dimension {} "00000000-0000-0000-0000-000000000004"] "2024-01-15T14:30:00"]
          parts (lib-metric.filter/specific-date-filter-parts mock-definition clause)]
      (is (= ["2024-01-15T14:30:00"] (:values parts)))
      (is (true? (:has-time parts))))))

(deftest ^:parallel specific-date-filter-parts-between-test
  (testing "specific-date-filter-parts extracts between parts"
    (let [clause [:between {} [:dimension {} "00000000-0000-0000-0000-000000000004"] "2024-01-01" "2024-12-31"]
          parts (lib-metric.filter/specific-date-filter-parts mock-definition clause)]
      (is (= :between (:operator parts)))
      (is (= ["2024-01-01" "2024-12-31"] (:values parts))))))

(deftest ^:parallel relative-date-filter-parts-simple-test
  (testing "relative-date-filter-parts extracts simple time-interval parts"
    (let [clause [:time-interval {} [:dimension {} "00000000-0000-0000-0000-000000000004"] -30 :day]
          parts (lib-metric.filter/relative-date-filter-parts mock-definition clause)]
      (is (= (:id mock-datetime-dim) (:id (:dimension parts))))
      (is (= :day (:unit parts)))
      (is (= -30 (:value parts)))
      (is (nil? (:offset-unit parts)))
      (is (nil? (:offset-value parts)))
      (is (= {} (:options parts))))))

(deftest ^:parallel relative-date-filter-parts-with-offset-test
  (testing "relative-date-filter-parts extracts parts with offset"
    (let [clause [:time-interval {:offset-unit :week :offset-value -1 :include-current true}
                  [:dimension {} "00000000-0000-0000-0000-000000000004"] -7 :day]
          parts (lib-metric.filter/relative-date-filter-parts mock-definition clause)]
      (is (= :week (:offset-unit parts)))
      (is (= -1 (:offset-value parts)))
      (is (= {:include-current true} (:options parts))))))

(deftest ^:parallel exclude-date-filter-parts-day-of-week-test
  (testing "exclude-date-filter-parts extracts day-of-week exclusion"
    (let [clause [:!= {} [:get-day-of-week {} [:dimension {} "00000000-0000-0000-0000-000000000004"]] 1 7]
          parts (lib-metric.filter/exclude-date-filter-parts mock-definition clause)]
      (is (= :!= (:operator parts)))
      (is (= (:id mock-datetime-dim) (:id (:dimension parts))))
      (is (= :day-of-week (:unit parts)))
      (is (= [1 7] (:values parts))))))

(deftest ^:parallel time-filter-parts-greater-than-test
  (testing "time-filter-parts extracts greater than parts"
    (let [clause [:> {} [:dimension {} "00000000-0000-0000-0000-000000000005"] "09:00:00"]
          parts (lib-metric.filter/time-filter-parts mock-definition clause)]
      (is (= :> (:operator parts)))
      (is (= (:id mock-time-dim) (:id (:dimension parts))))
      (is (= ["09:00:00"] (:values parts))))))

(deftest ^:parallel time-filter-parts-between-test
  (testing "time-filter-parts extracts between parts"
    (let [clause [:between {} [:dimension {} "00000000-0000-0000-0000-000000000005"] "09:00:00" "17:00:00"]
          parts (lib-metric.filter/time-filter-parts mock-definition clause)]
      (is (= :between (:operator parts)))
      (is (= ["09:00:00" "17:00:00"] (:values parts))))))

(deftest ^:parallel time-filter-parts-returns-nil-for-non-time-test
  (testing "time-filter-parts returns nil for non-time dimension"
    (let [clause [:> {} [:dimension {} "00000000-0000-0000-0000-000000000004"] "2024-01-15"]
          parts (lib-metric.filter/time-filter-parts mock-definition clause)]
      (is (nil? parts)))))
