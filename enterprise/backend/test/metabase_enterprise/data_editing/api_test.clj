(ns metabase-enterprise.data-editing.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (clojure.lang IDeref)
   (java.io Closeable)))

(set! *warn-on-reflection* true)

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

(defn- open-test-table!
  "Sets up an anonymous table in the appdb. Return a box that can be deref'd for the table-id.

  Returned box is java.io.Closeable so you can clean up with `with-open`. Otherwise .close the box to drop the table when finished."
  ^Closeable []
  (let [db         (t2/select-one :model/Database (mt/id))
        driver     :h2
        table-name (str "temp_table_" (u/lower-case-en (random-uuid)))

        cleanup
        (fn []
          (try
            (driver/drop-table! driver (mt/id) table-name)
            (catch Exception _)))

        init
        (fn []
          (let [_     (driver/create-table! driver
                                            (mt/id)
                                            table-name
                                            {:id   (driver/upload-type->database-type driver :metabase.upload/auto-incrementing-int-pk)
                                             :name [:text]
                                             :song  [:text]}
                                            {:primary-key [:id]})
                table (sync/create-table! db
                                          {:name         table-name
                                           :schema       nil
                                           :display_name table-name})]
            (sync/sync-fields-for-table! db table)
            (:id table)))]
    (try
      (let [table-id (init)]
        (reify Closeable
          IDeref
          (deref [_] table-id)
          (close [_] (cleanup))))
      (catch Exception e
        (cleanup)
        (throw e)))))

(deftest table-operations-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/with-empty-h2-app-db
      (with-open [table-ref (open-test-table!)]
        (let [table-id @table-ref
              url      (table-url table-id)]
          (t2/update! :model/Database (mt/id) {:settings {:database-enable-editing true}})
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
                   (table-rows table-id)))))))))

(deftest editing-allowed-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/with-empty-h2-app-db
      (testing "40x returned if user/database not configured for editing"
        (let [test-endpoints
              (fn [flags]
                (with-open [table-ref (open-test-table!)]
                  (let [actions-enabled (:a flags)
                        editing-enabled (:d flags)
                        superuser       (:s flags)
                        url             (table-url @table-ref)
                        settings        {:database-enable-editing (boolean editing-enabled)
                                         :database-enable-actions (boolean actions-enabled)}
                        _               (t2/update! :model/Database (mt/id) {:settings settings})
                        user            (if superuser :crowberto :rasta)
                        req             mt/user-http-request-full-response

                        post-response
                        (req user :post url {:rows [{:name "Pidgey" :song "Car alarms"}]})

                        put-response
                        (req user :put url {:rows [{:id 1 :song "Join us now and share the software"}]})

                        del-response
                        (req user :delete url {:rows [{:id 1}]})

                        error-or-ok
                        (fn [{:keys [status body]}]
                          (if (<= 200 status 299)
                            :ok
                            [(:message body body) status]))]
                    [(error-or-ok post-response)
                     (error-or-ok put-response)
                     (error-or-ok del-response)])))]
          (are [flags response]
               (= response (frequencies (test-endpoints flags)))

            ;; Shorthand notation
            ;; :a == action-editing should not affect result
            ;; :d == data-editing   only allowed to edit if editing enabled
            ;; :s == super-user     only allowed to edit if a superuser

            #{:a}           {["You don't have permissions to do that." 403] 3}
            #{:d}           {["You don't have permissions to do that." 403] 3}
            #{:a :d}        {["You don't have permissions to do that." 403] 3}
            #{:s}           {["Data editing is not enabled."           400] 3}
            #{:s :a}        {["Data editing is not enabled."           400] 3}
            #{:s :d}        {:ok 3}
            #{:s :a :d}     {:ok 3}))))))
