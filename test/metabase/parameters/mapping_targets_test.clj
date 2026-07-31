(ns metabase.parameters.mapping-targets-test
  "Tests for enumerating the parameter mapping targets a card exposes — the backend counterpart of
   the frontend's getParameterMappingOptions."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.parameters.mapping-targets :as mapping-targets]
   [metabase.parameters.params :as params]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- venues-query
  "A Lib query selecting everything from `venues`."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(deftest mbql-card-exposes-filterable-columns-test
  (testing "GHY-4147: an MBQL card's targets are its filterable columns, as dimension clauses"
    (mt/with-temp [:model/Card card {:dataset_query (venues-query)}]
      (let [targets (mapping-targets/valid-targets card {:id "p1" :type "string/="})]
        (is (seq targets))
        (is (every? #(= :dimension (first (:target %))) targets))
        (is (contains? (set (map :column-name targets)) "NAME"))))))

(deftest dimension-targets-carry-a-stage-number-test
  (testing "GHY-4147: dimension targets carry {:stage-number 0} — without it they resolve wrong on
            multi-stage queries"
    (mt/with-temp [:model/Card card {:dataset_query (venues-query)}]
      (let [targets (mapping-targets/valid-targets card {:id "p1" :type "string/="})]
        (is (every? #(= {:stage-number 0} (nth (:target %) 2 nil)) targets))))))

(deftest target-for-field-test
  (testing "GHY-4147: target-for-field finds the target resolving to a specific field"
    (mt/with-temp [:model/Card card {:dataset_query (venues-query)}]
      (let [target (mapping-targets/target-for-field card {:id "p1" :type "number/="} (mt/id :venues :price))]
        (is (= :dimension (first target)))
        (testing "and it round-trips through the codebase's own target resolver"
          (is (= (mt/id :venues :price)
                 (params/param-target->field-id target card))))))))

(deftest target-for-field-returns-nil-when-absent-test
  (testing "GHY-4147: a field the card does not expose yields nil, so the caller can teach"
    (mt/with-temp [:model/Card card {:dataset_query (venues-query)}]
      (is (nil? (mapping-targets/target-for-field card
                                                  {:id "p1" :type "string/="}
                                                  (mt/id :users :name)))))))

(deftest native-card-exposes-template-tags-test
  (testing "GHY-4147: a native card's targets are its template tags, typed by tag kind"
    (mt/with-temp [:model/Card card {:dataset_query
                                     (mt/native-query
                                      {:query "SELECT * FROM VENUES WHERE PRICE = {{price}}"
                                       :template-tags {"price" {:id "t1" :name "price"
                                                                :display-name "Price"
                                                                :type :number}}})}]
      (let [targets (mapping-targets/valid-targets card {:id "p1" :type "number/="})]
        (is (= [[:variable [:template-tag "price"]]] (mapv :target targets)))))))

(deftest native-dimension-tag-test
  (testing "GHY-4147: a native dimension tag is a dimension target, not a variable"
    (mt/with-temp [:model/Card card {:dataset_query
                                     (mt/native-query
                                      {:query "SELECT * FROM VENUES WHERE {{cat}}"
                                       :template-tags {"cat" {:id "t2" :name "cat"
                                                              :display-name "Cat"
                                                              :type :dimension
                                                              :widget-type :string/=
                                                              :dimension [:field (mt/id :venues :name) nil]}}})}]
      (let [targets (mapping-targets/valid-targets card {:id "p1" :type "string/="})]
        (is (= [[:dimension [:template-tag "cat"]]] (mapv :target targets)))))))

(deftest incompatible-parameter-type-yields-no-targets-test
  (testing "GHY-4147: a date parameter finds no target on a card exposing only a number variable"
    (mt/with-temp [:model/Card card {:dataset_query
                                     (mt/native-query
                                      {:query "SELECT * FROM VENUES WHERE PRICE = {{price}}"
                                       :template-tags {"price" {:id "t1" :name "price"
                                                                :display-name "Price"
                                                                :type :number}}})}]
      (is (empty? (mapping-targets/valid-targets card {:id "p1" :type "date/all-options"}))))))

(def ^:private tagged-native-card
  {:id 9
   :dataset_query
   {:database 1
    :type     :native
    :native   {:query "SELECT 1 WHERE {{cat}} AND total > {{min}} /* {{unit}} {{snippet: base}} */"
               :template-tags
               {"cat"           {:id "u1" :name "cat" :display-name "Category" :type :dimension
                                 :dimension [:field 18 nil] :widget-type :string/=}
                "min"           {:id "u2" :name "min" :display-name "Min" :type :number}
                "unit"          {:id "u3" :name "unit" :display-name "Unit" :type :temporal-unit
                                 :dimension [:field 22 nil]}
                "snippet: base" {:id "u4" :name "snippet: base" :display-name "base" :type :snippet
                                 :snippet-name "base"}}}}})

(deftest template-tag-types-test
  (testing "the stored tags map to their type keywords, one malformed snippet tag notwithstanding"
    (is (= {"cat" :dimension "min" :number "unit" :temporal-unit "snippet: base" :snippet}
           (mapping-targets/template-tag-types tagged-native-card))))
  (testing "a card with no native query has no tags"
    (is (= {} (mapping-targets/template-tag-types {:dataset_query {:database 1 :type :query :query {}}})))
    (is (= {} (mapping-targets/template-tag-types {})))))

(deftest target-for-tag-test
  (testing "field-filter and temporal-unit tags take a :dimension target, raw variables a :variable one"
    (is (= [:dimension [:template-tag "cat"]] (mapping-targets/target-for-tag "cat" :dimension)))
    (is (= [:dimension [:template-tag "unit"]] (mapping-targets/target-for-tag "unit" :temporal-unit)))
    (is (= [:variable [:template-tag "min"]] (mapping-targets/target-for-tag "min" :number)))
    (is (= [:variable [:template-tag "flag"]] (mapping-targets/target-for-tag "flag" :boolean))))
  (testing "reference tags cannot back a parameter"
    (is (nil? (mapping-targets/target-for-tag "snippet: base" :snippet)))
    (is (nil? (mapping-targets/target-for-tag "#42" :card)))))

(deftest wireable-target-template-tags-test
  (let [parameter {:id "p1" :type "string/="}]
    (testing "a template-tag target is wireable when the tag exists and the clause head matches its kind"
      (is (true?  (mapping-targets/wireable-target? tagged-native-card parameter [:dimension [:template-tag "cat"]])))
      (is (true?  (mapping-targets/wireable-target? tagged-native-card parameter [:variable [:template-tag "min"]]))))
    (testing "a kind mismatch, a missing tag, and a reference tag are all unwireable"
      (is (false? (mapping-targets/wireable-target? tagged-native-card parameter [:variable [:template-tag "cat"]])))
      (is (false? (mapping-targets/wireable-target? tagged-native-card parameter [:dimension [:template-tag "min"]])))
      (is (false? (mapping-targets/wireable-target? tagged-native-card parameter [:dimension [:template-tag "ghost"]])))
      (is (false? (mapping-targets/wireable-target? tagged-native-card parameter [:variable [:template-tag "snippet: base"]]))))))

(deftest wireable-target-dimension-refs-test
  (testing "a field-ref dimension target is wireable exactly when the card exposes that field"
    (mt/with-temp [:model/Card card {:dataset_query (venues-query)}]
      (let [parameter {:id "p1" :type "string/="}
            name-field-id (mt/id :venues :name)]
        (is (true?  (mapping-targets/wireable-target? card parameter [:dimension [:field name-field-id nil]])))
        (is (false? (mapping-targets/wireable-target? card parameter [:dimension [:field Integer/MAX_VALUE nil]])))))))
