(ns metabase.lib-be.hash-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase.lib-be.hash :as lib-be.hash]
   [metabase.lib.test-metadata :as meta]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]))

(defn- query-hash-hex [query]
  (codecs/bytes->hex
   (mu/disable-enforcement
     (lib-be.hash/query-hash (merge {:database Integer/MAX_VALUE} query)))))

(deftest ^:parallel query-hash-test
  (testing "lib-be.hash/query-hash"
    (testing "should always hash something the same way, every time"
      (is (= "c8184360fbcd252e50388361e42a95f25a75f7ea881e18e96cdfab8aebc72dce"
             (query-hash-hex {:query :abc})))
      (is (= (query-hash-hex {:query :def})
             (query-hash-hex {:query :def})))
      (let [q (mt/mbql-query products
                {:aggregation [[:count]]
                 :breakout [$category]
                 :order-by [[:asc [:aggregation 0]]]})]
        (is (= (query-hash-hex q)
               (query-hash-hex q)))))
    (testing "should handle parameter values that mix regular numbers with bigintegers stored as strings"
      (let [q1 (-> (mt/mbql-query orders)
                   (assoc :parameters [{:type :number, :name "p1", :value [1 "9223372036854775808"]}]))
            q2 (-> (mt/mbql-query orders)
                   (assoc :parameters [{:type :number, :name "p1", :value ["9223372036854775808" 1]}]))]
        (is (some? (query-hash-hex q1)))
        (is (= (query-hash-hex q1) (query-hash-hex q2)))))))

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
  (testing "lib-be.hash/query-hash"
    (testing "different queries should produce different hashes"
      (are [x y] (not= (query-hash-hex x)
                       (query-hash-hex y))
        {:lib/type :mbql/query, :stages [{:stage-type :abc}]}
        {:lib/type :mbql/query, :stages [{:stage-type :def}]}

        {:lib/type :mbql/query, :database 1}
        {:lib/type :mbql/query, :database 2}

        {:lib/type :mbql/query, :stages [{:lib/type :mbql.stage/mbql}]}
        {:lib/type :mbql/query, :stages [{:lib/type :mbql.stage/native}]}

        {:lib/type :mbql/query, :parameters [{:value 1}]}
        {:lib/type :mbql/query, :parameters [{:value 2}]}

        {:lib/type :mbql/query, :constraints {:max-rows 1000}}
        {:lib/type :mbql/query, :constraints nil}

        (mt/mbql-query products
          {:aggregation [[:count] [:cum-count]]
           :breakout [$category]
           :order-by [[:asc [:aggregation 0]]]})
        (mt/mbql-query products
          {:aggregation [[:count] [:cum-count]]
           :breakout [$category]
           :order-by [[:asc [:aggregation 1]]]})

        (mt/mbql-query products
          {:aggregation [[:count] [:cum-count]]
           :breakout [$category]
           :order-by [[:asc $created_at]]})
        (mt/mbql-query products
          {:aggregation [[:count] [:cum-count]]
           :breakout [$category]
           :order-by [[:asc $rating]]})))))

(deftest ^:parallel query-hash-test-3
  (testing "lib-be.hash/query-hash"
    (testing "keys that are irrelevant to the query should be ignored"
      (is (= (query-hash-hex {:query :abc, :random :def})
             (query-hash-hex {:query :abc, :random :xyz}))))))

(deftest ^:parallel query-hash-test-4
  (testing "lib-be.hash/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (is (= (query-hash-hex {:query :abc})
             (query-hash-hex {:query :abc, :parameters []})
             (query-hash-hex {:query :abc, :parameters nil}))))))

(deftest ^:parallel query-hash-test-5
  (testing "lib-be.hash/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (testing "...but non-empty ones should"
        (is (not (= (query-hash-hex {:query :abc})
                    (query-hash-hex {:query :abc, :parameters ["ABC"]}))))))))

(deftest ^:parallel query-hash-test-6
  (testing "lib-be.hash/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (testing (str "the presence of a `nil` value for `:constraints` should produce the same hash as not including "
                    "the key at all")
        (is (= (query-hash-hex {:query :abc})
               (query-hash-hex {:query :abc, :constraints nil})
               (query-hash-hex {:query :abc, :constraints {}})))))))

(deftest ^:parallel query-hash-test-7
  (testing "lib-be.hash/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (testing (str "the presence of a `nil` value for `:constraints` should produce the same hash as not including "
                    "the key at all")
        (is (= (query-hash-hex {:query :abc})
               (query-hash-hex {:query :abc, :constraints nil})
               (query-hash-hex {:query :abc, :constraints {}})))))))

