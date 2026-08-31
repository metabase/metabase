(ns metabase.explorations.query-plan.mbql-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.explorations.query-plan.mbql :as qp.mbql]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel target-field-id-test
  (testing "an id-based :field ref yields its Field id"
    (are [target] (= 12 (qp.mbql/target-field-id target))
      ["field" {"base-type" "type/Integer"} 12]
      [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 12]))
  (testing "targets that carry no Field id yield nil"
    (are [target] (nil? (qp.mbql/target-field-id target))
      ["field" {"base-type" "type/Text"} "NAME"]
      ["expression" "Foo"]
      nil))
  (testing "targets are read back from JSON at rest, so a malformed one must yield nil, not throw"
    (are [target] (nil? (qp.mbql/target-field-id target))
      ["field" {} nil]
      ["field" {}]
      {}
      "garbage")))

(deftest ^:parallel normalize-target-ref-test
  (testing "a legacy :expression target keeps its name (it is normalized by the lib ref schema)"
    (is (= [:expression "Foo"]
           (let [[tag _opts nm] (qp.mbql/normalize-target-ref ["expression" "Foo"])]
             [tag nm])))))

(def ^:private default-created-at-dim
  {:id             "d-created-at"
   :display-name   "Order Date"
   :effective-type :type/DateTimeWithLocalTZ
   :status         :status/active
   :default        true})

(defn- card-with-default-dim
  [dim & {:keys [mappings]}]
  {:dimensions         [dim]
   :dimension_mappings (or mappings
                           [{:dimension-id (:id dim)
                             :target       [:field {} (meta/id :orders :created-at)]}])})

(defn- orders-count-query []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/aggregate (lib/count))))

(deftest ^:parallel default-time-dimension-col-test
  (let [q (orders-count-query)]
    (testing "the curated default temporal dim resolves to [col unit display-name]"
      (let [[col unit display-name]
            (qp.mbql/default-time-dimension-col q (card-with-default-dim default-created-at-dim))]
        (is (= (meta/id :orders :created-at) (:id col)))
        (is (= :month unit))
        (is (= "Order Date" display-name))))
    (testing "the dim's curated :default-temporal-unit wins over the :month fallback"
      (let [[_col unit] (qp.mbql/default-time-dimension-col
                         q
                         (card-with-default-dim
                          (assoc default-created-at-dim :default-temporal-unit :week)))]
        (is (= :week unit))))
    (testing "a pure :type/Date dim qualifies — a date component is what matters"
      (let [[col unit] (qp.mbql/default-time-dimension-col
                        q
                        (card-with-default-dim
                         (assoc default-created-at-dim :effective-type :type/Date)))]
        (is (some? col))
        (is (= :month unit))))))

(deftest ^:parallel default-time-dimension-col-disqualified-test
  (let [q (orders-count-query)]
    (testing "a non-temporal default dim yields nil"
      (is (nil? (qp.mbql/default-time-dimension-col
                 q
                 (card-with-default-dim
                  {:id             "d-category"
                   :display-name   "Category"
                   :effective-type :type/Text
                   :status         :status/active
                   :default        true}
                  :mappings [{:dimension-id "d-category"
                              :target       [:field
                                             {:source-field (meta/id :orders :product-id)}
                                             (meta/id :products :category)]}])))))
    (testing "a bare :type/Time default dim yields nil — no date component"
      (is (nil? (qp.mbql/default-time-dimension-col
                 q
                 (card-with-default-dim
                  (assoc default-created-at-dim :effective-type :type/Time))))))
    (testing "an orphaned default dim yields nil"
      (is (nil? (qp.mbql/default-time-dimension-col
                 q
                 (card-with-default-dim
                  (assoc default-created-at-dim :status :status/orphaned))))))
    (testing "no dim marked default yields nil"
      (is (nil? (qp.mbql/default-time-dimension-col
                 q
                 (card-with-default-dim (dissoc default-created-at-dim :default))))))
    (testing "a default dim with no mapping yields nil"
      (is (nil? (qp.mbql/default-time-dimension-col
                 q
                 (assoc (card-with-default-dim default-created-at-dim)
                        :dimension_mappings [])))))
    (testing "no fallback to dataset_query breakouts: a temporal breakout alone is ignored"
      (is (nil? (qp.mbql/default-time-dimension-col
                 (lib/breakout q (lib/with-temporal-bucket
                                   (meta/field-metadata :orders :created-at)
                                   :month))
                 {:dimensions [] :dimension_mappings []}))))))
