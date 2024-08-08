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
  (-> (mt/native-query {:query sql})
      (#'nqa/references-for-native)
      (update-vals
       (partial sort-by (juxt :table :column)))))

(defn- field-refs [sql]
  (:fields (refs sql)))

(defn- missing-reference [table column]
  {:table              (name table)
   :column             (name column)
   :explicit-reference true})

(defn- table-reference [table]
  (let [reference (nqa/table-reference (mt/id) table)]
    ;; sanity-check that this is the right reference
    (assert (= (mt/id table) (:table-id reference)))
    ;; sanity-check the names, whose case depends on the driver
    (assert (= (name table) (u/lower-case-en (:table reference))))
    reference))

(defn- field-reference [table column]
  (let [reference (nqa/field-reference (mt/id) table column)]
    ;; sanity-check that this is the right reference
    (assert (= (mt/id table) (:table-id reference)))
    (assert (= (mt/id table column) (:field-id reference)))
    ;; sanity-check the names, whose case depends on the driver
    (assert (= (name table) (u/lower-case-en (:table reference))))
    (assert (= (name column) (u/lower-case-en (:column reference))))
    ;; tag it
    (assoc reference :explicit-reference true)))

(deftest ^:parallel field-matching-simple-test
  (testing "simple query matches"
    (is (= [(field-reference :venues :id)]
           (field-refs "select id from venues")))))

(deftest ^:parallel field-matching-case-test
  (testing "quotes stop case matching"
    (is (= [(missing-reference :venues :id)]
           (field-refs "select \"id\" from venues")))
    (is (= [(field-reference :venues :id)]
           (field-refs "select \"ID\" from venues"))))
  (testing "unresolved references use case verbatim"
    (is (= [{:column "id", :table "unKnown", :explicit-reference true}]
           (field-refs "select \"id\" from unKnown")))
    (is (= [{:column "ID", :table "unknowN", :explicit-reference true}]
           (field-refs "select ID from unknowN"))))
  (testing "resolved references normalize the case"
    (is (not= "veNUES" (:table (first (field-refs "select id from veNUES")))))
    (is (= "venues" (u/lower-case-en (:table (first (field-refs "select id from veNUES")))))))
  (testing "you can mix quoted and unquoted names"
    (is (= [(field-reference :venues :id)
            (field-reference :venues :name)]
           (field-refs "select v.\"ID\", v.name from venues v")))
    (is (= [(field-reference :venues :id)
            (field-reference :venues :name)]
           (field-refs "select v.`ID`, v.name from venues v")))))

(deftest ^:parallel field-matching-multi-test
  (testing "It will find all relevant columns if query is not specific"
    (is (= [(field-reference :checkins :id)
            (field-reference :venues :id)]
           (field-refs "select id from venues join checkins"))))
  (testing "But if you are specific - then it's a concrete field"
    (is (= [(field-reference :venues :id)]
           (field-refs "select v.id from venues v join checkins"))))
  (testing "And wildcards are matching everything"
    (is (= {false 10}
           (frequencies (map :explicit-reference (field-refs "select * from venues v join checkins")))))
    (is (= {false 6}
           (frequencies (map :explicit-reference (field-refs "select v.* from venues v join checkins")))))))

(deftest ^:parallel field-matching-keywords-test
  (when (not (contains? #{:snowflake :oracle} driver/*driver*))
    (testing "Analysis does not fail due to keywords that are only reserved in other databases"
      (is (= [(field-reference :venues :id)]
             (field-refs "select id as final from venues")))
      (is (= [(missing-reference :venues :final)]
             (field-refs "select final from venues"))))))

(deftest ^:parallel table-without-field-reference-test
  (testing "We track table dependencies even when there are no fields being used"
    (is (= {:tables [(table-reference :venues)]
            :fields []}
           (refs "select count(*) from venues")))))
