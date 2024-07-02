(ns metabase.native-query-analyzer-test
  (:require
   [clojure.test :refer :all]
   [metabase.db.connection :as mdb.connection]
   [metabase.driver :as driver]
   [metabase.native-query-analyzer :as query-analyzer]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]))

(deftest active-test
  (mt/discard-setting-changes [sql-parsing-enabled]
    (testing "sql parsing enabled"
      (public-settings/sql-parsing-enabled! true)
      (binding [query-analyzer/*parse-queries-in-test?* true]
        (is (true? (#'query-analyzer/active?)))))
    (testing "sql parsing disabled"
      (public-settings/sql-parsing-enabled! false)
      (binding [query-analyzer/*parse-queries-in-test?* true]
        (is (false? (#'query-analyzer/active?)))))))

(deftest ^:parallel field-quoting-test
  (testing "unquoted fields are case-insensitive"
    (is (= [:= [:lower :f.name] "test"]
           (#'query-analyzer/field-query :f.name "test")
           (#'query-analyzer/field-query :f.name "tEsT"))))
  (testing "quoted fields are case-sensitive"
    (is (= [:= :f.name "TEST"]
           (#'query-analyzer/field-query :f.name "\"TEST\""))))
  (testing "escaping inside quoted fields should be handled properly"
    (is (= [:= :f.name "Perv\"e\"rse"]
           ;; this is "Perv""e""rse"
           (#'query-analyzer/field-query :f.name "\"Perv\"\"e\"\"rse\"")))))

(deftest ^:parallel field-matching-test
  (binding [query-analyzer/*parse-queries-in-test?* true]
    (let [q (fn [sql]
              (#'query-analyzer/field-ids-for-native (mt/native-query {:query sql})))]
      (testing "simple query matches"
        (is (= {:explicit #{(mt/id :venues :id)} :implicit nil}
               (q "select id from venues"))))
      (testing "quotes stop case matching"
        ;; MySQL does case-insensitive string comparisons by default; quoting does not make it consider case
        ;; in field names either, so it's consistent behavior
        (if (= (mdb.connection/db-type) :mysql)
          (is (= {:explicit #{(mt/id :venues :id)} :implicit nil}
                 (q "select \"id\" from venues")))
          (is (= {:explicit nil :implicit nil}
                 (q "select \"id\" from venues"))))
        (is (= {:explicit #{(mt/id :venues :id)} :implicit nil}
               (q "select \"ID\" from venues"))))
      (testing "you can mix quoted and unquoted names"
        (is (= {:explicit #{(mt/id :venues :id) (mt/id :venues :name)} :implicit nil}
               (q "select v.\"ID\", v.name from venues v")))
        (is (= {:explicit #{(mt/id :venues :id) (mt/id :venues :name)} :implicit nil}
               (q "select v.`ID`, v.name from venues v"))))
      (testing "It will find all relevant columns if query is not specific"
        (is (= {:explicit #{(mt/id :venues :id) (mt/id :checkins :id)} :implicit nil}
               (q "select id from venues join checkins"))))
      (testing "But if you are specific - then it's a concrete field"
        (is (= {:explicit #{(mt/id :venues :id)} :implicit nil}
               (q "select v.id from venues v join checkins"))))
      (testing "And wildcards are matching everything"
        (is (= 10
               (-> (q "select * from venues v join checkins")
                   :implicit count)))
        (is (= 6
               (-> (q "select v.* from venues v join checkins")
                   :implicit count))))

      (when (not (contains? #{:snowflake :oracle} driver/*driver*))
        (testing "Analysis does not fail due to keywords that are only reserved in other databases"
          (is (= {:explicit #{(mt/id :venues :id)} :implicit nil}
                 (q "select id as final from venues"))))))))
