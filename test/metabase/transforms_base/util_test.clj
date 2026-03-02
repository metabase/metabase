(ns metabase.transforms-base.util-test
  "Tests for pure transform utility functions in transforms-base."
  (:require
   [clojure.test :refer :all]
   [metabase.transforms-base.util :as transforms-base.util]))

(set! *warn-on-reflection* true)

(deftest ^:parallel matching-timestamp?-test
  (testing "matching-timestamp? checks if a timestamp falls within a date range [start, end)"
    (let [matching-timestamp? #'transforms-base.util/matching-timestamp?
          field-path          [:start_time]
          range-jan-feb       {:start "2024-01-01T00:00:00Z" :end "2024-02-01T00:00:00Z"}
          range-start-only    {:start "2024-01-01T00:00:00Z" :end nil}
          range-end-only      {:start nil :end "2024-02-01T00:00:00Z"}]

      (testing "with both start and end bounds"
        (are [expected timestamp]
             (= expected (matching-timestamp? {:start_time timestamp} field-path range-jan-feb))
          nil   nil                       ; missing field returns nil
          true  "2024-01-15T12:00:00Z"    ; timestamp in middle of range
          false "2023-12-15T12:00:00Z"    ; timestamp before range
          false "2024-02-15T12:00:00Z"    ; timestamp after range
          true  "2024-01-01T00:00:00Z"    ; start boundary is inclusive
          true  "2024-02-01T00:00:00Z"))  ; end boundary is inclusive too

      (testing "with only start bound"
        (are [expected timestamp]
             (= expected (matching-timestamp? {:start_time timestamp} field-path range-start-only))
          true  "2024-01-15T12:00:00Z"    ; timestamp after start
          true  "2024-02-15T12:00:00Z"    ; any timestamp after start
          false "2023-12-15T12:00:00Z"))  ; timestamp before start

      (testing "with only end bound"
        (are [expected timestamp]
             (= expected (matching-timestamp? {:start_time timestamp} field-path range-end-only))
          true  "2024-01-15T12:00:00Z"    ; timestamp before end
          true  "2023-12-15T12:00:00Z"    ; any timestamp before end
          false "2024-02-15T12:00:00Z"))  ; timestamp after end

      (testing "returns nil when field value is missing"
        (are [job] (nil? (matching-timestamp? job field-path range-jan-feb))
          {}
          {:other "value"})))))

(deftest ^:parallel massage-sql-query-test
  (testing "massage-sql-query sets disable-remaps? and disable-max-results?"
    (let [query    {:database 1, :type :query, :query {:source-table 1}}
          massaged (transforms-base.util/massage-sql-query query)]
      (is (true? (get-in massaged [:middleware :disable-remaps?])))
      (is (true? (get-in massaged [:middleware :disable-max-results?]))))))

(deftest ^:parallel type-predicates-test
  (testing "transform-type extracts the source type"
    (is (= :query (transforms-base.util/transform-type {:source {:type "query"}})))
    (is (= :python (transforms-base.util/transform-type {:source {:type "python"}}))))

  (testing "query-transform? returns true for query transforms"
    (is (true? (transforms-base.util/query-transform? {:source {:type "query"}})))
    (is (false? (transforms-base.util/query-transform? {:source {:type "python"}}))))

  (testing "python-transform? returns true for python transforms"
    (is (true? (transforms-base.util/python-transform? {:source {:type "python"}})))
    (is (false? (transforms-base.util/python-transform? {:source {:type "query"}})))))

(deftest ^:parallel transform-source-database-test
  (testing "extracts source database for query transforms"
    (is (= 42 (transforms-base.util/transform-source-database {:source {:type "query" :query {:database 42}}}))))
  (testing "extracts source database for python transforms"
    (is (= 99 (transforms-base.util/transform-source-database {:source {:type "python" :source-database 99}})))))

(deftest ^:parallel qualified-table-name-test
  (testing "with schema"
    (is (= :my_schema/my_table (transforms-base.util/qualified-table-name :postgres {:schema "my_schema" :name "my_table"}))))
  (testing "without schema"
    (is (= :my_table (transforms-base.util/qualified-table-name :postgres {:name "my_table"})))))

(deftest ^:parallel supported-incremental-filter-type?-test
  (testing "temporal types are supported"
    (is (true? (transforms-base.util/supported-incremental-filter-type? :type/DateTime)))
    (is (true? (transforms-base.util/supported-incremental-filter-type? :type/Date))))
  (testing "numeric types are supported"
    (is (true? (transforms-base.util/supported-incremental-filter-type? :type/Integer)))
    (is (true? (transforms-base.util/supported-incremental-filter-type? :type/Float))))
  (testing "text types are not supported"
    (is (false? (transforms-base.util/supported-incremental-filter-type? :type/Text)))))

(deftest ^:parallel required-database-features-test
  (testing "query transforms need :transforms/table"
    (is (= [:transforms/table] (transforms-base.util/required-database-features {:source {:type "query"}}))))
  (testing "python transforms need :transforms/python"
    (is (= [:transforms/python] (transforms-base.util/required-database-features {:source {:type "python"}})))))
