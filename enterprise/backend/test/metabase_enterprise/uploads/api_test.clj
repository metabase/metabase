(ns metabase-enterprise.uploads.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.table-test :as oss-test]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def list-url "ee/uploads")

(deftest list-uploaded-tables-test
  (testing "GET ee/uploads/"
    (testing "These should come back in alphabetical order and include relevant metadata"
      (mt/with-premium-features #{:uploads}
        (oss-test/with-tables-as-uploads [:categories :reviews]
          (t2.with-temp/with-temp [:model/Card {} {:table_id (mt/id :categories)}
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

(defn- delete-url [table-id]
  (str "ee/uploads/" table-id))

(defn- listed-table-ids []
  (into #{} (map :id) (mt/user-http-request :crowberto :get 200 list-url)))

(deftest delete-csv-test
  (testing "DELETE ee/uploads/:id"
    (mt/test-driver :h2
      (mt/with-empty-db
       (testing "Behind a feature flag"
         (is (str/starts-with? (mt/user-http-request :crowberto :delete 402 (delete-url 1))
                               "Upload Maintenance is a paid feature not currently available to your instance.")))

       (mt/with-premium-features #{:uploads}
         (testing "Happy path\n"
           (let [table-id (:id (oss-test/create-csv!))]
             (testing "We can see the table in the list"
               (is (contains? (listed-table-ids) table-id)))
             (testing "We can make a successful call to delete the table"
               (is (true? (mt/user-http-request :crowberto :delete 200 (delete-url table-id)))))
             (testing "The table is gone from the list"
               (is (not (contains? (listed-table-ids) table-id))))))

         (testing "Uploads may be deleted even when *uploading* has been disabled"
           (mt/with-temporary-setting-values [uploads-enabled false]
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
               (is (contains? (listed-table-ids) table-id))))))))))
