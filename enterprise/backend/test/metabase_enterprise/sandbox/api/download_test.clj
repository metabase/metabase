(ns metabase-enterprise.sandbox.api.download-test
  (:require
   [clojure.data.csv :as csv]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest card-download-test
  (testing "POST /api/card/:id/query/csv should respect sandboxing"
    (mt/with-model-cleanup [:model/Card]
      (met/with-gtaps! (mt/$ids people
                         {:gtaps      {:people {:remappings {"state" [:dimension $people.state]}}}
                          :attributes {"state" "CA"}})
        (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query people)}]
          (data-perms/set-table-permission! &group (mt/id :people) :perms/download-results :one-million-rows)

          ;; Sanity check: admin can download full table
          (let [res (-> (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv" (u/the-id card)))
                        csv/read-csv)]
            (is (= 2501 (count res))))

          ;; Sandboxed user only downloads a subset (users in CA)
          (let [res (-> (mt/user-http-request :rasta :post 200 (format "card/%d/query/csv" (u/the-id card)))
                        csv/read-csv)]
            (is (= 91 (count res)))))))))
