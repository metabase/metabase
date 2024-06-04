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
              (#'query-analyzer/field-ids-for-sql (mt/native-query {:query sql})))]
      (testing "simple query matches"
        (is (= {:direct #{(mt/id :venues :id)} :indirect nil}
               (q "select id from venues"))))
      (testing "quotes stop case matching"
        ;; MySQL does case-insensitive string comparisons by default; quoting does not make it consider case
        ;; in field names either, so it's consistent behavior
        (if (= (mdb.connection/db-type) :mysql)
          (is (= {:direct #{(mt/id :venues :id)} :indirect nil}
                 (q "select \"id\" from venues")))
          (is (= {:direct nil :indirect nil}
                 (q "select \"id\" from venues"))))
        (is (= {:direct #{(mt/id :venues :id)} :indirect nil}
               (q "select \"ID\" from venues"))))
      (testing "you can mix quoted and unquoted names"
        (is (= {:direct #{(mt/id :venues :id) (mt/id :venues :name)} :indirect nil}
               (q "select v.\"ID\", v.name from venues")))
        (is (= {:direct #{(mt/id :venues :id) (mt/id :venues :name)} :indirect nil}
               (q "select v.`ID`, v.name from venues"))))
      (testing "It will find all relevant columns if query is not specific"
        (is (= {:direct #{(mt/id :venues :id) (mt/id :checkins :id)} :indirect nil}
               (q "select id from venues join checkins"))))
      (testing "But if you are specific - then it's a concrete field"
        (is (= {:direct #{(mt/id :venues :id)} :indirect nil}
               (q "select v.id from venues v join checkins"))))
      (testing "And wildcards are matching everything"
        (is (= 10
               (-> (q "select * from venues v join checkins")
                   :indirect count)))
        (is (= 6
               (-> (q "select v.* from venues v join checkins")
                   :indirect count)))))))

(deftest ^:parallel driver-support-test
  (testing "We only support parsing queries for certain drivers"
    (doseq [supported-driver #{:h2 :mysql :postgres :redshift :sqlite :sqlserver}]
      (is (driver/database-supports? supported-driver :native-parsing nil)))
    (doseq [unsupported-driver #{:mongo :snowflake}]
      (is (not (driver/database-supports? unsupported-driver :native-parsing nil))))))
