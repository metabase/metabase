(ns metabase.query-analysis.native-query-analyzer-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-analysis.native-query-analyzer :as nqa]
   [metabase.test :as mt]))

(deftest ^:parallel field-quoting-test
  (testing "unquoted fields are case-insensitive"
    (is (= [:= [:lower :f.name] "test"]
           (#'nqa/field-query :f.name "test")
           (#'nqa/field-query :f.name "tEsT"))))
  (testing "quoted fields are case-sensitive"
    (is (= [:= :f.name "TEST"]
           (#'nqa/field-query :f.name "\"TEST\""))))
  (testing "escaping inside quoted fields should be handled properly"
    (is (= [:= :f.name "Perv\"e\"rse"]
           ;; this is "Perv""e""rse"
           (#'nqa/field-query :f.name "\"Perv\"\"e\"\"rse\"")))))

(deftest ^:parallel field-matching-test
  (let [q (fn [sql]
            (#'nqa/field-ids-for-native (mt/native-query {:query sql})))]
    (testing "simple query matches"
      (is (= {:explicit #{(mt/id :venues :id)} :implicit nil}
             (q "select id from venues"))))
    (testing "quotes stop case matching"
      (is (= {:explicit nil :implicit nil}
             (q "select \"id\" from venues")))
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
               (q "select id as final from venues")))))))
