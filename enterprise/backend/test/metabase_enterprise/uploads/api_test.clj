(ns metabase-enterprise.uploads.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   ;; TODO move to a shared namespace rather? I don't like depending on another test namespace
   [metabase.api.table-test :as oss-test]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DELETE /api/table/:id
;;; +----------------------------------------------------------------------------------------------------------------+

(defn delete-url [table-id]
  (str "ee/uploads/" table-id))

;; TODO use list API to show it existing before and after

(deftest delete-csv-test
  (mt/test-driver :h2
    (mt/with-empty-db
     (testing "Behind a feature flag"
       (is (str/starts-with? (mt/user-http-request :crowberto :delete 402 (delete-url 1))
                             "Upload Maintenance is a paid feature not currently available to your instance.")))

     (mt/with-premium-features #{:uploads}
       (testing "Happy path"
         (let [table-id (:id (oss-test/create-csv!))]
           (is (true? (mt/user-http-request :crowberto :delete 200 (delete-url table-id))))))

       (testing "Uploads may be deleted even when *uploading* has been disabled"
         (mt/with-temporary-setting-values [uploads-enabled false]
           (let [table-id (:id (oss-test/create-csv!))]
             (is (true? (mt/user-http-request :crowberto :delete 200 (delete-url table-id)))))))

       (testing "The table must be uploaded"
         (let [table-id (:id (oss-test/create-csv!))]
           (t2/update! :model/Table :id table-id {:is_upload false})
           (is (= {:message "The table must be an uploaded table."}
                  (mt/user-http-request :rasta :delete 422 (delete-url table-id))))))

       (testing "Write permissions to the table are required to delete it"
         (let [table-id (:id (oss-test/create-csv!))]
           (is (= {:message "You don't have permissions to do that."}
                  (mt/user-http-request :rasta :delete 403 (delete-url table-id))))))))))
