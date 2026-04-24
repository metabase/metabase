(ns metabase.agent-lib.runtime.fields-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.agent-lib.runtime.fields :as runtime.fields]
   [metabase.test :as mt]))

(deftest resolve-field-in-query-prefers-chained-lineage-over-raw-exact-match-test
  (let [raw-field      {:id 300 :table-id 30 :name "name" :base-type :type/Text}
        raw-exact      {:id 300 :table-id 30 :name "name" :base-type :type/Text}
        source-column  {:id 200 :table-id 20 :name "customer_id" :base-type :type/Integer}
        fields-by-id   {200 {:id 200 :table-id 20 :fk-target-field-id 301}
                        301 {:id 301 :table-id 30}}
        resolved-field (mt/with-dynamic-fn-redefs [mbql/current-query-field-candidates
                                                   (constantly [raw-exact source-column])]
                         (runtime.fields/resolve-field-in-query fields-by-id ::query raw-field))]
    (is (= 300 (:id resolved-field)))
    (is (= 200 (:fk-field-id resolved-field)))
    (is (= "customer_id" (:fk-field-name resolved-field)))))

(deftest resolve-field-in-query-preserves-upstream-lineage-when-chaining-related-fields-test
  (let [raw-field      {:id 2455 :table-id 127 :name "first_name" :base-type :type/Text}
        source-column  {:id 2488
                        :table-id 133
                        :name "customer_id"
                        :lib/source-column-alias "customer_id"
                        :base-type :type/Integer
                        :fk-field-id 2503}
        fields-by-id   {2503 {:id 2503 :table-id 116 :name "order_id" :fk-target-field-id 2499}
                        2499 {:id 2499 :table-id 133 :name "id"}
                        2488 {:id 2488 :table-id 133 :name "customer_id" :fk-target-field-id 2456}
                        2456 {:id 2456 :table-id 127 :name "id"}}
        resolved-field (mt/with-dynamic-fn-redefs [mbql/current-query-field-candidates
                                                   (constantly [source-column])]
                         (runtime.fields/resolve-field-in-query fields-by-id ::query raw-field))]
    (is (= 2455 (:id resolved-field)))
    (is (= 2488 (:fk-field-id resolved-field)))
    (is (= "customer_id" (:fk-field-name resolved-field)))
    (is (= 2503 (:lib/original-fk-field-id resolved-field)))))

(deftest resolve-field-in-query-preserves-original-source-field-lineage-when-chaining-related-fields-test
  (let [raw-field      {:id 2455 :table-id 127 :name "first_name" :base-type :type/Text}
        source-column  {:id 2488
                        :table-id 133
                        :name "customer_id"
                        :lib/source-column-alias "customer_id"
                        :base-type :type/Integer
                        :source-field 2503
                        :source-field-name "order_id"}
        fields-by-id   {2488 {:id 2488 :table-id 133 :fk-target-field-id 2456}
                        2456 {:id 2456 :table-id 127}}
        resolved-field (mt/with-dynamic-fn-redefs [mbql/current-query-field-candidates
                                                   (constantly [source-column])]
                         (runtime.fields/resolve-field-in-query fields-by-id ::query raw-field))]
    (is (= 2455 (:id resolved-field)))
    (is (= 2488 (:fk-field-id resolved-field)))
    (is (= "customer_id" (:fk-field-name resolved-field)))
    (is (= 2503 (:lib/original-fk-field-id resolved-field)))
    (is (= "order_id" (:lib/original-fk-field-name resolved-field)))))

(deftest resolve-field-in-query-preserves-upstream-join-alias-when-chaining-related-fields-test
  (let [raw-field      {:id 2455 :table-id 127 :name "first_name" :base-type :type/Text}
        source-column  {:id 2488
                        :table-id 133
                        :name "customer_id"
                        :base-type :type/Integer
                        :fk-field-id 2503
                        :fk-join-alias "order__via__order_id"}
        fields-by-id   {2503 {:id 2503 :table-id 116 :fk-target-field-id 2499}
                        2499 {:id 2499 :table-id 133}
                        2488 {:id 2488 :table-id 133 :fk-target-field-id 2456}
                        2456 {:id 2456 :table-id 127}}
        resolved-field (mt/with-dynamic-fn-redefs [mbql/current-query-field-candidates
                                                   (constantly [source-column])]
                         (runtime.fields/resolve-field-in-query fields-by-id ::query raw-field))]
    (is (= "order__via__order_id" (:fk-join-alias resolved-field)))
    (is (= "order__via__order_id" (:lib/original-fk-join-alias resolved-field)))))

