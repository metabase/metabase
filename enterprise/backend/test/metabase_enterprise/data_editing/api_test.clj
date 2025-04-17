(ns metabase-enterprise.data-editing.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- table-rows [table-id]
  (mt/rows
   (qp/process-query
    {:database (mt/id)
     :type     :query
     :query    {:source-table table-id}})))

(defn- table-url [table-id]
  (format "ee/data-editing/table/%d" table-id))

(deftest feature-flag-required-test
  (mt/with-premium-features #{}
    (let [url (table-url 1)]
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 url))
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :put 402 url))
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :delete 402 url)))))

(deftest table-operations-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/with-empty-h2-app-db
      (let [db         (t2/select-one :model/Database (mt/id))
            driver     :h2
            table-name (str "temp_table_" (u/lower-case-en (random-uuid)))]

        (mt/with-actions-enabled
          (try
            (let [_        (driver/create-table! driver
                                                 (mt/id)
                                                 table-name
                                                 {:id   (driver/upload-type->database-type driver :metabase.upload/auto-incrementing-int-pk)
                                                  :name [:text]
                                                  :song  [:text]}
                                                 {:primary-key [:id]})
                  table    (sync/create-table! db
                                               {:name         table-name
                                                :schema       nil
                                                :display_name table-name})
                  _        (sync/sync-fields-for-table! db table)
                  table-id (:id table)
                  url      (table-url table-id)]

              (testing "Initially the table is empty"
                (is (= [] (table-rows table-id))))

              (testing "POST should insert new rows"
                (is (= {:created-rows [{:id 1 :name "Pidgey"     :song "Car alarms"}
                                       {:id 2 :name "Spearow"    :song "Hold music"}
                                       {:id 3 :name "Farfetch'd" :song "The land of lisp"}]}
                       (mt/user-http-request :crowberto :post 200 url
                                             {:rows [{:name "Pidgey"     :song "Car alarms"}
                                                     {:name "Spearow"    :song "Hold music"}
                                                     {:name "Farfetch'd" :song "The land of lisp"}]})))

                (is (= [[1 "Pidgey"     "Car alarms"]
                        [2 "Spearow"    "Hold music"]
                        [3 "Farfetch'd" "The land of lisp"]]
                       (table-rows table-id))))

              (testing "PUT should update the relevant rows and columns"
                (is (= {:rows-updated 2}
                       (mt/user-http-request :crowberto :put 200 url
                                             {:rows [{:id 1 :song "Join us now and share the software"}
                                                     {:id 2 :name "Speacolumn"}]})))

                (is (= [[1 "Pidgey"     "Join us now and share the software"]
                        [2 "Speacolumn" "Hold music"]
                        [3 "Farfetch'd" "The land of lisp"]]
                       (table-rows table-id))))

              (testing "DELETE should remove the corresponding rows"
                (is (= {:success true}
                       (mt/user-http-request :crowberto :delete 200 url
                                             {:rows [{:id 1}
                                                     {:id 2}]})))
                (is (= [[3 "Farfetch'd" "The land of lisp"]]
                       (table-rows table-id)))))

            (finally
              (try
                (driver/drop-table! driver (mt/id) table-name)
                (catch Exception _)))))))))
