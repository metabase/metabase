(ns metabase.native-query-analyzer-test
  (:require
   [clojure.test :refer :all]
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

(deftest ^:parallel field-matching-test
  (binding [query-analyzer/*parse-queries-in-test?* true]
    (let [q (fn [sql]
              (#'query-analyzer/field-ids-for-sql (mt/native-query {:query sql})))]
      (mt/$ids nil
        (testing "simple query matches"
          (is (= {:direct #{%venues.id} :indirect nil}
                 (q "select id from venues"))))
        (testing "quotes stop case matching"
          (is (= {:direct nil :indirect nil}
                 (q "select \"id\" from venues")))
          (is (= {:direct #{%venues.id} :indirect nil}
                 (q "select \"ID\" from venues"))))
        (testing "you can mix quoted and unquoted names"
          (is (= {:direct #{%venues.id %venues.name} :indirect nil}
                 (q "select v.\"ID\", v.name from venues"))))
        (testing "It will find all relevant columns if query is not specific"
          (is (= {:direct #{%venues.id %checkins.id} :indirect nil}
                 (q "select id from venues join checkins"))))
        (testing "But if you are specific - then it's a concrete field"
          (is (= {:direct #{%venues.id} :indirect nil}
                 (q "select v.id from venues v join checkins"))))
        (testing "And wildcards are matching everything"
          (is (= 10
                 (-> (q "select * from venues v join checkins")
                     :indirect count)))
          (is (= 6
                 (-> (q "select v.* from venues v join checkins")
                     :indirect count))))))))
