(ns metabase-enterprise.sandbox.api.table-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase-enterprise.sandbox.test-util :as mt.tu]
            [metabase.test :as mt]))

(def ^:private all-columns
  #{"CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"})

(deftest query-metadata-test
  (testing "GET /api/table/:id/query_metadata"
    (letfn [(field-names [test-user]
              (let [{:keys [fields], :as response} (mt/user-http-request
                                                    test-user :get 200
                                                    (format "table/%d/query_metadata" (mt/id :venues)))]
                (if (seq fields)
                  (set (map (comp str/upper-case :name) fields))
                  response)))]
      (mt/with-gtaps {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field-id (mt/id :venues :category_id)]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
        (testing "Users with restricted access to the columns of a table should only see columns included in the GTAP question"
          (is (= #{"CATEGORY_ID" "ID" "NAME"}
                 (field-names :rasta))))

        (testing "Users with full permissions should not be affected by this field filtering"
          (is (= all-columns
                 (field-names :crowberto)))))

      (testing (str "If a GTAP has a question, but that question doesn't include a clause to restrict the columns that "
                    "are returned, all fields should be returned")
        (mt/with-gtaps {:gtaps      {:venues {:query      (mt/mbql-query venues)
                                              :remappings {:cat [:variable [:field-id (mt/id :venues :category_id)]]}}}
                        :attributes {:cat 50}}
          (is (= all-columns
                 (field-names :rasta))))))))
