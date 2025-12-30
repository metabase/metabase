(ns metabase.lib-be.hash-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase.lib-be.hash :as lib-be.hash]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli :as mu]))

(use-fixtures :once (fixtures/initialize :db))

(defn- query-hash-hex [query]
  (codecs/bytes->hex
   (mu/disable-enforcement
     (lib-be.hash/query-hash (merge {:database Integer/MAX_VALUE}
                                    (cond
                                      (:query query)  {:type :query}
                                      (:native query) {:type :native}
                                      :else           {:lib/type :mbql/query})
                                    query)))))

(deftest ^:parallel query-hash-test
  (testing "lib-be.hash/query-hash"
    (testing "should always hash something the same way, every time"
      (is (= "171fc4cb48d83f4a32e0851ec301426a14c7554ea1b0c81976c7f7b55399c572"
             (query-hash-hex {:query {:source-table 1}})))
      (is (= (query-hash-hex {:query {:source-table 2}})
             (query-hash-hex {:query {:source-table 2}})))
      (let [q (mt/mbql-query products
                {:aggregation [[:count]]
                 :breakout [$category]
                 :order-by [[:asc [:aggregation 0]]]})]
        (is (= (query-hash-hex q)
               (query-hash-hex q)))))))

(deftest ^:parallel query-hash-test-1b
  (testing "lib-be.hash/query-hash"
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
      (is (= (query-hash-hex {:query {:source-table 1}, :random :def})
             (query-hash-hex {:query {:source-table 1}, :random :xyz}))))))

(deftest ^:parallel query-hash-test-4
  (testing "lib-be.hash/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (is (= (query-hash-hex {:query {:source-table 1}})
             (query-hash-hex {:query {:source-table 1}, :parameters []})
             (query-hash-hex {:query {:source-table 1}, :parameters nil}))))))

(deftest ^:parallel query-hash-test-5
  (testing "lib-be.hash/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (testing "...but non-empty ones should"
        (is (not (= (query-hash-hex {:query {:source-table 1}})
                    (query-hash-hex {:query {:source-table 1}, :parameters [{:id "ABC"}]}))))))))

(deftest ^:parallel query-hash-test-6
  (testing "lib-be.hash/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (testing (str "the presence of a `nil` value for `:constraints` should produce the same hash as not including "
                    "the key at all")
        (is (= (query-hash-hex {:query {:source-table 1}})
               (query-hash-hex {:query {:source-table 1}, :constraints nil})
               (query-hash-hex {:query {:source-table 1}, :constraints {}})))))))

(deftest ^:parallel query-hash-test-7
  (testing "lib-be.hash/query-hash"
    (testing "empty `:parameters` lists should not affect the hash"
      (testing (str "the presence of a `nil` value for `:constraints` should produce the same hash as not including "
                    "the key at all")
        (is (= (query-hash-hex {:query {:source-table 1}})
               (query-hash-hex {:query {:source-table 1}, :constraints nil})
               (query-hash-hex {:query {:source-table 1}, :constraints {}})))))))

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
  (is (= "915d52e11063543602921c37e792e60ec5667846a20f517a1080ad64600a92e6"
         (query-hash-hex {:parameters [{:value 1, :name "parameter"}]})
         (query-hash-hex {:parameters [{:name "parameter", :value 1}]}))))

(deftest ^:parallel parameter-order-should-not-affect-query-hash-test
  (is (= "6e569604fa10aed0cb3b4625991e9f07ba264462ea72fe6251bb2060709af9e0"
         (query-hash-hex {:parameters [{:name "parameter", :value ["a" "b"]}]})
         (query-hash-hex {:parameters [{:name "parameter", :value ["b" "a"]}]})))
  (is (= "5cf17924f3e572edbad58dfd8a6f78953d25d234ed5bc23d98d922b48e9bfa61"
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

(defn- query-with-aggregation-order-by
  "Build a query with an aggregation and order-by referencing that aggregation.
   Each call generates fresh UUIDs."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/aggregate (lib/count))
      (as-> $q (lib/order-by $q (lib/aggregation-ref $q 0)))))

(defn- query-with-aggregation-expression
  "Build a query with aggregations and an expression that references them.
   Each call generates fresh UUIDs."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/aggregate (lib/count))
      (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
      (as-> $q
          ;; Add an aggregation expression that references the first two aggregations
            (lib/aggregate $q (lib/+ (lib/aggregation-ref $q 0)
                                     (lib/aggregation-ref $q 1))))))

(defn- query-with-aggregation-in-breakout
  "Try to build a query with an aggregation ref in breakout."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/aggregate (lib/count))
      (as-> $q (lib/breakout $q (lib/aggregation-ref $q 0)))))

(defn- query-with-aggregation-in-filter
  "Try to build a query with an aggregation ref in a filter."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/aggregate (lib/count))
      (as-> $q (lib/filter $q (lib/> (lib/aggregation-ref $q 0) 5)))))

(defn- query-with-aggregation-in-fields
  "Try to build a query with an aggregation ref in fields."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/aggregate (lib/count))
      (as-> $q (lib/with-fields $q [(lib/aggregation-ref $q 0)]))))

(defn- query-with-aggregation-in-join-condition
  "Try to build a query with an aggregation ref in a join condition."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/aggregate (lib/count))
      (as-> $q
            (lib/join $q (lib/join-clause (meta/table-metadata :categories)
                                          [(lib/= (lib/aggregation-ref $q 0)
                                                  (meta/field-metadata :categories :id))])))))

(defn- query-with-simple-join
  "Build a query with a simple join (no aggregation refs)."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/join (lib/join-clause (meta/table-metadata :categories)
                                 [(lib/= (meta/field-metadata :venues :category-id)
                                         (meta/field-metadata :categories :id))]))))

