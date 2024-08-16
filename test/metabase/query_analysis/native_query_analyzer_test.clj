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
       (partial sort-by (juxt :schema :table :column)))))

(defn- field-refs [sql]
  (:fields (refs sql)))

(defn- table-refs [sql]
  (:tables (refs sql)))

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

(defn- missing-field-reference
  ([table column]
   (missing-field-reference nil table column))
  ([schema table column]
   (merge
    {:schema             (some-> schema name)
     :table              (some-> table name)
     :column             (name column)
     :explicit-reference true}
    ;; the table might be resolved...
    (nqa/table-reference (mt/id) schema table))))

(deftest ^:parallel field-matching-simple-test
  (testing "simple query matches"
    (let [sql "select id from venues"]
      (is (= [(field-reference :venues :id)] (field-refs sql)))
      (is (= [(table-reference :venues)] (table-refs sql))))))

(deftest ^:parallel field-matching-schema-test
  (testing "real existent schema"
    (let [sql "select id from public.venues"]
      (is (= [(field-reference :venues :id)] (field-refs sql)))
      (is (= [(table-reference :venues)] (table-refs sql)))))
  (testing "non-existent schema"
    (let [sql "select id from blah.venues"]
      (is (= [(missing-field-reference :blah :venues :id)] (field-refs sql)))
      (is (= [{:schema "blah", :table "venues"}] (table-refs sql))))))

(deftest ^:parallel field-matching-case-test
  (testing "quotes stop case matching"
    (is (= [(missing-field-reference :venues :id)] (field-refs "select \"id\" from venues")))
    (is (= [(field-reference :venues :id)] (field-refs "select \"ID\" from venues"))))

  (testing "unresolved references use case verbatim"
    (let [sql "select \"id\" from unKnown"]
      (is (= [{:table "unKnown", :column "id", :explicit-reference true}] (field-refs sql)))
      (is (= [{:table "unKnown"}] (table-refs sql))))
    (let [sql "select ID from unknowN"]
      (is (= [{:table "unknowN", :column "ID", :explicit-reference true}] (field-refs sql)))
      (is (= [{:table "unknowN"}] (table-refs sql)))))

  (testing "resolved references normalize the case"
    (let [sql        "select id from veNUES"]
      (doseq [ref (concat (field-refs sql) (table-refs sql))
              :let [table-name (:table ref)]]
        (is (not= "veNUES" table-name))
        (is (= "venues" (u/lower-case-en table-name))))))

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

(deftest ^:parallel pseudo-table-fields-tests
  (testing "When macaw returns an unknown field without a table, we keep it even if it could be phantom."
    ;; At the time of writing this test, Macaw would (incorrectly) return "week" as an ambiguous source column.
    (is (= [{                      :column "week",       :explicit-reference true}
            {:table "source_table" :column "flobbed_at", :explicit-reference true}]
           (field-refs "WITH date_series AS (
                       SELECT generate_series('2016-01-01'::date, '2024-09-14'::date, '1 week') AS week
                     )
                     SELECT week, COUNT(*) as count
                     FROM date_series
                     JOIN source_table
                       ON flobbed_at < week
                     GROUP BY week
                     ORDER BY week")))))

(deftest ^:parallel field-matching-keywords-test
  (when (not (contains? #{:snowflake :oracle} driver/*driver*))
    (testing "Analysis does not fail due to keywords that are only reserved in other databases"
      (is (= [(field-reference :venues :id)]
             (field-refs "select id as final from venues")))
      (is (= [(missing-field-reference :venues :final)]
             (field-refs "select final from venues"))))))

(deftest ^:parallel table-without-field-reference-test
  (testing "We track table dependencies even when there are no fields being used"
    (is (= {:tables [(table-reference :venues)]
            :fields []}
           (refs "select count(*) from venues")))))

(deftest fill-missing-table-ids-hack-test
  (testing "Where applicable, we insert the appropriate schemas and table-ids"
    (is (=
         [{:schema 4    :table "t1" :table-id 6 :column "a"}
          {:schema 1    :table "t2" :table-id 3 :column "b"}
          {:schema 8    :table "t2" :table-id 9 :column "b"}
          {:schema 7    :table "t2"             :column "c"}]
         (#'nqa/fill-missing-table-ids-hack
          ;; tables
          [{:schema 1   :table "t2" :table-id 3}
           {:schema 8   :table "t2" :table-id 9}]
          ;; columns
          [{:schema 4   :table "t1" :table-id 6 :column "a"}
           {:schema nil :table "t2"             :column "b"}
           {:schema 7   :table "t2"             :column "c"}])))))
