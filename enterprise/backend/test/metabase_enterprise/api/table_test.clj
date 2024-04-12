(ns metabase-enterprise.api.table-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.table-test :as oss-test]
   [metabase.test :as mt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DELETE /api/table/:id
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- table-url [table]
  (str "ee/uploads/table/" (:id table)))

(deftest delete-csv-test
  (mt/test-driver :h2
    (mt/with-empty-db
     (testing "Behind a feature"
       (is (str/starts-with? (mt/user-http-request :crowberto :delete 402 (table-url {:id 1234}))
                             "Uploads is a paid feature not currently available to your instance.")))
     (mt/with-premium-features #{:uploads}
       (testing "Happy path"
         (let [table (oss-test/create-csv!)]
           (mt/with-temporary-setting-values [uploads-enabled true]
             (is (= true (mt/user-http-request :crowberto :delete 200 (table-url table)))))))
       (testing "Failure paths return an appropriate status code and a message in the body"
         (let [table (oss-test/create-csv!)]
           (mt/with-temporary-setting-values [uploads-enabled false]
             (is (= {:message "Uploads are not enabled."}
                    (mt/user-http-request :crowberto :delete 422 (table-url table)))))))))))