(deftest ^:parallel query-hash-test-8
  (testing "lib-be.hash/query-hash"
    (testing "make sure two different native queries have different hashes!"
      (is (not= (query-hash-hex {:database (mt/id)
                                 :type     :native
                                 :native   {:query "SELECT pg_sleep(15), 1 AS one"}})
                (query-hash-hex {:database (mt/id)
                                 :type     :native
                                 :native   {:query "SELECT pg_sleep(15), 2 AS two"}}))))))

(deftest ^:parallel key-order-should-not-affect-query-hash-test
  (is (= "69732035b7a82a21d30f97d87a28e3b1701c9df7e88d0637708283ced8a909f1"
         (query-hash-hex {:parameters [{:value 1, :name "parameter"}]})
         (query-hash-hex {:parameters [{:name "parameter", :value 1}]}))))

(deftest ^:parallel parameter-order-should-not-affect-query-hash-test
  (is (= "4a577dcd52dbe5a059d3bbe9eff752cc6a6b5eb2e3d5a56115dc37412116ebe1"
         (query-hash-hex {:parameters [{:name "parameter", :value ["a" "b"]}]})
         (query-hash-hex {:parameters [{:name "parameter", :value ["b" "a"]}]})))
  (is (= "98d1c4bf0dbe9b2c7d9997a5266bb37ca7fd09d60638b81d96292278a594c2e4"
         (query-hash-hex {:parameters [{:name "parameter", :value [1 2]}]})
         (query-hash-hex {:parameters [{:name "parameter", :value [2 1]}]}))))

(deftest ^:parallel ignore-nonsense-when-hashing-queries-test
  ;; these two queries differ in a few ways:
  ;;
  ;; - `q1` has `:metabase.lib.query/transformation-added-base-type` while `q2` does not
  ;; - `q1` has empty `:constraints`
  ;; - the order or parameters is flipped between the two queries
  ;; - the order of parameter :value is filled for parameter "A"
  (let [q1 {:lib/type               :mbql/query
            :stages                 [{:lib/type     :mbql.stage/mbql
                                      :fields       [[:field
                                                      {:lib/uuid                                          "40dfd708-6c4e-4ff1-ae9e-c3863ae2fe46"
                                                       :metabase.lib.query/transformation-added-base-type true
                                                       :base-type                                         :type/BigInteger
                                                       :effective-type                                    :type/BigInteger}
                                                      89952]
                                                     [:field
                                                      {:lib/uuid                                          "719f9e44-eb66-4488-be9b-62078f2a677c"
                                                       :metabase.lib.query/transformation-added-base-type true
                                                       :base-type                                         :type/Text
                                                       :effective-type                                    :type/Text}
                                                      89953]]
                                      :source-table 14303}]
            :database               2378
            :parameters             [{:value [1 2], :target [:dimension [:field 89952 nil]], :id "a", :type :id}
                                     {:value [1], :target [:dimension [:field 89952 nil]], :id "b", :type :id}]
            :lib.convert/converted? true
            :lib/metadata           meta/metadata-provider
            :constraints            {}}
        q2 {:constraints    nil
            :lib/type       :mbql/query
            :lib/metadata   meta/metadata-provider
            :stages         [{:fields       [[:field
                                              {:base-type      :type/BigInteger
                                               :lib/uuid       "373849ed-7038-4071-b038-db3dd7039181"
                                               :effective-type :type/BigInteger}
                                              89952]
                                             [:field
                                              {:base-type :type/Text, :lib/uuid "b007dc3f-b12e-459e-89dc-4706580fed0a", :effective-type :type/Text}
                                              89953]]
                              :lib/type     :mbql.stage/mbql
                              :source-table 14303}]
            :middleware     {:userland-query? true}
            :cache-strategy nil
            :info           {:executed-by nil, :context :action, :action-id 1735}
            :database       2378
            :parameters     [{:value [1], :target [:dimension [:field 89952 nil]], :id "b", :type :id}
                             {:value [2 1], :target [:dimension [:field 89952 nil]], :id "a", :type :id}]}]
    (is (= (query-hash-hex q1)
           (query-hash-hex q2)))))

(deftest ^:parallel normalize-before-hashing-test
  (testing "Empty :constraints should get normalized out before calculating query hash"
    (is (= (query-hash-hex {:constraints nil
                            :lib/type    :mbql/query
                            :database    Integer/MAX_VALUE
                            :stages      [{:lib/type     :mbql.stage/mbql
                                           :source-table 14303}]})
           (query-hash-hex {:constraints {}
                            :lib/type    :mbql/query
                            :database    Integer/MAX_VALUE
                            :stages      [{:lib/type     :mbql.stage/mbql
                                           :source-table 14303}]})
           (query-hash-hex {:lib/type :mbql/query
                            :database Integer/MAX_VALUE
                            :stages   [{:lib/type     :mbql.stage/mbql
                                        :source-table 14303}]})))))
