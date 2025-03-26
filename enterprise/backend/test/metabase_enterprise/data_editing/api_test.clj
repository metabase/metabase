(ns metabase-enterprise.data-editing.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
    (let [url (data-editing.tu/table-url 1)]
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 url))
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :put 402 url))
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 (str url "/delete"))))))

(deftest table-operations-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/with-empty-h2-app-db
      (with-open [table-ref (data-editing.tu/open-test-table!)]
        (let [table-id @table-ref
              url      (data-editing.tu/table-url table-id)]
          (t2/update! :model/Database (mt/id) {:settings {:database-enable-table-editing true}})
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
            (is (= {:updated [{:id 1, :name "Pidgey", :song "Join us now and share the software"}
                              {:id 2, :name "Speacolumn", :song "Hold music"}]}
                   (mt/user-http-request :crowberto :put 200 url
                                         {:rows [{:id 1 :song "Join us now and share the software"}
                                                 {:id 2 :name "Speacolumn"}]})))

            (is (= [[1 "Pidgey"     "Join us now and share the software"]
                    [2 "Speacolumn" "Hold music"]
                    [3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id))))

          (testing "DELETE should remove the corresponding rows"
            (is (= {:success true}
                   (mt/user-http-request :crowberto :post 200 (str url "/delete")
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
                (with-open [table-ref (data-editing.tu/open-test-table!)]
                  (let [actions-enabled (:a flags)
                        editing-enabled (:d flags)
                        superuser       (:s flags)
                        url             (data-editing.tu/table-url @table-ref)
                        settings        {:database-enable-table-editing (boolean editing-enabled)
                                         :database-enable-actions       (boolean actions-enabled)}
                        _               (t2/update! :model/Database (mt/id) {:settings settings})
                        user            (if superuser :crowberto :rasta)
                        req             mt/user-http-request-full-response

                        post-response
                        (req user :post url {:rows [{:name "Pidgey" :song "Car alarms"}]})

                        put-response
                        (req user :put url {:rows [{:id 1 :song "Join us now and share the software"}]})

                        del-response
                        (req user :post (str url "/delete") {:rows [{:id 1}]})]
                    {:settings settings
                     :user     user
                     :responses {:create post-response
                                 :update put-response
                                 :delete del-response}})))

              error-or-ok
              (fn [{:keys [status body]}]
                (if (<= 200 status 299)
                  :ok
                  [(:message body body) status]))

              ;; Shorthand config notation
              ;; :a == action-editing should not affect result
              ;; :d == data-editing   only allowed to edit if editing enabled
              ;; :s == super-user     only allowed to edit if a superuser
              tests
              [#{:a}       ["You don't have permissions to do that." 403]
               #{:d}       ["You don't have permissions to do that." 403]
               #{:a :d}    ["You don't have permissions to do that." 403]
               #{:s}       ["Data editing is not enabled."           400]
               #{:s :a}    ["Data editing is not enabled."           400]
               #{:s :d}    :ok
               #{:s :a :d} :ok]]
          (doseq [[flags expected] (partition 2 tests)
                  :let [{:keys [settings user responses]} (test-endpoints flags)]
                  [verb  response] responses]
            (testing (format "%s user: %s, settings: %s" verb user settings)
              (is (= expected (error-or-ok response))))))))))

(deftest create-table-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/with-empty-h2-app-db
      (let [run-example
            (fn [flags req-body]
              (let [{table-name-prefix :name} req-body
                    table-name      (str table-name-prefix "_" (System/currentTimeMillis))
                    req-body'       (u/update-if-exists req-body :name (constantly table-name))
                    driver          :h2
                    db-id           (mt/id)
                    editing-enabled (:d flags)
                    superuser       (:s flags)
                    settings        {:database-enable-table-editing (boolean editing-enabled)}
                    _               (t2/update! :model/Database (mt/id) {:settings settings})
                    user            (if superuser :crowberto :rasta)
                    url             (format "ee/data-editing/database/%d/table" db-id)
                    res             (delay (mt/user-http-request-full-response user :post url req-body'))
                    cleanup!        #(try (driver/drop-table! driver db-id table-name) (catch Exception _))
                    describe-table
                    (fn []
                      (-> (driver/describe-table driver (t2/select-one :model/Database db-id) {:name table-name})
                          (update :name   {table-name table-name-prefix})
                          (update :fields (partial mapv #(select-keys % [:name :base-type])))))]
                (try
                  (if (<= 200 (:status @res) 299)
                    (merge
                     {:status 200}
                     (describe-table))
                    (:status @res))
                  (finally
                    (cleanup!)))))]

        (are [flags req-body expected]
             (= expected (run-example flags req-body))

          #{:s :d}
          {}
          400

          #{:s :d}
          {:name "a"}
          400

          #{:s :d}
          {:name "a"
           :columns [[{:name "id", :type "int"}]]}
          400

          #{:s :d}
          {:name "a"
           :columns [{:name "id", :type "int"}]
           :primary_key ["id"]}
          ;; =>
          {:status 200
           :name "a"
           :fields [{:name "id"
                     :base-type :type/BigInteger}]}

          #{:s :d}
          {:name "a"
           :columns [{:name "id", :type "not-a-type"}]
           :primary_key ["id"]}
          ;; =>
          400

          ;; escaped quotes are not allowed for now
          #{:s :d}
          {:name "a\""
           :columns [{:name "id", :type "int"}]
           :primary_key ["id"]}
          400
          #{:s :d}
          {:name "a`"
           :columns [{:name "id", :type "int"}]
           :primary_key ["id"]}
          400

          ;; underscores, dashes, spaces allowed
          #{:s :d}
          {:name "a_b1 -"
           :columns [{:name "id", :type "int"}]
           :primary_key ["id"]}
          ;; =>
          {:status 200
           :name "a_b1 -"
           :fields [{:name "id"
                     :base-type :type/BigInteger}]}

          ;; if not admin, denied
          #{:d}
          {:name        "a"
           :columns     [{:name "id", :type "int"}]
           :primary_key ["id"]}
          403

          ;; data editing disabled, denied
          #{:s}
          {:name        "a"
           :columns     [{:name "id", :type "int"}]
           :primary_key ["id"]}
          400)))))
