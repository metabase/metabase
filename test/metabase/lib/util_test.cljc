(ns metabase.lib.util-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
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

(deftest ^:parallel pipeline-joins-test-2
  (testing "Make sure we don't add unnecessary stages to joins when pipelining"
    (let [query {:database 33001
                 :type     :query
                 :query    {:aggregation  [[:count]]
                            :joins        [{:source-query {:source-table 33010
                                                           :parameters   [{:name "id", :type :category, :target [:field 33100 nil], :value 5}]}
                                            :alias        "c"
                                            :condition    [:= [:field 33402 nil] [:field 33100 {:join-alias "c"}]]
                                            :parameters   [{:type "category", :target [:field 33101 nil], :value "BBQ"}]}]
                            :source-table 33040}}]
      (is (=? {:stages [{:joins [{:stages [{}]}]}]}
              (lib.util/pipeline query))))))

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
                                 :lib/type :mbql/query
                                 :stages   [{:lib/type     :mbql.stage/mbql
                                             :source-table 1}]}
                                0))))

(deftest ^:parallel query-stage-test-2
  (are [index expected] (=? expected
                            (lib.util/query-stage {:database 1
                                                   :lib/type :mbql/query
                                                   :stages   [{:lib/type     :mbql.stage/mbql
                                                               :source-table 1}
                                                              {:lib/type     :mbql.stage/mbql}]}
                                                  index))
    0 {:lib/type     :mbql.stage/mbql
       :source-table 1}
    1 {:lib/type :mbql.stage/mbql}))

(deftest ^:parallel query-stage-test-3
  (testing "negative index"
    (are [index expected] (=? expected
                              (lib.util/query-stage {:database 1
                                                     :lib/type :mbql/query
                                                     :stages   [{:lib/type     :mbql.stage/mbql
                                                                 :source-table 1}
                                                                {:lib/type     :mbql.stage/mbql}]}
                                                    index))
      -1 {:lib/type :mbql.stage/mbql}
      -2 {:lib/type     :mbql.stage/mbql
          :source-table 1})))

