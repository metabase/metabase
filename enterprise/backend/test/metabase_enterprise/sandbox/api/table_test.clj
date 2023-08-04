(ns metabase-enterprise.sandbox.api.table-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]
   [metabase.util :as u]))

(def ^:private all-columns
  #{"CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"})

(defn- field-names [test-user]
  (let [{:keys [fields], :as response} (mt/user-http-request
                                        test-user :get 200
                                        (format "table/%d/query_metadata" (mt/id :venues)))]
    (if (seq fields)
      (set (map (comp u/upper-case-en :name) fields))
      response)))

(deftest query-metadata-test
  (testing "GET /api/table/:id/query_metadata"
    (met/with-gtaps {:gtaps      {:venues
                                  {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                   :query      (mt.tu/restricted-column-query (mt/id))}}
                     :attributes {:cat 50}}
      (testing "Users with restricted access to the columns of a table should only see columns included in the GTAP question"
        (is (= #{"CATEGORY_ID" "ID" "NAME"}
               (field-names :rasta))))

      (testing "Users with full permissions should not be affected by this field filtering"
        (is (= all-columns
               (field-names :crowberto)))))))

(deftest query-metadata-sandbox-without-restricted-columns-test
  (testing "GET /api/table/:id/query_metadata"
    (testing (str "If a GTAP has a question, but that question doesn't include a clause to restrict the columns that "
                  "are returned, all fields should be returned")
      (met/with-gtaps {:gtaps      {:venues {:query      (mt/mbql-query venues)
                                             :remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                       :attributes {:cat 50}}
        (is (= all-columns
               (field-names :rasta)))))))

(deftest query-metadata-sandbox-without-query-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "Make sure the endpoint doesn't blow up if the sandbox doesn't have a query associated with it"
      (met/with-gtaps {:gtaps {:venues {}}}
        (is (= all-columns
               (field-names :rasta)))))))
