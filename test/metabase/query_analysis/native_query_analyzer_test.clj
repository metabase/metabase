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

(defn- references->id-sets [refs]
  {:explicit (not-empty (into #{} (comp (filter :explicit-reference) (keep :field_id)) refs))
   :implicit (not-empty (into #{} (comp (remove :explicit-reference) (keep :field_id)) refs))})

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
  (#'nqa/references-for-native (mt/native-query {:query sql})))

(defn- explicit-reference [table column found?]
  (merge
   {:table              (name table)
    :column             (name column)
    :explicit-reference true}
   (when found?
     {:table_id (mt/id table)
      :field_id (mt/id table column)})))

(deftest ^:parallel field-matching-test
  (let [q (comp references->id-sets refs)]
    (testing "simple query matches"
      (is (= [(explicit-reference :venues :id true)]
             (refs "select id from venues"))))
    (testing "quotes stop case matching"
      (is (= [(explicit-reference :venues :id false) ]
             (refs "select \"id\" from venues")))
      (is (= [(explicit-reference :venues :id true)]
             (refs "select \"ID\" from venues"))))
    (testing "you can mix quoted and unquoted names"
      (is (= [(explicit-reference :venues :name true)
              (explicit-reference :venues :id true)]
             (refs "select v.\"ID\", v.name from venues v")))
      (is (= [(explicit-reference :venues :name true)
              (explicit-reference :venues :id true)]
             (refs "select v.`ID`, v.name from venues v"))))
    (testing "It will find all relevant columns if query is not specific"
      (is (= [(explicit-reference :checkins :id true)
              (explicit-reference :venues :id true)]
             (refs "select id from venues join checkins"))))
    (testing "But if you are specific - then it's a concrete field"
      (is (= {:explicit #{(mt/id :venues :id)} :implicit nil}
             (q "select v.id from venues v join checkins"))))
    (testing "And wildcards are matching everything"
      (is (= {false 10}
             (frequencies (map :explicit-reference (refs "select * from venues v join checkins")))))
      (is (= {false 6}
             (frequencies (map :explicit-reference (refs "select v.* from venues v join checkins"))))))

    (when (not (contains? #{:snowflake :oracle} driver/*driver*))
      (testing "Analysis does not fail due to keywords that are only reserved in other databases"
        (is (= [(explicit-reference :venues :id true)]
               (refs "select id as final from venues")))))))
