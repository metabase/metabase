(ns metabase.upload.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.upload.api :as upload.api]
   [metabase.upload.impl-test :as upload-test]
   [toucan2.core :as t2]))

(defn- upload-example-csv-via-api!
  "Upload a small CSV file to the given collection ID. Default args can be overridden"
  [& {:as args}]
  (mt/with-current-user (mt/user->id :rasta)
    (let [;; Make the file-name unique so the table names don't collide
          filename (str "example csv file " (random-uuid) ".csv")
          file     (upload-test/csv-file-with
                    ["id, name"
                     "1, Luke Skywalker"
                     "2, Darth Vader"]
                    filename)]
      (mt/with-current-user (mt/user->id :crowberto)
        (@#'upload.api/from-csv! (merge {:collection-id nil ;; root collection
                                         :filename      filename
                                         :file          file}
                                        args))))))

(deftest from-csv-test
  (mt/test-driver :h2
    (mt/with-empty-db
      (testing "Happy path"
        (t2/update! :model/Database (mt/id) {:uploads_enabled true :uploads_schema_name "PUBLIC" :uploads_table_prefix nil})
        (let [{:keys [status body]} (upload-example-csv-via-api!)]
          (is (= 200
                 status))
          (is (= body
                 (t2/select-one-pk :model/Card :database_id (mt/id)))))))))