(defn- query-with-join-subquery-aggregation
  "Build a query with a join that has a subquery with aggregations and order-by.
   This tests that aggregation refs in join stages are properly handled by the encoder."
  []
  (let [subquery (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
                     (lib/aggregate (lib/count))
                     (lib/breakout (meta/field-metadata :categories :name))
                     (as-> $q (lib/order-by $q (lib/aggregation-ref $q 0))))]
    (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
        (lib/join (lib/join-clause subquery
                                   [(lib/= (meta/field-metadata :venues :name)
                                           (meta/field-metadata :categories :name))])))))

(deftest ^:parallel mbql5-aggregation-ref-uuid-test
  (testing "MBQL 5 queries with aggregation references should hash the same regardless of UUID values"
    ;; In MBQL 5, aggregation refs look like [:aggregation {:lib/uuid "ref-uuid"} "agg-uuid"]
    ;; where "agg-uuid" is the :lib/uuid of the aggregation being referenced.
    ;; Two semantically identical queries created at different times will have different UUIDs,
    ;; but should produce the same hash.
    (are [query-fn] (= (query-hash-hex (query-fn))
                       (query-hash-hex (query-fn)))
      query-with-aggregation-order-by
      query-with-aggregation-expression
      ;; The following are nonsensical but allowed by the schema
      query-with-aggregation-in-breakout
      query-with-aggregation-in-filter
      query-with-aggregation-in-fields
      query-with-aggregation-in-join-condition
      query-with-simple-join
      query-with-join-subquery-aggregation)
    (testing "ordering by different aggregations should produce different hashes"
      (letfn [(query-order-by-aggregation [agg-index]
                (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/aggregate (lib/count))
                    (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
                    (as-> $q (lib/order-by $q (lib/aggregation-ref $q agg-index)))))]
        (is (not= (query-hash-hex (query-order-by-aggregation 0))
                  (query-hash-hex (query-order-by-aggregation 1))))))))

;; Test cases for :any typed schema positions that can contain :lib/uuid
;; These test the issue where Malli encoders don't apply to values typed as :any

(defn- query-with-arithmetic-expression
  "Build a query with an arithmetic expression like (+ field1 field2).
   The :+ clause schema uses [:+ {:min 2} :any] for its args, so nested
   field refs with :lib/uuid won't get their options maps encoded."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/expression "sum-fields" (lib/+ (meta/field-metadata :venues :price)
                                          (meta/field-metadata :venues :id)))))

(defn- query-with-nested-arithmetic
  "Build a query with nested arithmetic like (+ (* field1 2) field2).
   Tests that deeply nested clauses with :lib/uuid are handled."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/expression "nested" (lib/+ (lib/* (meta/field-metadata :venues :price) 2)
                                      (meta/field-metadata :venues :id)))))

(defn- query-with-case-expression
  "Build a query with a case expression containing field refs.
   Tests that case/if expressions properly strip :lib/uuid from nested clauses."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/expression "case-expr"
                      (lib/case [[(lib/> (meta/field-metadata :venues :price) 5)
                                  (meta/field-metadata :venues :id)]]
                        (meta/field-metadata :venues :price)))))

(defn- query-with-coalesce-expression
  "Build a query with a coalesce expression containing field refs.
   Tests that coalesce expressions properly strip :lib/uuid from nested clauses."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/expression "coalesce-expr"
                      (lib/coalesce (meta/field-metadata :venues :price)
                                    (meta/field-metadata :venues :id)))))

(defn- query-with-concat-expression
  "Build a query with a concat expression.
   Tests string expressions with :any typed args."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/expression "concat-expr"
                      (lib/concat (meta/field-metadata :venues :name)
                                  (meta/field-metadata :venues :name)))))

(deftest ^:parallel any-typed-schema-positions-test
  (testing "Expressions using :any typed schema positions should hash consistently"
    ;; The :+ clause schema uses [:+ {:min 2} :any] for its args, so nested
    ;; field refs with :lib/uuid need post-processing to strip UUIDs.
    (are [query-fn] (= (query-hash-hex (query-fn))
                       (query-hash-hex (query-fn)))
      query-with-arithmetic-expression
      query-with-nested-arithmetic
      query-with-case-expression
      query-with-coalesce-expression
      query-with-concat-expression)))

(deftest ^:parallel maps-under-any-schema-are-sorted-test
  (testing "Maps nested under :any typed schema positions should be sorted for consistent hashing"
    (testing "field ref options inside :+ args (uses [:+ {:min 2} :any])"
      ;; The :+ clause schema uses [:+ {:min 2} :any] for its args, so the options
      ;; map inside a :field ref won't be sorted by the Malli encoder.
      ;; We use array-map to create maps with guaranteed different key orders.
      (let [query-1 {:lib/type :mbql/query
                     :database 1
                     :stages   [{:lib/type     :mbql.stage/mbql
                                 :source-table 1
                                 :expressions  [[:+ (array-map :lib/uuid "expr-uuid"
                                                               :lib/expression-name "sum")
                                                 [:field (array-map :a 1 :b 2) 100]
                                                 [:field (array-map :c 3 :d 4) 200]]]}]}
            query-2 {:lib/type :mbql/query
                     :database 1
                     :stages   [{:lib/type     :mbql.stage/mbql
                                 :source-table 1
                                 :expressions  [[:+ (array-map :lib/expression-name "sum"
                                                               :lib/uuid "expr-uuid")
                                                 [:field (array-map :b 2 :a 1) 100]
                                                 [:field (array-map :d 4 :c 3) 200]]]}]}]
        (is (= (query-hash-hex query-1)
               (query-hash-hex query-2))
            "Maps with same content but different key order should hash the same")))))
