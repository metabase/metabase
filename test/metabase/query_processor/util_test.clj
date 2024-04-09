(ns metabase.query-processor.util-test
  "Tests for various functions that provide information about the query."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase.query-processor.util :as qp.util]))

(set! *warn-on-reflection* true)

(deftest ^:parallel query-without-aggregations-or-limits?-test
  (are [x expected] (= expected
                       (qp.util/query-without-aggregations-or-limits? x))
    {:query {:aggregation [[:count]]}} false
    {:query {}}                        true
    {:query {:aggregation [[:count]]
             :limit       10}}         false
    {:query {:aggregation [[:count]]
             :page        1}}          false))

(defn- query-hash-hex [query]
  (codecs/bytes->hex (qp.util/query-hash query)))

(deftest ^:parallel query-hash-test
  (testing "qp.util/query-hash"
    (testing "should always hash something the same way, every time"
      (is (= "840eb7aa2a9935de63366bacbe9d97e978a859e93dc792a0334de60ed52f8e99"
             (query-hash-hex {:query :abc})))
      (is (= (query-hash-hex {:query :def})
             (query-hash-hex {:query :def}))))))

(deftest ^:parallel ignore-lib-uuids-test
  (letfn [(query []
            {:lib/type :mbql/query
             :database 1
             :stages   [{:lib/type     :mbql.stage/mbql
                         :source-table 1
                         :filters      [[:=
                                         {:lib/uuid (str (random-uuid))}
                                         1
                                         2]]}]})]
    (is (= "1494a478589d855b78e4eaf6bfc9d19f080682f89d0eb110c14af6a740436f2e"
           (query-hash-hex (query))
           (query-hash-hex (query))))))

(deftest ^:parallel query-hash-test-2
  (testing "qp.util/query-hash"
    (testing "different queries should produce different hashes"
      (are [x y] (not= (query-hash-hex x)
                       (query-hash-hex y))
        {:lib/type :type/query, :stages [{:stage-type :abc}]}
        {:lib/type :type/query, :stages [{:stage-type :def}]}

        {:lib/type :type/query, :database 1}
        {:lib/type :type/query, :database 2}

        {:lib/type :type/query, :stages [{:lib/type :mbql.stage/mbql}]}
        {:lib/type :type/query, :stages [{:lib/type :mbql.stage/native}]}

        {:lib/type :type/query, :parameters [1]}
        {:lib/type :type/query, :parameters [2]}

        {:lib/type :type/query, :constraints {:max-rows 1000}}
        {:lib/type :type/query, :constraints nil}))))

(deftest ^:parallel query-hash-test-3
  (testing "qp.util/query-hash"
    (testing "keys that are irrelevant to the query should be ignored"
      (is (= (query-hash-hex {:query :abc, :random :def})
             (query-hash-hex {:query :abc, :random :xyz}))))))

(deftest ^:parallel query-hash-test-4
  (testing "qp.util/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (is (= (query-hash-hex {:query :abc})
             (query-hash-hex {:query :abc, :parameters []})
             (query-hash-hex {:query :abc, :parameters nil}))))))

(deftest ^:parallel query-hash-test-5
  (testing "qp.util/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (testing "...but non-empty ones should"
        (is (not (= (query-hash-hex {:query :abc})
                    (query-hash-hex {:query :abc, :parameters ["ABC"]}))))))))

(deftest ^:parallel query-hash-test-6
  (testing "qp.util/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (testing (str "the presence of a `nil` value for `:constraints` should produce the same hash as not including "
                    "the key at all")
        (is (= (query-hash-hex {:query :abc})
               (query-hash-hex {:query :abc, :constraints nil})
               (query-hash-hex {:query :abc, :constraints {}})))))))

(deftest ^:parallel query-hash-test-7
  (testing "qp.util/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (testing (str "the presence of a `nil` value for `:constraints` should produce the same hash as not including "
                    "the key at all")
        (is (= (query-hash-hex {:query :abc})
               (query-hash-hex {:query :abc, :constraints nil})
               (query-hash-hex {:query :abc, :constraints {}})))))))

(deftest ^:parallel query-hash-test-8
  (testing "qp.util/query-hash"
    (testing "make sure two different native queries have different hashes!"
      (is (not= (query-hash-hex {:database 2
                                 :type     :native
                                 :native   {:query "SELECT pg_sleep(15), 1 AS one"}})
                (query-hash-hex {:database 2
                                 :type     :native
                                 :native   {:query "SELECT pg_sleep(15), 2 AS two"}}))))))

(deftest ^:parallel key-order-should-not-affect-query-hash-test
  (is (= "7e144bc5b43ee850648f353cda978b2911e2f66260ac03c5e1744bce6ca668ff"
         (query-hash-hex {:parameters [{:value 1, :name "parameter"}]})
         (query-hash-hex {:parameters [{:name "parameter", :value 1}]}))))
