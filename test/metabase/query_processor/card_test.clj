(ns metabase.query-processor.card-test
  "There are more e2e tests in [[metabase.api.card-test]]."
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn run-query-for-card
  "Run query for Card synchronously."
  [card-id]
  ;; TODO -- we shouldn't do the perms checks if there is no current User context. It seems like API-level perms check
  ;; stuff doesn't belong in the Dashboard QP namespace
  (binding [api/*current-user-permissions-set* (atom #{"/"})]
    (qp.card/process-query-for-card
     card-id :api
     :run (fn [query info]
            (qp/process-query (assoc query :info info))))))

(defn field-filter-query
  "A query with a Field Filter parameter"
  []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"date" {:id           "_DATE_"
                                      :name         "date"
                                      :display-name "Check-In Date"
                                      :type         :dimension
                                      :dimension    [:field (mt/id :checkins :date) nil]
                                      :widget-type  :date/all-options}}
              :query         "SELECT count(*)\nFROM CHECKINS\nWHERE {{date}}"}})

(defn non-field-filter-query
  "A query with a parameter that is not a Field Filter"
  []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"id"
                              {:id           "_ID_"
                               :name         "id"
                               :display-name "Order ID"
                               :type         :number
                               :required     true
                               :default      "1"}}
              :query         "SELECT *\nFROM ORDERS\nWHERE id = {{id}}"}})

(defn non-parameter-template-tag-query
  "A query with template tags that aren't parameters"
  []
  (assoc (non-field-filter-query)
         "abcdef"
         {:id           "abcdef"
          :name         "#1234"
          :display-name "#1234"
          :type         :card
          :card-id      1234}

         "xyz"
         {:id           "xyz"
          :name         "snippet: My Snippet"
          :display-name "Snippet: My Snippet"
          :type         :snippet
          :snippet-name "My Snippet"
          :snippet-id   1}))

(deftest ^:parallel card-template-tag-parameters-test
  (testing "Card with a Field filter parameter"
    (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (field-filter-query)}]
      (is (= {"date" :date/all-options}
             (#'qp.card/card-template-tag-parameters card-id))))))

(deftest ^:parallel card-template-tag-parameters-test-2
  (testing "Card with a non-Field-filter parameter"
    (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (non-field-filter-query)}]
      (is (= {"id" :number}
             (#'qp.card/card-template-tag-parameters card-id))))))

(deftest ^:parallel card-template-tag-parameters-test-3
  (testing "Should ignore native query snippets and source card IDs"
    (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (non-parameter-template-tag-query)}]
      (is (= {"id" :number}
             (#'qp.card/card-template-tag-parameters card-id))))))

(deftest ^:parallel infer-parameter-name-test
  (is (= "my_param"
         (#'qp.card/infer-parameter-name {:name "my_param", :target [:variable [:template-tag :category]]})))
  (is (= "category"
         (#'qp.card/infer-parameter-name {:target [:variable [:template-tag :category]]})))
  (is (= nil
         (#'qp.card/infer-parameter-name {:target [:field 1000 nil]}))))

(deftest ^:parallel validate-card-parameters-test
  (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (field-filter-query)}]
    (testing "Should disallow parameters that aren't actually part of the Card"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid parameter: Card [\d,]+ does not have a template tag named \"fake\""
           (#'qp.card/validate-card-parameters card-id [{:id    "_FAKE_"
                                                         :name  "fake"
                                                         :type  :date/single
                                                         :value "2016-01-01"}]))))))

(deftest ^:parallel validate-card-parameters-test-2
  (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (field-filter-query)}]
    (testing "Should disallow parameters that aren't actually part of the Card"
      (testing "As an API request"
        (is (=? {:message            #"Invalid parameter: Card [\d,]+ does not have a template tag named \"fake\".+"
                 :invalid-parameter  {:id "_FAKE_", :name "fake", :type "date/single", :value "2016-01-01"}
                 :allowed-parameters ["date"]}
                (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                      {:parameters [{:id    "_FAKE_"
                                                     :name  "fake"
                                                     :type  :date/single
                                                     :value "2016-01-01"}]})))))))

(deftest ^:parallel validate-card-parameters-test-3
  (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (field-filter-query)}]
    (testing "Should disallow parameters with types not allowed for the widget type"
      (letfn [(validate [param-type]
                (#'qp.card/validate-card-parameters card-id [{:id    "_DATE_"
                                                              :name  "date"
                                                              :type  param-type
                                                              :value "2016-01-01"}]))]
        (testing "allowed types"
          (doseq [allowed-type #{:date/all-options :date :date/single :date/range}]
            (testing allowed-type
              (is (= nil
                     (validate allowed-type))))))
        (testing "disallowed types"
          (doseq [disallowed-type #{:number/= :category :id :string/does-not-contain}]
            (testing disallowed-type
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"Invalid parameter type :[^\s]+ for parameter \"date\".*/"
                   (validate disallowed-type)))
              (testing "should be ignored if `*allow-arbitrary-mbql-parameters*` is enabled"
                (binding [qp.card/*allow-arbitrary-mbql-parameters* true]
                  (is (= nil
                         (validate disallowed-type))))))))))))

(deftest ^:parallel validate-card-parameters-test-4
  (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (field-filter-query)}]
    (testing "Happy path -- API request should succeed if parameter is valid"
      (is (= [1000]
             (mt/first-row (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                                 {:parameters [{:id    "_DATE_"
                                                                :name  "date"
                                                                :type  :date/single
                                                                :value "2016-01-01"}]})))))))

(deftest ^:parallel bad-viz-settings-should-still-work-test
  (testing "We should still be able to run a query that has Card bad viz settings referencing a column not in the query (#34950)"
    (t2.with-temp/with-temp [:model/Card {card-id :id} {:dataset_query
                                                        (mt/mbql-query venues
                                                          {:aggregation [[:count]]})

                                                        :visualization_settings
                                                        {:column_settings {(json/generate-string
                                                                            [:ref [:field Integer/MAX_VALUE {:base-type :type/DateTime, :temporal-unit :month}]])
                                                                           {:date_abbreviate true
                                                                            :some_other_key  [:ref [:field Integer/MAX_VALUE {:base-type :type/DateTime, :temporal-unit :month}]]}}}}]
      (is (= [[100]]
             (mt/rows (run-query-for-card card-id)))))))
