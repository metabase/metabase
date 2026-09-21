(ns metabase.upload.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
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

(def ^:private multipart-request-options
  {:request-options {:headers {"content-type" "multipart/form-data"}}})

(deftest csv-upload-too-large-test
  (testing "POST /api/upload/csv rejects a file over the size cap with a 413"
    ;; One byte over the cap is enough: the multipart middleware aborts streaming the file part as soon as it
    ;; crosses the limit, so the oversized body is never fully buffered.
    (let [oversized (byte-array (inc upload/max-upload-size-bytes))
          calls     (atom 0)]
      (mt/with-dynamic-fn-redefs [upload.api/from-csv! (fn [& _] (swap! calls inc) {:status 200})]
        (is (= "Uploaded content exceeded limits."
               (mt/user-http-request :crowberto :post 413 "upload/csv" multipart-request-options
                                     {:file oversized})))
        (is (zero? @calls) "the endpoint body should never run")))))

(deftest csv-upload-at-size-cap-test
  (testing "POST /api/upload/csv accepts a file of exactly the size cap"
    (let [at-cap (byte-array upload/max-upload-size-bytes)
          calls  (atom 0)]
      ;; like the real handler, the stub owns the uploaded tempfile and must delete it
      (mt/with-dynamic-fn-redefs [upload.api/from-csv! (fn [{:keys [file]}]
                                                         (swap! calls inc)
                                                         (io/delete-file file :silently)
                                                         {:status 200, :body 1})]
        (mt/user-http-request :crowberto :post 200 "upload/csv" multipart-request-options
                              [[:collection_id "root"]
                               [:file at-cap]])
        (is (= 1 @calls) "the endpoint body should run")))))

(deftest csv-upload-too-many-parts-test
  (testing "POST /api/upload/csv rejects too many multipart parts with a 413"
    (let [calls (atom 0)]
      (mt/with-dynamic-fn-redefs [upload.api/from-csv! (fn [& _] (swap! calls inc) {:status 200})]
        (is (= "Uploaded content exceeded limits."
               (mt/user-http-request :crowberto :post 413 "upload/csv" multipart-request-options
                                     [[:collection_id "root"]
                                      [:file (byte-array [97 44 98 10 49 44 50])]
                                      [:file (byte-array [99 44 100 10 51 44 52])]])))
        (is (zero? @calls) "the endpoint body should never run")))))

(deftest csv-upload-with-collection-id-test
  (testing "POST /api/upload/csv accepts the collection_id field the frontend sends alongside the file"
    (let [calls (atom 0)]
      ;; like the real handler, the stub owns the uploaded tempfile and must delete it
      (mt/with-dynamic-fn-redefs [upload.api/from-csv! (fn [{:keys [file]}]
                                                         (swap! calls inc)
                                                         (io/delete-file file :silently)
                                                         {:status 200, :body 1})]
        (mt/user-http-request :crowberto :post 200 "upload/csv" multipart-request-options
                              [[:collection_id "root"]
                               [:file (byte-array [97 44 98 10 49 44 50])]])
        (is (= 1 @calls) "the endpoint body should run")))))

(deftest csv-upload-smuggled-file-part-test
  (testing "POST /api/upload/csv rejects a second file part smuggled as collection_id"
    (let [calls (atom 0)]
      (mt/with-dynamic-fn-redefs [upload.api/from-csv! (fn [& _] (swap! calls inc) {:status 200})]
        (let [response (mt/user-http-request :crowberto :post 400 "upload/csv" multipart-request-options
                                             [[:file (byte-array [97 44 98 10 49 44 50])]
                                              [:collection_id (byte-array [99 44 100 10 51 44 52])]])]
          (testing "the validation error does not leak the tempfile path"
            (is (not (str/includes? (pr-str response) "ring-multipart-")))))
        (is (zero? @calls) "the endpoint body should never run")))))
