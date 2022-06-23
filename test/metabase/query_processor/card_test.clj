(ns metabase.query-processor.card-test
  "There are more e2e tests in [[metabase.api.card-test]]."
  (:require [clojure.test :refer :all]
            [metabase.api.common :as api]
            [metabase.models :refer [Card Dashboard Database]]
            [metabase.models.query :as query]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [metabase.query-processor.card :as qp.card]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]))

(defn run-query-for-card
  "Run query for Card synchronously."
  [card-id]
  ;; TODO -- we shouldn't do the perms checks if there is no current User context. It seems like API-level perms check
  ;; stuff doesn't belong in the Dashboard QP namespace
  (binding [api/*current-user-permissions-set* (atom #{"/"})]
    (qp.card/run-query-for-card-async
     card-id :api
     :run (fn [query info]
            (qp/process-query (assoc query :async? false) info)))))

(deftest query-cache-ttl-hierarchy-test
  (mt/discard-setting-changes [enable-query-caching]
    (public-settings/enable-query-caching! true)
    (testing "query-magic-ttl converts to seconds correctly"
      (mt/with-temporary-setting-values [query-caching-ttl-ratio 2]
        ;; fake average execution time (in millis)
        (with-redefs [query/average-execution-time-ms (constantly 4000)]
          (mt/with-temp Card [card]
            ;; the magic multiplier should be ttl-ratio times avg execution time
            (is (= (* 2 4) (:cache-ttl (#'qp.card/query-for-card card {} {} {}))))))))
    (testing "card ttl only"
      (mt/with-temp* [Card [card {:cache_ttl 1337}]]
        (is (= (* 3600 1337) (:cache-ttl (#'qp.card/query-for-card card {} {} {}))))))
    (testing "multiple ttl, dash wins"
      (mt/with-temp* [Database [db {:cache_ttl 1337}]
                      Dashboard [dash {:cache_ttl 1338}]
                      Card [card {:database_id (u/the-id db)}]]
        (is (= (* 3600 1338) (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
    (testing "multiple ttl, db wins"
      (mt/with-temp* [Database [db {:cache_ttl 1337}]
                      Dashboard [dash]
                      Card [card {:database_id (u/the-id db)}]]
        (is (= (* 3600 1337) (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
    (testing "no ttl, nil res"
      (mt/with-temp* [Database [db]
                      Dashboard [dash]
                      Card [card {:database_id (u/the-id db)}]]
        (is (= nil (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))))

(defn- field-filter-query []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"date" {:id           "_DATE_"
                                      :name         "date"
                                      :display-name "Check-In Date"
                                      :type         :dimension
                                      :dimension    [:field (mt/id :checkins :date) nil]
                                      :widget-type  :date/all-options}}
              :query         "SELECT count(*)\nFROM CHECKINS\nWHERE {{date}}"}})

(defn- non-field-filter-query []
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

(deftest card-template-tags-test
  (testing "Card with a Field filter parameter"
    (mt/with-temp Card [card {:dataset_query (field-filter-query)}]
      (is (= {"date" :date/all-options, "_DATE_" :date/all-options}
             (#'qp.card/card-template-tags card)))))
  (testing "Card with a non-Field-filter parameter"
    (mt/with-temp Card [card {:dataset_query (non-field-filter-query)}]
      (is (= {"id" :number, "_ID_" :number}
             (#'qp.card/card-template-tags card)))))
  (testing "Should ignore native query snippets and source card IDs"
    (mt/with-temp Card [card {:dataset_query (assoc (non-field-filter-query)
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
                                                     :snippet-id   1})}]
      (is (= {"id" :number, "_ID_" :number}
             (#'qp.card/card-template-tags card))))))

(deftest infer-parameter-name-test
  (is (= "my_param"
         (#'qp.card/infer-parameter-name {:name "my_param", :target [:variable [:template-tag :category]]})))
  (is (= "category"
         (#'qp.card/infer-parameter-name {:target [:variable [:template-tag :category]]})))
  (is (= nil
         (#'qp.card/infer-parameter-name {:target [:field 1000 nil]}))))

(deftest validate-card-template-tag-test
  (mt/with-temp Card [{card-id :id} {:dataset_query (field-filter-query)}]
    (testing "Should disallow parameters that aren't actually part of the Card"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid parameter: Card [\d,]+ does not have a template tag with the ID \"_FAKE_\" or name \"fake\""
           (#'qp.card/validate-card-parameters card-id [{:id    "_FAKE_"
                                                         :name  "fake"
                                                         :type  :date/single
                                                         :value "2016-01-01"}])))
      (testing "As an API request"
        (is (schema= {:message            #"Invalid parameter: Card [\d,]+ does not have a template tag with the ID \"_FAKE_\" or name \"fake\""
                      :invalid-parameter  (s/eq {:id "_FAKE_", :name "fake", :type "date/single", :value "2016-01-01"})
                      :allowed-parameters (s/eq ["_DATE_" "date"])
                      s/Keyword           s/Any}
                     (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                           {:parameters [{:id    "_FAKE_"
                                                          :name  "fake"
                                                          :type  :date/single
                                                          :value "2016-01-01"}]})))))

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
                         (validate disallowed-type))))))))))

    (testing "Happy path -- API request should succeed if parameter correlates to a template tag by ID"
      (is (= [1000]
             (mt/first-row (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                                 {:parameters [{:id    "_DATE_"
                                                                :type  :date/single
                                                                :value "2016-01-01"}]})))))

    (testing "Happy path -- API request should succeed if parameter correlates to a template tag by name"
      (is (= [1000]
             (mt/first-row (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                                 {:parameters [{:name  "date"
                                                                :type  :date/single
                                                                :value "2016-01-01"}]})))))))

(deftest validate-card-parameters-test
  (mt/with-temp Card [{card-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})
                                     :parameters [{:id   "_DATE_"
                                                   :type "date/single"
                                                   :name "Date"
                                                   :slug "DATE"}]}]
    (testing "API request should fail if request parameter does not contain ID"
      (is (schema= {:message            #"Invalid parameter: missing id"
                    :invalid-parameter  (s/eq {:name "date", :type "date/single", :value "2016-01-01"})
                    :allowed-parameters (s/eq ["_DATE_"])
                    s/Keyword           s/Any}
                   (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                         {:parameters [{:name  "date"
                                                        :type  "date/single"
                                                        :value "2016-01-01"}]}))))

    (testing "API request should fail if request parameter ID does not exist on the card"
      (is (schema= {:message            #"Invalid parameter: Card [\d,]+ does not have a parameter with the ID \"_FAKE_\"."
                    :invalid-parameter  (s/eq {:name "date", :id "_FAKE_" :type "date/single", :value "2016-01-01"})
                    :allowed-parameters (s/eq ["_DATE_"])
                    s/Keyword           s/Any}
                   (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                         {:parameters [{:id    "_FAKE_"
                                                        :name  "date"
                                                        :type  "date/single"
                                                        :value "2016-01-01"}]}))))

    (testing "Happy path -- API request should succeed if request parameter correlates to a card parameter by ID"
      (is (= [1000]
             (mt/first-row (mt/user-http-request :rasta :post (format "card/%d/query" card-id)
                                                 {:parameters [{:id    "_DATE_"
                                                                :type  "date/single"
                                                                :value "2016-01-01"}]})))))))
