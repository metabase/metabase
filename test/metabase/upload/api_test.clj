(ns metabase.upload.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.upload.api :as upload.api]
   [metabase.upload.core :as upload]
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

(deftest csv-upload-too-large-test
  (testing "POST /api/upload/csv rejects files over the size cap with a 413, before the body reaches the handler"
    ;; one byte over the cap is enough — the multipart layer aborts streaming the file part as soon as it passes the
    ;; limit, so this never buffers the whole body.
    (let [oversized (byte-array (inc upload/max-upload-size-bytes))]
      (is (= "Uploaded content exceeded limits."
             (mt/user-http-request :crowberto :post 413 "upload/csv"
                                   {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                   {:file oversized}))))))
