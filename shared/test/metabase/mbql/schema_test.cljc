(ns metabase.mbql.schema-test
  (:require [clojure.test :as t]
            [metabase.mbql.schema :as mbql.s]
            [schema.core :as s]))

(t/deftest ^:parallel field-clause-test
  (t/testing "Make sure our schema validates `:field` clauses correctly"
    (doseq [[clause expected] {[:field 1 nil]                                                          true
                               [:field 1 {}]                                                           true
                               [:field 1 {:x true}]                                                    true
                               [:field 1 2]                                                            false
                               [:field "wow" nil]                                                      false
                               [:field "wow" {}]                                                       false
                               [:field "wow" 1]                                                        false
                               [:field "wow" {:base-type :type/Integer}]                               true
                               [:field "wow" {:base-type 100}]                                         false
                               [:field "wow" {:base-type :type/Integer, :temporal-unit :month}]        true
                               [:field "wow" {:base-type :type/Date, :temporal-unit :month}]           true
                               [:field "wow" {:base-type :type/DateTimeWithTZ, :temporal-unit :month}] true
                               [:field "wow" {:base-type :type/Time, :temporal-unit :month}]           false
                               [:field 1 {:binning {:strategy :num-bins}}]                             false
                               [:field 1 {:binning {:strategy :num-bins, :num-bins 1}}]                true
                               [:field 1 {:binning {:strategy :num-bins, :num-bins 1.5}}]              false
                               [:field 1 {:binning {:strategy :num-bins, :num-bins -1}}]               false
                               [:field 1 {:binning {:strategy :default}}]                              true
                               [:field 1 {:binning {:strategy :fake}}]                                 false}]
      (t/testing (pr-str clause)
        (t/is (= expected
                 (not (s/check mbql.s/field clause))))))))

(t/deftest ^:parallel validate-template-tag-names-test
  (t/testing "template tags with mismatched keys/`:names` in definition should be disallowed\n"
    (let [correct-query {:database 1
                         :type     :native
                         :native   {:query         "SELECT * FROM table WHERE id = {{foo}}"
                                    :template-tags {"foo" {:id           "abc123"
                                                           :name         "foo"
                                                           :display-name "foo"
                                                           :type         :text}}}}
          bad-query     (assoc-in correct-query [:native :template-tags "foo" :name] "filter")]
      (t/testing (str "correct-query " (pr-str correct-query))
        (t/is (= correct-query
                 (mbql.s/validate-query correct-query))))
      (t/testing (str "bad-query " (pr-str bad-query))
        (t/is (thrown-with-msg?
               #?(:clj clojure.lang.ExceptionInfo :cljs cljs.core.ExceptionInfo)
               #"keys in template tag map must match the :name of their values"
               (mbql.s/validate-query bad-query)))))))
