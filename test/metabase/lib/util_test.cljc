(ns metabase.lib.util-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel pipeline-test
  (are [query expected] (=? expected
                            (lib.util/pipeline query))
    ;; MBQL query
    {:database 1
     :type     :query
     :query    {:source-query {:source-query {:source-table 2}}
                :filter       [:=
                               {:lib/uuid "a1898aa6-4928-4e97-837d-e440ce21085e"}
                               [:field 3 {:lib/uuid "1cb2a996-6ba1-45fb-8101-63dc3105c311"}]
                               "wow"]}}
    {:database 1
     :stages   [{:lib/type     :mbql.stage/mbql
                 :source-table 2}
                {:lib/type :mbql.stage/mbql}
                {:lib/type :mbql.stage/mbql
                 :filters  [[:=
                             {:lib/uuid "a1898aa6-4928-4e97-837d-e440ce21085e"}
                             [:field 3 {:lib/uuid "1cb2a996-6ba1-45fb-8101-63dc3105c311"}]
                             "wow"]]}]}

    ;; native query
    {:database 1
     :type     :native
     :native   {:query "SELECT * FROM VENUES;"}}
    {:database 1
     :stages   [{:lib/type :mbql.stage/native
                 :native   "SELECT * FROM VENUES;"}]}

    ;; already a pipeline: nothing to do
    {:database 1
     :lib/type :mbql/query
     :stages   [{:lib/type    :mbql.stage/native
                 :lib/options {:lib/uuid "ef87e113-7436-41dd-9f78-3232c6778436"}
                 :native      "SELECT * FROM VENUES;"}]}
    {:database 1
     :lib/type :mbql/query
     :stages   [{:lib/type :mbql.stage/native
                 :native   "SELECT * FROM VENUES;"}]}))

(deftest ^:parallel pipeline-joins-test
  ;; this isn't meant to be 100% correct pMBQL -- `->pipeline` is just supposed to put stuff in the generally correct
  ;; shape, just to make sure we have `:stages` and stuff looking the way they should. [[metabase.lib.convert]] uses
  ;; this as part of what it does
  (is (=? {:lib/type :mbql/query
           :stages   [{:lib/type    :mbql.stage/mbql
                       :fields      [[:field (meta/id :categories :name) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                       :joins       [{:lib/type    :mbql/join
                                      :lib/options {:lib/uuid string?}
                                      :alias       "CATEGORIES__via__CATEGORY_ID"
                                      :conditions  [[:=
                                                     [:field (meta/id :venues :category-id)]
                                                     [:field (meta/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]]
                                      :strategy    :left-join
                                      :fk-field-id (meta/id :venues :category-id)
                                      :stages      [{:lib/type     :mbql.stage/mbql
                                                     :source-table (meta/id :venues)}]}]}]
           :database (meta/id)}
          (lib.util/pipeline
           {:database (meta/id)
            :type     :query
            :query    {:fields [[:field (meta/id :categories :name) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                       :joins  [{:alias        "CATEGORIES__via__CATEGORY_ID"
                                 :source-table (meta/id :venues)
                                 :condition    [:=
                                                [:field (meta/id :venues :category-id)]
                                                [:field (meta/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                                 :strategy     :left-join
                                 :fk-field-id  (meta/id :venues :category-id)}]}}))))

(deftest ^:parallel pipeline-source-metadata-test
  (testing "`:source-metadata` should get moved to the previous stage as `:lib/stage-metadata`"
    (is (=? {:lib/type :mbql/query
             :stages   [{:lib/type           :mbql.stage/mbql
                         :source-table       (meta/id :venues)
                         :lib/stage-metadata {:lib/type :metadata/results
                                              :columns  [(meta/field-metadata :venues :id)]}}
                        {:lib/type :mbql.stage/mbql}]}
            (lib.util/pipeline
             {:database (meta/id)
              :type     :query
              :query    {:source-query    {:source-table (meta/id :venues)}
                         :source-metadata [(meta/field-metadata :venues :id)]}})))))

(deftest ^:parallel query-stage-test
  (is (=? {:lib/type     :mbql.stage/mbql
           :source-table 1}
          (lib.util/query-stage {:database 1
                                 :type     :query
                                 :query    {:source-table 1}}
                                0)))
  (are [index expected] (=? expected
                            (lib.util/query-stage {:database 1
                                                   :type     :query
                                                   :query    {:source-query {:source-table 1}}}
                                                  index))
    0 {:lib/type     :mbql.stage/mbql
       :source-table 1}
    1 {:lib/type :mbql.stage/mbql})
  (testing "negative index"
    (are [index expected] (=? expected
                              (lib.util/query-stage {:database 1
                                                     :type     :query
                                                     :query    {:source-query {:source-table 1}}}
                                                    index))
      -1 {:lib/type :mbql.stage/mbql}
      -2 {:lib/type     :mbql.stage/mbql
          :source-table 1}))
  (testing "Out of bounds"
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"Stage 2 does not exist"
         (lib.util/query-stage {:database 1
                                :type     :query
                                :query    {:source-query {:source-table 1}}}
                               2)))
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"Stage -3 does not exist"
         (lib.util/query-stage {:database 1
                                :type     :query
                                :query    {:source-query {:source-table 1}}}
                               -3)))))

(deftest ^:parallel update-query-stage-test
  (is (=? {:database 1
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 1
                       :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}]}
          (lib.util/update-query-stage {:database 1
                                        :type     :query
                                        :query    {:source-table 1}}
                                       0
                                       update
                                       :aggregation
                                       conj
                                       [:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}])))
  (are [stage expected] (=? expected
                            (lib.util/update-query-stage {:database 1
                                                          :type     :query
                                                          :query    {:source-query {:source-table 1}}}
                                                         stage
                                                         update
                                                         :aggregation
                                                         conj
                                                         [:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]))
    0 {:database 1
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 1
                   :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}
                  {:lib/type :mbql.stage/mbql}]}
    1 {:database 1
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 1}
                  {:lib/type    :mbql.stage/mbql
                   :aggregation [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}]}
    -1 {:database 1
        :stages   [{:lib/type     :mbql.stage/mbql
                    :source-table 1}
                   {:lib/type    :mbql.stage/mbql
                    :aggregation [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}]})
  (testing "out of bounds"
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"Stage 2 does not exist"
         (lib.util/update-query-stage {:database 1
                                       :type     :query
                                       :query    {:source-query {:source-table 1}}}
                                      2
                                      update
                                      :aggregation
                                      conj
                                      [:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}])))))

