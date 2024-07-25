(ns metabase.query-analysis.native-query-analyzer-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-analysis.native-query-analyzer :as nqa]
   [metabase.test :as mt]
   [metabase.util :as u]))

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

(deftest ^:parallel consolidate-columns-test
  (testing "We match references with known fields where possible, and remove redundancies"
    (is (= [{:field-id 1, :table "t1", :column "c1"}
            {:field-id 2, :table "t3", :column "c1"}
            {             :table "t2", :column "c2"}
            {:field-id 3, :table "t3", :column "c3"}
            {                          :column "c4"}]
           (sort-by (juxt :column :table :field-id)
                    (#'nqa/consolidate-columns
                     [{:table "t1" :column "c1"}
                      {            :column "c1"}
                      {:table "t2" :column "c2"}
                      {            :column "c2"}
                      {:table "t3" :column "c3"}
                      {            :column "c4"}]
                     [{:field-id 1 :table "t1" :column "c1"}
                      {:field-id 2 :table "t3" :column "c1"}
                      {:field-id 3 :table "t3" :column "c3"}]))))))

(defn- refs [sql]
  (->> (mt/native-query {:query sql})
       (#'nqa/references-for-native)
       (sort-by (juxt :table :column))))

(defn- explicit-reference [table column found?]
  (if-not found?
    {:table              (name table)
     :column             (name column)
     :explicit-reference true}
    (let [reference (nqa/field-reference (mt/id) table column)]
      ;; check that we found a valid reference
      (assert (= #{:table-id :table :field-id :column} (set (keys reference))))
      (assert (every? some? (vals reference)))
      ;; the case depends on the driver, and we use what's in the database
      (assert (= (name table) (u/lower-case-en (:table reference))))
      (assert (= (name column) (u/lower-case-en (:column reference))))
      ;; tag it
      (assoc reference :explicit-reference true))))

(deftest ^:parallel field-matching-test
  (testing "simple query matches"
    (is (= [(explicit-reference :venues :id true)]
           (refs "select id from venues"))))
  (testing "quotes stop case matching"
    (is (= [(explicit-reference :venues :id false)]
           (refs "select \"id\" from venues")))
    (is (= [(explicit-reference :venues :id true)]
           (refs "select \"ID\" from venues"))))
  (testing "unresolved references use case verbatim"
    (is (= "id" (:column (first (refs "select \"id\" from unknown")))))
    (is (= "ID" (:column (first (refs "select \"ID\" from unknown"))))))
  (testing "you can mix quoted and unquoted names"
    (is (= [(explicit-reference :venues :id true)
            (explicit-reference :venues :name true)]
           (refs "select v.\"ID\", v.name from venues v")))
    (is (= [(explicit-reference :venues :id true)
            (explicit-reference :venues :name true)]
           (refs "select v.`ID`, v.name from venues v"))))
  (testing "It will find all relevant columns if query is not specific"
    (is (= [(explicit-reference :checkins :id true)
            (explicit-reference :venues :id true)]
           (refs "select id from venues join checkins"))))
  (testing "But if you are specific - then it's a concrete field"
    (is (= [(explicit-reference :venues :id true)]
           (refs "select v.id from venues v join checkins"))))
  (testing "And wildcards are matching everything"
    (is (= {false 10}
           (frequencies (map :explicit-reference (refs "select * from venues v join checkins")))))
    (is (= {false 6}
           (frequencies (map :explicit-reference (refs "select v.* from venues v join checkins"))))))

  (when (not (contains? #{:snowflake :oracle} driver/*driver*))
    (testing "Analysis does not fail due to keywords that are only reserved in other databases"
      (is (= [(explicit-reference :venues :id true)]
             (refs "select id as final from venues"))))))
