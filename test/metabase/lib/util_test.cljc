(ns metabase.lib.util-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

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
                       :aggregation  [[:count]]}]}
          (lib.util/update-query-stage {:database 1
                                        :type     :query
                                        :query    {:source-table 1}}
                                       0
                                       update
                                       :aggregation
                                       conj
                                       [:count])))
  (are [stage expected] (=? expected
                            (lib.util/update-query-stage {:database 1
                                                          :type     :query
                                                          :query    {:source-query {:source-table 1}}}
                                                         stage
                                                         update
                                                         :aggregation
                                                         conj
                                                         [:count]))
    0 {:database 1
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 1
                   :aggregation  [[:count]]}
                  {:lib/type :mbql.stage/mbql}]}
    1 {:database 1
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 1}
                  {:lib/type    :mbql.stage/mbql
                   :aggregation [[:count]]}]}
    -1 {:database 1
        :stages   [{:lib/type     :mbql.stage/mbql
                    :source-table 1}
                   {:lib/type    :mbql.stage/mbql
                    :aggregation [[:count]]}]})
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
                                      [:count])))))

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

(deftest ^:parallel truncate-string-to-byte-count-test
  (letfn [(truncate-string-to-byte-count [s byte-length]
            (let [truncated (#'lib.util/truncate-string-to-byte-count s byte-length)]
              (is (<= (#'lib.util/string-byte-count truncated) byte-length))
              (is (str/starts-with? s truncated))
              truncated))]
    (doseq [[s max-length->expected] {"12345"
                                      {1  "1"
                                       2  "12"
                                       3  "123"
                                       4  "1234"
                                       5  "12345"
                                       6  "12345"
                                       10 "12345"}

                                      "가나다라"
                                      {1  ""
                                       2  ""
                                       3  "가"
                                       4  "가"
                                       5  "가"
                                       6  "가나"
                                       7  "가나"
                                       8  "가나"
                                       9  "가나다"
                                       10 "가나다"
                                       11 "가나다"
                                       12 "가나다라"
                                       13 "가나다라"
                                       15 "가나다라"
                                       20 "가나다라"}}
            [max-length expected] max-length->expected]
      (testing (pr-str (list `lib.util/truncate-string-to-byte-count s max-length))
        (is (= expected
               (truncate-string-to-byte-count s max-length)))))))

(deftest ^:parallel truncate-alias-test
  (letfn [(truncate-alias [s max-bytes]
            (let [truncated (lib.util/truncate-alias s max-bytes)]
              (is (<= (#'lib.util/string-byte-count truncated) max-bytes))
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
      (is (= "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY_1380b38f"
             (unique-name-fn "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))))))

(deftest ^:parallel strip-id-test
  (are [exp in] (= exp (lib.util/strip-id in))
    "foo"            "foo"
    "Fancy Name"     "Fancy Name"
    "Customer"       "Customer ID"
    "Customer"       "Customer id"
    "some id number" "some id number"))
