(ns metabase-enterprise.api.table-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.table-test :as oss-test]
   [metabase.test :as mt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DELETE /api/table/:id
;;; +----------------------------------------------------------------------------------------------------------------+

(def delete-url "ee/uploads/")

(deftest delete-csv-test
  (mt/test-driver :h2
    (mt/with-empty-db
     (testing "Behind a feature flag"
       (is (str/starts-with? (mt/user-http-request :crowberto :delete 402 delete-url)
                             "Uploads is a paid feature not currently available to your instance.")))

     (mt/with-premium-features #{:uploads}
       (testing "Requires at least one id"
         (mt/with-temporary-setting-values [uploads-enabled true]
           (is (=? {:id #(str/starts-with? (first %) "invalid type")}
                   (:specific-errors (mt/user-http-request :crowberto :delete 400 delete-url))))))

       (mt/with-temporary-setting-values [uploads-enabled true]
         (testing "Happy path - single"
           (let [table-id (:id (oss-test/create-csv!))]
             (is (= {:not-found [], :deleted [table-id]}
                    (mt/user-http-request :crowberto :delete 200 delete-url :id table-id)))))

         (testing "Happy path - multiple"
           (let [table-id-1 (:id (oss-test/create-csv!))
                 table-id-2 (:id (oss-test/create-csv!))
                 table-ids  [table-id-1 table-id-2]]
             (is (= {:not-found [], :deleted table-ids}
                    (mt/user-http-request :crowberto :delete 200 delete-url :id table-ids))))))

       (testing "Failure paths return an appropriate status code and a message in the body"
         (mt/with-temporary-setting-values [uploads-enabled false]
           (let [table-id (:id (oss-test/create-csv!))]
             (is (= {:deleted [], :message "Uploads are not enabled."}
                    (mt/user-http-request :crowberto :delete 422 delete-url :id table-id))))))))))
