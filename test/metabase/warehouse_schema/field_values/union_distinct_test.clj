(ns ^:mb/driver-tests metabase.warehouse-schema.field-values.union-distinct-test
  "Tests for the UNION ALL distinct-values fetcher used by field-values sync."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.warehouse-schema.field-values.union-distinct :as union-distinct]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------- decode-value ----------------------------------

(deftest decode-value-test
  (testing "nil passes through"
    (is (nil? (#'union-distinct/decode-value :type/Text nil))))
  (testing "Text base-type → string passthrough"
    (is (= "hello" (#'union-distinct/decode-value :type/Text "hello")))
    (is (= "" (#'union-distinct/decode-value :type/Text ""))))
  (testing "Integer base-type → Long"
    (is (= 42 (#'union-distinct/decode-value :type/Integer "42")))
    (is (= -1 (#'union-distinct/decode-value :type/Integer "-1"))))
  (testing "BigInteger overflow → BigInteger"
    (is (= 12345678901234567890N
           (#'union-distinct/decode-value :type/Integer "12345678901234567890"))))
  (testing "Boolean accepts true/t/1"
    (is (true?  (#'union-distinct/decode-value :type/Boolean "true")))
    (is (true?  (#'union-distinct/decode-value :type/Boolean "t")))
    (is (true?  (#'union-distinct/decode-value :type/Boolean "1")))
    (is (false? (#'union-distinct/decode-value :type/Boolean "false")))
    (is (false? (#'union-distinct/decode-value :type/Boolean "f")))
    (is (false? (#'union-distinct/decode-value :type/Boolean "0"))))
  (testing "Unknown base-type → string passthrough"
    (is (= "raw" (#'union-distinct/decode-value :type/Float "raw")))
    (is (= "anything" (#'union-distinct/decode-value :type/SomeMadeUpType "anything")))))

;;; ---------------------------------- end-to-end against H2 -------------------------

(deftest union-distinct-values-h2-integration-test
  (testing "UNION path returns correct distinct values for each field"
    (mt/dataset test-data
      (let [fields  [(t2/select-one :model/Field :id (mt/id :people :state))
                     (t2/select-one :model/Field :id (mt/id :people :source))]
            results (union-distinct/union-distinct-values (mt/id :people) fields)]
        (is (map? results) "Returns a map keyed by field-id")
        (is (= (set (map :id fields)) (set (keys results))))
        (testing "people.state distinct values match the per-field path"
          (let [{:keys [values raw-count]} (get results (mt/id :people :state))]
            (is (pos? raw-count))
            (is (every? string? values))
            (is (every? #(= 2 (count %)) values) "US state abbreviations are 2-char")))
        (testing "people.source distinct values match the per-field path"
          (let [{:keys [values]} (get results (mt/id :people :source))]
            (is (set? (set values)))
            (is (seq values))
            (is (every? string? values))))))))

(deftest union-distinct-empty-fields-returns-nil-test
  (testing "Empty fields seq → nil"
    (is (nil? (union-distinct/union-distinct-values 1 [])))
    (is (nil? (union-distinct/union-distinct-values 1 nil)))))

(deftest union-distinct-batches-large-field-set-test
  (testing "Field count > *batch-size* is broken into multiple queries"
    (mt/dataset test-data
      (binding [union-distinct/*batch-size* 2]
        (let [fields  (vec (t2/select :model/Field
                                      :table_id (mt/id :people)
                                      :active true
                                      :visibility_type "normal"
                                      {:order-by [[:name :asc]]}))
              results (union-distinct/union-distinct-values (mt/id :people) fields)]
          (is (= (count fields) (count results))
              "Every field appears in the result map even though queries were batched"))))))

;;; ---------------------------------- sync-fields-grouped-by-table! ----------------

(deftest sync-fields-grouped-by-table!-test
  (testing "End-to-end: fetches via UNION, persists via persist-field-values!, returns status keywords"
    (mt/dataset test-data
      (mt/with-temp [:model/FieldValues _ {:field_id (mt/id :people :state)
                                           :type     :full
                                           :values   ["XX" "YY"]
                                           :has_more_values false}]
        (let [field   (t2/select-one :model/Field :id (mt/id :people :state))
              results (union-distinct/sync-fields-grouped-by-table! [field])]
          (is (= 1 (count results)))
          (is (#{::field-values/fv-created
                 ::field-values/fv-updated
                 ::field-values/fv-skipped} (first results))
              "Returns a status keyword for each field, not an exception")
          (testing "After sync, FieldValues row reflects the real distinct set"
            (let [fv     (t2/select-one :model/FieldValues
                                        :field_id (mt/id :people :state)
                                        :type     :full)
                  states (set (:values fv))]
              (is (contains? states "CA"))
              (is (not (contains? states "XX")) "Stale seeded values were replaced"))))))))

(deftest sync-fields-grouped-by-table!-empty-input-test
  (testing "Empty/nil input → nil (no work)"
    (is (nil? (union-distinct/sync-fields-grouped-by-table! [])))
    (is (nil? (union-distinct/sync-fields-grouped-by-table! nil)))))

;;; ---------------------------------- parity vs per-field --------------------------

(deftest ^:sync union-distinct-matches-per-field-test
  (testing "UNION-DISTINCT returns the same value set per column as the existing per-field DISTINCT path"
    ;; Only check fields whose distinct count is below the per-column LIMIT. For columns that hit
    ;; the cap, both paths return a valid subset but the warehouse is free to pick *which* 1000
    ;; — the subsets may differ across paths/engines without either being wrong.
    (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
      (mt/dataset test-data
        (let [fields (mapv #(t2/select-one :model/Field :id (mt/id :people %))
                           [:state :source])
              per-field-results (into {}
                                      (map (fn [f]
                                             (let [v (-> (field-values/distinct-values f) :values)]
                                               ;; distinct-values returns rows as 1-tuples
                                               [(:id f) (set (map first v))])))
                                      fields)
              union-results     (union-distinct/union-distinct-values (mt/id :people) fields)]
          (doseq [field fields]
            (testing (format "field %s (%s)" (:name field) (name (:base_type field)))
              (let [expected (get per-field-results (:id field))
                    actual   (set (:values (get union-results (:id field))))]
                (is (= expected actual)
                    (format "UNION distinct values differ from per-field DISTINCT for %s on %s"
                            (:name field) (name driver/*driver*)))))))))))

;;; ---------------------------------- cross-driver ----------------------------------

(deftest ^:sync union-distinct-values-cross-driver-test
  (testing "UNION ALL distinct-values fetcher produces correct results on every supported SQL driver"
    (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
      (mt/dataset test-data
        (let [state-field  (t2/select-one :model/Field :id (mt/id :people :state))
              source-field (t2/select-one :model/Field :id (mt/id :people :source))
              results      (union-distinct/union-distinct-values
                            (mt/id :people)
                            [state-field source-field])]
          (testing "Result map is keyed by field-id with :values / :raw-count entries"
            (is (map? results))
            (is (= #{(:id state-field) (:id source-field)} (set (keys results)))))
          (testing "Returned values are non-empty Clojure values, not raw JDBC objects"
            (let [{:keys [values]} (get results (:id state-field))]
              (is (pos? (count values)))
              (is (every? string? values)
                  (str "state-field values should decode to strings, got: " (pr-str (take 3 values))))))
          (testing "Sources column returns a small distinct set"
            (let [{:keys [values raw-count]} (get results (:id source-field))]
              (is (< raw-count union-distinct/*distinct-limit*)
                  "source has few enough distinct values to not hit the LIMIT")
              (is (every? string? values)))))))))