(deftest ^:parallel ensure-mbql-final-stage-test
  (is (=? {:database 1
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 2}]}
          (lib.util/ensure-mbql-final-stage {:database 1
                                             :type     :query
                                             :query    {:source-table 2}})))
  (is (=? {:database 1
           :stages   [{:lib/type :mbql.stage/native
                       :native   "SELECT * FROM venues;"}
                      {:lib/type :mbql.stage/mbql}]}
          (lib.util/ensure-mbql-final-stage {:database 1
                                             :type     :native
                                             :native   {:query "SELECT * FROM venues;"}}))))

(deftest ^:parallel join-strings-with-conjunction-test
  (are [coll expected] (= expected
                          (lib.util/join-strings-with-conjunction "and" coll))
    []                nil
    ["a"]             "a"
    ["a" "b"]         "a and b"
    ["a" "b" "c"]     "a, b, and c"
    ["a" "b" "c" "d"] "a, b, c, and d"))

(deftest ^:parallel crc32-checksum-test
  (are [s checksum] (= checksum
                       (#'lib.util/crc32-checksum s))
    "YMRZFRTHUBOUZHPTZGPD" "2694651f"
    "MEBRXTJEPWOJJXVZIPDA" "048132cb"
    "UIOJOTPGUIROVRJYAFPO" "0085cacb"
    "UCVEWTGNBDANGMZPGNQC" "000e32a0"
    "ZAFVKSVXQKJNGANBQZMX" "0000d5b8"
    "NCTFDMQNUEQLJUMAGSYG" "000000ea"
    "YHQJXDIXGGQTSARGOQZZ" "000000c1"
    "0601246074"           "00000001"
    "2915035893"           "00000000"))

(deftest ^:parallel truncate-alias-test
  (letfn [(truncate-alias [s max-bytes]
            (let [truncated (lib.util/truncate-alias s max-bytes)]
              (is (<= (u/string-byte-count truncated) max-bytes))
              truncated))]
    (doseq [[s max-bytes->expected] { ;; 20-character plain ASCII string
                                     "01234567890123456789"
                                     {12 "012_fc89bad5"
                                      15 "012345_fc89bad5"
                                      20 "01234567890123456789"}

                                     ;; two strings that only differ after the point they get truncated
                                     "0123456789abcde" {12 "012_1629bb92"}
                                     "0123456789abcdE" {12 "012_2d479b5a"}

                                     ;; Unicode string: 14 characters, 42 bytes
                                     "가나다라마바사아자차카타파하"
                                     {12 "가_b9c95392"
                                      13 "가_b9c95392"
                                      14 "가_b9c95392"
                                      15 "가나_b9c95392"
                                      20 "가나다_b9c95392"
                                      30 "가나다라마바사_b9c95392"
                                      40 "가나다라마바사아자차_b9c95392"
                                      50 "가나다라마바사아자차카타파하"}

                                     ;; Mixed string: 17 characters, 33 bytes
                                     "a가b나c다d라e마f바g사h아i"
                                     {12 "a_99a0fe0c"
                                      13 "a가_99a0fe0c"
                                      14 "a가b_99a0fe0c"
                                      15 "a가b_99a0fe0c"
                                      20 "a가b나c_99a0fe0c"
                                      30 "a가b나c다d라e마f_99a0fe0c"
                                      40 "a가b나c다d라e마f바g사h아i"}}
            [max-bytes expected] max-bytes->expected]
      (testing (pr-str (list `lib.util/truncate-alias s max-bytes))
        (is (= expected
               (truncate-alias s max-bytes)))))))

(deftest ^:parallel unique-name-generator-test
  (let [unique-name-fn (lib.util/unique-name-generator meta/metadata-provider)]
    (is (= "wow"
           (unique-name-fn "wow")))
    (is (= "wow_2"
           (unique-name-fn "wow")))
    (testing "should be case-insensitive distinct"
      (is (= "WOW_3"
             (unique-name-fn "WOW"))))
    (testing "should truncate long names"
      (is (= "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY_2dc86ef1"
             (unique-name-fn "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")))
      (is (= "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY_fc11882d"
             (unique-name-fn "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))))))

(deftest ^:parallel unique-name-generator-idempotence-test
  (testing "idempotence (2-arity calls to generated function)"
    (let [unique-name (lib.util/unique-name-generator meta/metadata-provider)]
      (is (= ["A" "B" "A" "A_2" "A_2"]
             [(unique-name :x "A")
              (unique-name :x "B")
              (unique-name :x "A")
              (unique-name :y "A")
              (unique-name :y "A")])))))

(deftest ^:parallel unique-name-use-database-methods-test
  (testing "Should use database :lib/methods"
    (let [metadata-provider (lib.tu/merged-mock-metadata-provider
                             meta/metadata-provider
                             {:database {:lib/methods {:escape-alias #(lib.util/truncate-alias % 15)}}})
          unique-name        (lib.util/unique-name-generator metadata-provider)]
      (is (= "catego_ef520013"
             (unique-name "categories__via__category_id__name")))
      (is (= "catego_ec940c72"
             (unique-name "categories__via__category_id__name"))))))

(deftest ^:parallel strip-id-test
  (are [exp in] (= exp (lib.util/strip-id in))
    "foo"            "foo"
    "Fancy Name"     "Fancy Name"
    "Customer"       "Customer ID"
    "Customer"       "Customer id"
    "some id number" "some id number"))

(deftest ^:parallel original-isa?
  (are [exp typ] (lib.util/original-isa? exp typ)
    (lib/ref (meta/field-metadata :products :id))
    :type/Number

    (lib/ref (meta/field-metadata :products :created-at))
    :type/Temporal

    (-> (meta/field-metadata :products :created-at)
        (lib/with-temporal-bucket :day-of-week)
        lib/ref)
    :type/Temporal

    (-> (meta/field-metadata :products :created-at)
        lib/ref
        (lib/with-temporal-bucket :day-of-week))
    :type/Temporal))

(deftest ^:parallel top-level-expression-clause-do-not-wrap-values-test
  (testing "named-expression-clause should not wrap a :value clause in another :value clause"
    (is (=? [:value {:semantic-type :type/Country, :base-type :type/Text, :lib/expression-name "Country"}
             "United States"]
            (lib.util/top-level-expression-clause
             [:value {:semantic-type :type/Country, :base-type :type/Text, :lib/uuid (str (random-uuid))}
              "United States"]
             "Country")))))

(deftest ^:parallel fresh-uuids-test
  (is (=? [:=
           {:lib/uuid (partial not= "8044c5a1-10ab-4122-8663-aa544074c082")}
           [:field {:lib/uuid (partial not= "36a2abff-e4ae-4752-b232-4885e08f52ea")} 5]
           "abc"]
          (lib.util/fresh-uuids
           [:=
            {:lib/uuid "8044c5a1-10ab-4122-8663-aa544074c082"}
            [:field {:lib/uuid "36a2abff-e4ae-4752-b232-4885e08f52ea"} 5]
            "abc"]))))
