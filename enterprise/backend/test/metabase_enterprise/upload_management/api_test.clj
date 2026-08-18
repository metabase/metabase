(ns metabase-enterprise.upload-management.api-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.upload.core :as upload]
   [metabase.upload.impl-test :as upload-test]
   [metabase.warehouse-schema-rest.api.table-test :as oss-test]
   [toucan2.core :as t2]))

(def list-url "ee/upload-management/tables")

(deftest list-uploaded-tables-test
  (testing "GET ee/upload-management/tables"
    (testing "These should come back in alphabetical order and include relevant metadata"
      (mt/with-premium-features #{:upload-management}
        (oss-test/with-tables-as-uploads [:categories :reviews]
          (mt/with-temp [:model/Card {} {:table_id (mt/id :categories)}
                         :model/Card {} {:table_id (mt/id :reviews)}
                         :model/Card {} {:table_id (mt/id :reviews)}]
            (let [result (mt/user-http-request :rasta :get 200 list-url)]
              ;; =? doesn't currently know how to treat sets as literals, only as predicates, so we can't use it.
              ;; See https://github.com/metabase/hawk/issues/23
              (is (every? t/offset-date-time? (map :created_at result)))
              (is (= #{{:name         (mt/format-name "categories")
                        :display_name "Categories"
                        :id           (mt/id :categories)
                        :schema       "PUBLIC"
                        :entity_type  "entity/GenericTable"}
                       {:name         (mt/format-name "reviews")
                        :display_name "Reviews"
                        :id           (mt/id :reviews)
                        :schema       "PUBLIC"
                        :entity_type  "entity/GenericTable"}}
                     (->> result
                          (filter #(= (:db_id %) (mt/id)))  ; prevent stray tables from affecting unit test results
                          (map #(select-keys % [:name :display_name :id :entity_type :schema :usage_count]))
                          set))))))))))