(deftest ^:parallel query-stage-test-4
  (testing "Out of bounds"
    (let [query {:database 1
                 :lib/type :mbql/query
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table 1}
                            {:lib/type     :mbql.stage/mbql}]}]
      (is (thrown-with-msg?
           #?(:clj Throwable :cljs js/Error)
           #"Stage 2 does not exist"
           (lib.util/query-stage query 2)))
      (is (thrown-with-msg?
           #?(:clj Throwable :cljs js/Error)
           #"Stage -3 does not exist"
           (lib.util/query-stage query -3))))))

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
    (doseq [[s max-bytes->expected] {;; 20-character plain ASCII string
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
  (let [unique-name-fn (lib.util/unique-name-generator)]
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
    (let [unique-name (lib.util/unique-name-generator)]
      (is (= ["A" "B" "A" "A_2" "A_2"]
             [(unique-name :x "A")
              (unique-name :x "B")
              (unique-name :x "A")
              (unique-name :y "A")
              (unique-name :y "A")])))))

(deftest ^:parallel unique-name-generator-zero-arity-test
  (let [f (lib.util/unique-name-generator)]
    (is (= ["A" "B" "A" "A_2" "A_2"]
           [(f :x "A")
            (f :x "B")
            (f :x "A")
            (f :y "A")
            (f :y "A")]))
    (let [f' (f)]
      (is (= ["A" "B" "A" "A_2" "A_2"]
             [(f' :x "A")
              (f' :x "B")
              (f' :x "A")
              (f' :y "A")
              (f' :y "A")]))
      (let [f'' (f')]
        (is (= ["A" "B" "A" "A_2" "A_2"]
               [(f'' :x "A")
                (f'' :x "B")
                (f'' :x "A")
                (f'' :y "A")
                (f'' :y "A")]))))))

(deftest ^:parallel non-truncating-unique-name-generator-test
  (let [f (lib.util/non-truncating-unique-name-generator)]
    (is (= "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
           (f "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count")))))

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

(deftest ^:parallel fresh-query-instance-test
  (let [query {:lib/type :mbql/query,
               :stages
               [{:lib/type :mbql.stage/mbql,
                 :breakout
                 [[:field {:base-type :type/DateTime, :temporal-unit :month,
                           :lib/uuid "7ec788fb-3eb2-4ed0-88fa-5f6b53a09094"}
                   38]
                  [:field {:base-type :type/Text, :source-field 37,
                           :lib/uuid "65135c9c-fec5-4f51-b111-fadbb6af4522"}
                   64]],
                 :aggregation [[:metric {:lib/uuid "aa83c834-9a7c-4d7b-b408-3e17668d5ecc"} 84]],
                 :order-by
                 [[:asc
                   #:lib{:uuid "2712fc42-d13e-4810-9ae9-a126d536376e"}
                   [:aggregation {:lib/uuid "a1d73928-05db-4cb7-bb05-5123d2dbc261"}
                    "aa83c834-9a7c-4d7b-b408-3e17668d5ecc"]]],
                 :source-card 84}],
               :database 1}
        fresh-query (lib.util/fresh-query-instance query)
        aggregation-ref-path [:stages 0 :order-by 0 2 2]]
    (is (= (get-in fresh-query [:stages 0 :aggregation 0 1 :lib/uuid])
           (get-in fresh-query aggregation-ref-path)))
    (is (not= (get-in query       aggregation-ref-path)
              (get-in fresh-query aggregation-ref-path)))
    (is (lib.equality/= query fresh-query))))

(def ^:private single-stage-query
  (lib.tu/venues-query))

(def ^:private two-stage-query
  (-> (lib/append-stage single-stage-query)
      (lib/filter (lib/= 1 (meta/field-metadata :venues :id)))))

(deftest ^:parallel first-stage?-test
  (testing "should return true for the first stage"
    (is (true? (lib.util/first-stage? single-stage-query 0)))
    (is (true? (lib.util/first-stage? two-stage-query 0))))
  (testing "should return false for the second stage"
    (is (false? (lib.util/first-stage? two-stage-query 1))))
  (testing "should throw for invalid index"
    (are [form] (thrown-with-msg?
                 #?(:clj Throwable :cljs js/Error)
                 #"Stage .* does not exist"
                 form)
      (lib.util/first-stage? single-stage-query 1)
      (lib.util/first-stage? single-stage-query -2)
      (lib.util/first-stage? two-stage-query 2)
      (lib.util/first-stage? two-stage-query -3))))

(deftest ^:parallel last-stage?-test
  (testing "should return true for the last stage"
    (is (true? (lib.util/last-stage? single-stage-query 0)))
    (is (true? (lib.util/last-stage? two-stage-query 1))))
  (testing "should return false for a non-last stage"
    (is (false? (lib.util/last-stage? two-stage-query 0))))
  (testing "should throw for invalid index"
    (are [form] (thrown-with-msg?
                 #?(:clj Throwable :cljs js/Error)
                 #"Stage .* does not exist"
                 form)
      (lib.util/last-stage? single-stage-query 1)
      (lib.util/last-stage? single-stage-query -2)
      (lib.util/last-stage? two-stage-query 2)
      (lib.util/last-stage? two-stage-query -3))))

(deftest ^:parallel drop-later-stages-test
  (is (= 1 (lib/stage-count (lib.util/drop-later-stages single-stage-query 0))))
  (is (= 1 (lib/stage-count (lib.util/drop-later-stages single-stage-query -1))))
  (is (= single-stage-query (lib.util/drop-later-stages single-stage-query 0)))
  (is (= 1 (lib/stage-count (lib.util/drop-later-stages two-stage-query 0))))
  (is (= 1 (lib/stage-count (lib.util/drop-later-stages two-stage-query -2))))
  (is (= 2 (lib/stage-count (lib.util/drop-later-stages two-stage-query 1))))
  (is (= 2 (lib/stage-count (lib.util/drop-later-stages two-stage-query -1))))
  (is (= two-stage-query (lib.util/drop-later-stages two-stage-query -1))))

(deftest ^:parallel find-stage-index-and-clause-by-uuid-test
  (let [query {:database 1
               :lib/type :mbql/query
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table 2
                           :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000001"}]]}
                          {:lib/type :mbql.stage/mbql
                           :filters  [[:=
                                       {:lib/uuid "a1898aa6-4928-4e97-837d-e440ce21085e"}
                                       [:field {:lib/uuid "1cb2a996-6ba1-45fb-8101-63dc3105c311"} 3]
                                       "wow"]]}]}]
    (is (= [0 [:count {:lib/uuid "00000000-0000-0000-0000-000000000001"}]]
           (lib.util/find-stage-index-and-clause-by-uuid query "00000000-0000-0000-0000-000000000001")))
    (is (= [0 [:count {:lib/uuid "00000000-0000-0000-0000-000000000001"}]]
           (lib.util/find-stage-index-and-clause-by-uuid query 0 "00000000-0000-0000-0000-000000000001")))
    (is (= [1 [:field {:lib/uuid "1cb2a996-6ba1-45fb-8101-63dc3105c311"} 3]]
           (lib.util/find-stage-index-and-clause-by-uuid query "1cb2a996-6ba1-45fb-8101-63dc3105c311")))
    (is (= [1 [:=
               {:lib/uuid "a1898aa6-4928-4e97-837d-e440ce21085e"}
               [:field {:lib/uuid "1cb2a996-6ba1-45fb-8101-63dc3105c311"} 3]
               "wow"]]
           (lib.util/find-stage-index-and-clause-by-uuid query "a1898aa6-4928-4e97-837d-e440ce21085e")))
    (is (nil? (lib.util/find-stage-index-and-clause-by-uuid query "00000000-0000-0000-0000-000000000002")))
    (is (nil? (lib.util/find-stage-index-and-clause-by-uuid query 0 "a1898aa6-4928-4e97-837d-e440ce21085e")))))

(deftest ^:parallel do-not-add-extra-stages-to-join-test
  (is (=? {:stages [{:source-table 45060
                     :joins        [{:alias  "PRODUCTS__via__PRODUCT_ID"
                                     :stages [{:source-table 45050
                                               :fields       [[:field 45500 {:base-type :type/BigInteger}]
                                                              [:field 45507 {:base-type :type/Text}]]}]}]}]}
          (lib.util/pipeline '{:database 45001
                               :type     :query
                               :query    {:source-table 45060
                                          :joins        [{:strategy     :left-join
                                                          :alias        "PRODUCTS__via__PRODUCT_ID"
                                                          :fk-field-id  45607
                                                          :condition    [:=
                                                                         [:field 45607 nil]
                                                                         [:field 45500 {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                                          :source-query {:source-table 45050
                                                                         :fields       [[:field 45500 {:base-type :type/BigInteger}]
                                                                                        [:field 45507 {:base-type :type/Text}]]}}]}}))))

(deftest ^:parallel pipeline-puts-join-metadata-in-the-correct-place-test
  (testing "Should be able to convert a query with metadata to MBQL 5 correctly (without normalization errors)"
    (let [query {:database 83001
                 :type     :query
                 :query    {:joins        [{:alias           "Q1"
                                            :fields          :all
                                            :condition       [:=
                                                              [:field "CC" {:base-type :type/Integer}]
                                                              [:field "CC" {:base-type :type/Integer, :join-alias "Q1"}]]
                                            :source-query    {:expressions     {"CC" [:+ 1 1]}
                                                              :source-query    {:source-table 83050
                                                                                :aggregation  [[:count]]
                                                                                :breakout     [[:field 83502 nil]]}
                                                              :source-metadata [{:name "CATEGORY"}
                                                                                {:name "count"}]}
                                            :source-metadata [{:name "CATEGORY"}
                                                              {:name "count"}
                                                              {:name "CC", :lib/expression-name "CC"}]}]
                            :source-query {:expressions  {"CC" [:+ 1 1]}
                                           :source-query {:source-table 83050
                                                          :aggregation  [[:count]]
                                                          :breakout     [[:field 83502 nil]]}}}}]
      (is (=? {:stages [{:source-table 83050
                         :aggregation  [[:count]]
                         :breakout     [[:field 83502 nil]]}
                        {:expressions {"CC" [:+ 1 1]}}
                        {:joins [{:alias           "Q1"
                                  :fields          :all
                                  :source-metadata (symbol "nil #_\"key is not present.\"")
                                  :conditions      [[:=
                                                     [:field "CC" {:base-type :type/Integer}]
                                                     [:field "CC" {:base-type :type/Integer, :join-alias "Q1"}]]]
                                  :stages          [{:source-table       83050
                                                     :aggregation        [[:count]]
                                                     :breakout           [[:field 83502 nil]]
                                                     :lib/stage-metadata {:columns [{:name "CATEGORY"}
                                                                                    {:name "count"}]}}
                                                    {:expressions        {"CC" [:+ 1 1]}
                                                     :lib/stage-metadata {:columns [{:name "CATEGORY"}
                                                                                    {:name "count"}
                                                                                    {:name "CC", :lib/expression-name "CC"}]}}]}]}]}
              (lib.util/pipeline query))))))