(deftest resolve-field-in-query-prefers-chained-lineage-over-exact-partial-related-field-test
  (let [raw-field      {:id 2455 :table-id 127 :name "first_name" :base-type :type/Text}
        exact-partial  {:id 2455
                        :table-id 127
                        :name "first_name"
                        :base-type :type/Text
                        :source-field 2488
                        :source-field-name "customer_id"}
        source-column  {:id 2488
                        :table-id 133
                        :name "customer_id"
                        :base-type :type/Integer
                        :source-field 2503
                        :source-field-name "order_id"
                        :fk-join-alias "order__via__order_id"}
        fields-by-id   {2503 {:id 2503 :table-id 116 :name "order_id" :fk-target-field-id 2499}
                        2499 {:id 2499 :table-id 133 :name "id"}
                        2488 {:id 2488 :table-id 133 :name "customer_id" :fk-target-field-id 2456}
                        2456 {:id 2456 :table-id 127 :name "id"}}
        resolved-field (mt/with-dynamic-fn-redefs [mbql/current-query-field-candidates
                                                   (constantly [exact-partial source-column])]
                         (runtime.fields/resolve-field-in-query fields-by-id ::query raw-field))]
    (is (= 2455 (:id resolved-field)))
    (is (= 2488 (:fk-field-id resolved-field)))
    (is (= "customer_id" (:fk-field-name resolved-field)))
    (is (= 2503 (:lib/original-fk-field-id resolved-field)))
    (is (= "order_id" (:lib/original-fk-field-name resolved-field)))
    (is (= "order__via__order_id" (:fk-join-alias resolved-field)))
    (is (= "order__via__order_id" (:lib/original-fk-join-alias resolved-field)))))

(deftest resolve-field-in-query-prefers-previous-stage-column-over-raw-exact-match-test
  (let [raw-field      {:id 282 :table-id 88 :name "utilization_percentage" :base-type :type/Decimal}
        raw-exact      {:id 282 :table-id 88 :name "utilization_percentage" :base-type :type/Decimal}
        previous-stage {:name "utilization_percentage"
                        :base-type :type/Decimal
                        :effective-type :type/Decimal
                        :lib/source :source/previous-stage}
        resolved-field (mt/with-dynamic-fn-redefs [mbql/current-query-field-candidates
                                                   (constantly [raw-exact previous-stage])]
                         (runtime.fields/resolve-field-in-query {} ::query raw-field))]
    (is (= previous-stage resolved-field))))

(deftest resolve-field-in-query-prefers-previous-stage-name-match-test
  (let [raw-field          {:id 468 :table-id 21 :name "name" :base-type :type/Text}
        previous-event-uri {:name "event_uri"
                            :base-type :type/Text
                            :effective-type :type/Text
                            :lib/source :source/previous-stage}
        previous-name      {:name "name"
                            :base-type :type/Text
                            :effective-type :type/Text
                            :lib/source :source/previous-stage}
        resolved-field     (mt/with-dynamic-fn-redefs [mbql/current-query-field-candidates
                                                       (constantly [previous-event-uri previous-name])]
                             (runtime.fields/resolve-field-in-query {} ::query raw-field))]
    (is (= previous-name resolved-field))))

(deftest resolve-field-in-query-rejects-unrelated-previous-stage-numeric-column-test
  (let [raw-field      {:id 282 :table-id 88 :name "total" :base-type :type/Decimal}
        previous-stage {:name "count"
                        :base-type :type/Integer
                        :effective-type :type/Integer
                        :lib/source :source/previous-stage}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"not available in the current query stage"
                          (mt/with-dynamic-fn-redefs [mbql/current-query-field-candidates
                                                      (constantly [previous-stage])]
                            (runtime.fields/resolve-field-in-query {} ::query raw-field))))))
