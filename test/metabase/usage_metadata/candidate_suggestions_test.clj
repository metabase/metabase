(ns metabase.usage-metadata.candidate-suggestions-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.candidate-suggestions :as candidate-suggestions]
   [metabase.usage-metadata.models.source-segment-composite-daily]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users-personal-collections))

(deftest ^:parallel malformed-candidate-naming-falls-back-test
  (let [failure (fn [_] (throw (ex-info "stale field" {})))]
    (is (=? {:aggregation {:type :sum, :base-name "Measure"}
             :source {:display-name "Orders"}
             :suggested-name "Measure"
             :suggested-description "Measure on Orders"}
            (candidate-suggestions/suggestions-or-fallback {:aggregation {:type :sum}
                                                            :source {:display-name "Orders"}}
                                                           :measure
                                                           failure)))
    (is (=? {:atoms [{:display-name "Filter", :kind :other}]
             :source {:display-name "Orders"}
             :suggested-name "Segment"
             :suggested-description "Filtered by Segment on Orders"}
            (candidate-suggestions/suggestions-or-fallback {:predicate [:= {} [:field {} 1] 1]
                                                            :source {:display-name "Orders"}}
                                                           :segment
                                                           failure)))))

(deftest candidate-suggestions-expand-short-multi-value-filters-test
  (let [mp        (lib-be/application-database-metadata-provider (mt/id))
        products  (lib.metadata/table mp (mt/id :products))
        category  (lib.metadata/field mp (mt/id :products :category))
        predicate (lib/in category "Gadget" "Widget")
        definition (lib/query mp products)
        base-candidate {:source {:name "Products"}
                        :metabase.usage-metadata.candidate-suggestions/metadata-provider mp}]
    (testing "segment names include the selected values"
      (is (=? {:suggested-name "Category is one of Gadget or Widget"
               :suggested-description "Filtered by Category is one of Gadget or Widget on Products"
               :atoms [{:display-name "Category is one of Gadget or Widget"
                        :kind :category}]}
              (-> (assoc base-candidate
                         :definition (lib/filter definition predicate)
                         :predicate predicate)
                  candidate-suggestions/add-segment-suggestions))))
    (testing "conditional measure names include the selected values"
      (let [measure-predicate (lib/in category "Gadget" "Widget")]
        (is (=? {:suggested-name "Count where Category is one of Gadget or Widget"
                 :aggregation {:base-name "Count"
                               :condition-atoms [{:display-name "Category is one of Gadget or Widget"
                                                  :kind :category}]}}
                (-> (assoc base-candidate
                           :definition (lib/aggregate definition (lib/count-where measure-predicate))
                           :aggregation {:type :count-where
                                         :condition measure-predicate})
                    candidate-suggestions/add-measure-suggestions)))))))

(deftest predicate-kind-follows-field-metadata-test
  (are [expected column] (= expected (candidate-suggestions/column-predicate-kind column))
    :boolean  {:base-type :type/Boolean}
    :temporal {:base-type :type/DateTime}
    :category {:base-type :type/Text}
    :category {:base-type :type/Integer, :semantic-type :type/Category}
    :category {:base-type :type/Integer, :semantic-type :type/PK}
    :number   {:base-type :type/Float}
    :other    {:base-type :type/*}))

(deftest candidate-suggestions-are-bounded-and-fall-back-safely-test
  (let [candidate {:definition {}
                   :predicate [:unknown {}]
                   :source {:name "Orders"}}]
    (testing "long names are capped at the app-db name limit without shortening the description"
      (let [long-name (apply str (repeat 300 "x"))]
        (mt/with-dynamic-fn-redefs [lib/display-name (fn [& _] long-name)
                                    lib/describe-top-level-key (fn [& _] long-name)]
          (let [suggested (candidate-suggestions/add-segment-suggestions candidate)]
            (is (= 254 (count (:suggested-name suggested))))
            (is (str/ends-with? (:suggested-name suggested) "..."))
            (is (= (str long-name " on Orders") (:suggested-description suggested)))))))
    (testing "display-name failures do not abort candidate mining"
      (mt/with-dynamic-fn-redefs [lib/display-name (fn [& _] (throw (ex-info "boom" {})))
                                  lib/describe-top-level-key (fn [& _] (throw (ex-info "boom" {})))]
        (is (= {:suggested-name "Segment"
                :suggested-description "Filtered by Segment on Orders"}
               (select-keys (candidate-suggestions/add-segment-suggestions candidate)
                            [:suggested-name :suggested-description])))))
    (testing "Errors and thread interruption are not swallowed"
      (mt/with-dynamic-fn-redefs [lib/display-name (fn [& _] (throw (AssertionError. "boom")))]
        (is (thrown? AssertionError (candidate-suggestions/add-segment-suggestions candidate))))
      (try
        (mt/with-dynamic-fn-redefs [lib/display-name (fn [& _] (throw (InterruptedException. "stop")))]
          (let [rethrown?    (try
                               (candidate-suggestions/add-segment-suggestions candidate)
                               false
                               (catch InterruptedException _
                                 true))
                interrupted? (Thread/interrupted)]
            (is rethrown?)
            (is interrupted?)))
        (finally
          (Thread/interrupted))))))
