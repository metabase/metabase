(ns metabase.lib.join.fields-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- test-with-join-fields [input expected]
  (testing (pr-str (list 'with-join-fields 'query input))
    (let [query (-> lib.tu/venues-query
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :categories)
                                   [(lib/=
                                     (meta/field-metadata :venues :category-id)
                                     (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields input))))]
      (is (=? {:stages [{:joins [(merge
                                  {:alias      "Cat"
                                   :conditions [[:= {}
                                                 [:field {} (meta/id :venues :category-id)]
                                                 [:field {:join-alias "Cat"} (meta/id :categories :id)]]]}
                                  expected)]}]}
              query))
      (let [[join] (lib/joins query)]
        (is (some? join))
        (is (= (:fields expected)
               (lib/join-fields join)))))))

(deftest ^:parallel with-join-fields-test
  (doseq [{:keys [input expected]}
          [{:input :all, :expected {:fields :all}}
           {:input :none, :expected {:fields :none}}
           ;; (with-join-fields ... []) should set :fields to :none
           {:input [], :expected {:fields :none}}
           {:input nil, :expected {:fields :all}}]]
    (test-with-join-fields input expected)))

(deftest ^:parallel with-join-fields-explicit-fields-test
  (let [categories-id [:field {:lib/uuid   (str (random-uuid))
                               :join-alias "Cat"}
                       (meta/id :categories :id)]]
    (test-with-join-fields
     [categories-id]
     {:fields [categories-id]})))

(deftest ^:parallel with-join-fields-update-join-aliases-test
  (testing "explicit :fields should change join alias for fields that have a different alias (#32437)"
    (let [categories-id [:field {:lib/uuid (str (random-uuid))} (meta/id :categories :id)]]
      (test-with-join-fields
       [(lib/with-join-alias categories-id "Hat")]
       {:fields [(lib/with-join-alias categories-id "Cat")]}))))

(deftest ^:parallel with-join-fields-add-missing-aliases-test
  (testing "explicit :fields should add join alias to fields missing it (#32437)"
    (let [categories-id [:field {:lib/uuid (str (random-uuid))} (meta/id :categories :id)]]
      (test-with-join-fields
       [categories-id]
       {:fields [(lib/with-join-alias categories-id "Cat")]}))))