(deftest list-uploaded-tables-no-duplicates-test
  (testing "GET ee/upload-management/tables should not return duplicates for tables in attached DWH"
    (testing "Tables with is_upload=true in attached DWH should only appear once (not duplicated)"
      (mt/with-premium-features #{:upload-management :attached-dwh}
        (mt/with-temp [:model/Database {dwh-db-id :id} {:is_attached_dwh true}
                       ;; Table in attached DWH with is_upload=true - should appear once, not twice
                       :model/Table {upload-table-id :id} {:db_id dwh-db-id :is_upload true :active true :name "uploaded_table"}
                       ;; Table in attached DWH without is_upload - should also appear
                       :model/Table {non-upload-table-id :id} {:db_id dwh-db-id :is_upload false :active true :name "non_upload_table"}]
          (let [result (mt/user-http-request :crowberto :get 200 list-url)
                dwh-table-ids (->> result
                                   (filter #(= (:db_id %) dwh-db-id))
                                   (map :id))]
            (testing "Both tables should be in the result"
              (is (contains? (set dwh-table-ids) upload-table-id))
              (is (contains? (set dwh-table-ids) non-upload-table-id)))
            (testing "Upload table should appear exactly once (no duplicates)"
              (is (= 1 (count (filter #(= % upload-table-id) dwh-table-ids)))))
            (testing "Non-upload table should appear exactly once"
              (is (= 1 (count (filter #(= % non-upload-table-id) dwh-table-ids)))))))))))

(defn- delete-url [table-id]
  (str "ee/upload-management/tables/" table-id))

(defn- listed-table-ids []
  (into #{} (map :id) (mt/user-http-request :crowberto :get 200 list-url)))

(deftest delete-csv-test
  (testing "DELETE ee/upload-management/:id"
    (mt/test-driver :h2
      (mt/with-empty-db
        (upload-test/with-uploads-enabled!
          (testing "Behind a feature flag"
            (mt/with-premium-features #{} ;; not :upload-management
              (mt/assert-has-premium-feature-error "Upload Management" (mt/user-http-request :crowberto :delete 402 (delete-url 1)))))
          (mt/with-premium-features #{:upload-management}
            (testing "Happy path\n"
              (let [table-id (:id (oss-test/create-csv!))]
                (testing "We can see the table in the list"
                  (is (contains? (listed-table-ids) table-id)))
                (testing "We can make a successful call to delete the table"
                  (is (true? (mt/user-http-request :crowberto :delete 200 (delete-url table-id)))))
                (testing "The table is gone from the list"
                  (is (not (contains? (listed-table-ids) table-id))))))
            (testing "Uploads may be deleted even when *uploading* has been disabled"
              (upload-test/with-uploads-disabled!
                (let [table-id (:id (oss-test/create-csv!))]
                  (is (true? (mt/user-http-request :crowberto :delete 200 (delete-url table-id)))))))
            (testing "The table must be uploaded"
              (mt/with-temp [:model/Table {table-id :id}]
                (is (= {:message "The table must be an uploaded table."}
                       (mt/user-http-request :rasta :delete 422 (delete-url table-id))))))
            (testing "Write permissions to the table are required to delete it\n"
              (let [table-id (:id (oss-test/create-csv!))]
                (testing "The delete request is rejected"
                  (is (= {:message "You don't have permissions to do that."}
                         (mt/user-http-request :rasta :delete 403 (delete-url table-id)))))
                (testing "The table remains in the list"
                  (is (contains? (listed-table-ids) table-id)))))
            (testing "The archive_cards argument is passed through"
              (let [passed-value (atom nil)]
                (mt/with-dynamic-fn-redefs [upload/delete-upload! (fn [_ & {:keys [archive-cards?]}]
                                                                    (reset! passed-value archive-cards?)
                                                                    :done)]
                  (let [table-id (:id (oss-test/create-csv!))]
                    (is (mt/user-http-request :crowberto :delete 200 (delete-url table-id) :archive-cards true))
                    (is (true? @passed-value))))))))))))

(defn- physical-table-exists? [table-name]
  (-> (jdbc/query one-off-dbs/*conn*
                  ["SELECT count(*) AS c FROM information_schema.tables WHERE upper(table_name) = upper(?)"
                   table-name])
      first :c pos?))

(deftest ^:synchronized delete-attached-dwh-table-permissions-test
  (testing "DELETE ee/upload-management/tables/:id on an attached-DWH database"
    ;; For an attached-DWH database `can-delete-error` used to short-circuit and skip ALL access control, letting any
    ;; authenticated user drop any table on the attached DWH (even a non-upload table they cannot write). Managing
    ;; those tables (google-sheets uploads) is superuser-only, so a non-superuser delete must be rejected.
    (mt/with-premium-features #{:attached-dwh :upload-management}
      (one-off-dbs/with-blank-db
        (jdbc/execute! one-off-dbs/*conn* ["CREATE TABLE secret_dwh (id INTEGER, secret TEXT);"])
        (jdbc/execute! one-off-dbs/*conn* ["INSERT INTO secret_dwh VALUES (1, 'topsecret');"])
        (sync/sync-database! (data/db))
        (t2/update! :model/Database (data/id) {:is_attached_dwh true})
        (let [table (t2/select-one :model/Table :db_id (data/id) :name "SECRET_DWH")]
          (testing "preconditions: not an upload, rasta has no write permission, table physically present"
            (is (false? (:is_upload table)))
            (is (not (mt/with-test-user :rasta (mi/can-write? table))))
            (is (physical-table-exists? "secret_dwh")))
          (testing "a non-superuser delete is rejected and the table is not dropped"
            (is (= {:message "You don't have permissions to do that."}
                   (mt/user-http-request :rasta :delete 403 (delete-url (:id table)))))
            (is (physical-table-exists? "secret_dwh")
                "SECRET_DWH must still exist in the warehouse after a non-privileged delete attempt")
            (is (t2/select-one-fn :active :model/Table :id (:id table))
                "the Metabase Table must still be active after a non-privileged delete attempt"))
          (testing "a superuser can still delete an attached-DWH table (gsheets-upload management path)"
            (is (true? (mt/user-http-request :crowberto :delete 200 (delete-url (:id table)))))
            (is (not (physical-table-exists? "secret_dwh"))
                "the warehouse table is dropped for a superuser")
            (is (false? (t2/select-one-fn :active :model/Table :id (:id table))))))))))
