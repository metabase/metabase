(ns metabase.api.action-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.actions.test-util :as actions.test-util]
            [metabase.api.action :as api.action]
            [metabase.driver :as driver]
            [metabase.models.action :refer [Action]]
            [metabase.models.database :refer [Database]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(comment api.action/keep-me)

(def ^:private ExpectedGetCardActionAPIResponse
  "Expected schema for a CardAction as it should appear in the response for an API request to one of the GET endpoints."
  {:id       su/IntGreaterThanOrEqualToZero
   :card     {:id            su/IntGreaterThanOrEqualToZero
              :dataset_query {:database su/IntGreaterThanOrEqualToZero
                              :type     (s/eq "native")
                              :native   {:query    s/Str
                                         s/Keyword s/Any}
                              s/Keyword s/Any}
              s/Keyword      s/Any}
   s/Keyword s/Any})

(deftest list-actions-test
  (testing "GET /api/action"
    (actions.test-util/with-actions-enabled
      (actions.test-util/with-query-action [{:keys [action-id]}]
        (let [response (mt/user-http-request :crowberto :get 200 "action")]
          (is (schema= [{:id       su/IntGreaterThanZero
                         s/Keyword s/Any}]
                       response))
          (let [action (some (fn [action]
                               (when (= (:id action) action-id)
                                 action))
                             response)]
            (testing "Should return Card dataset_query deserialized (#23201)"
              (is (schema= ExpectedGetCardActionAPIResponse
                           action)))))))))

(deftest get-action-test
  (testing "GET /api/action/:id"
    (testing "Should return Card dataset_query deserialized (#23201)"
      (actions.test-util/with-actions-enabled
        (actions.test-util/with-query-action [{:keys [action-id]}]
          (let [action (mt/user-http-request :crowberto :get 200 (format "action/%d" action-id))]
            (testing "Should return Card dataset_query deserialized (#23201)"
              (is (schema= ExpectedGetCardActionAPIResponse
                           action)))))))))

(defn- mock-requests []
  [{:action       "action/row/create"
    :request-body (assoc (mt/mbql-query categories) :create-row {:name "created_row"})
    :expect-fn    (fn [result]
                    ;; check that we return the entire row:
                    (is (= "created_row" (get-in result [:created-row :name])))
                    (is (= (set [:name :id])
                           (set (keys (:created-row result))))))}
   {:action       "action/row/update"
    :request-body (assoc (mt/mbql-query categories {:filter [:= $id 1]})
                         :update_row {:name "updated_row"})
    :expected     {:rows-updated [1]}}
   {:action       "action/row/delete"
    :request-body (mt/mbql-query categories {:filter [:= $id 1]})
    :expected     {:rows-deleted [1]}}
   {:action       "action/row/update"
    :request-body (assoc (mt/mbql-query categories {:filter [:= $id 10]})
                         :update_row {:name "new-category-name"})
    :expected     {:rows-updated [1]}}])

(deftest happy-path-test
  (testing "Make sure it's possible to use known actions end-to-end if preconditions are satisfied"
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (doseq [{:keys [action request-body expected expect-fn]} (mock-requests)]
        (testing action
          (let [result (mt/user-http-request :crowberto :post 200 action request-body)]
            (when expected (is (= expected result)))
            (when expect-fn (expect-fn result))))))))

(deftest create-update-delete-test
  (testing "Make sure actions are acting on rows."
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (let [[create update delete] (mock-requests)
            {created-id :id :as created-row}
            (:created-row (mt/user-http-request :crowberto :post 200 (:action create) (:request-body create)))]
        (is (= [:id :name] (keys created-row))
            "Create should return the entire row")
        (is (= "created_row" (:name created-row))
            "Create should return the correct value for name")
        (is (= "created_row" (-> (mt/rows (mt/run-mbql-query categories {:filter [:= $id created-id]})) last last))
            "The record at created-id should now have its name set to \"created_row\"")
        (is (= (:expected update) (mt/user-http-request :crowberto :post 200 (:action update)
                                                        (assoc (mt/mbql-query categories {:filter [:= $id created-id]})
                                                               :update_row {:name "updated_row"})))
            "Update should return the right shape")
        (is (= "updated_row" (-> (mt/rows (mt/run-mbql-query categories {:filter [:= $id created-id]})) last last))
            "The row should actually be updated")
        (is (= (:expected delete)
               (mt/user-http-request :crowberto :post 200 (:action delete) (mt/mbql-query categories {:filter [:= $id created-id]})))
            "Delete should return the right shape")
        (is (= [] (mt/rows (mt/run-mbql-query categories {:filter [:= $id created-id]})))
            "Selecting for deleted rows should return an empty result")))))

;; TODO: update test for this when we get something other than categories
#_(deftest row-delete-row-with-constraint-fails-test
    (mt/with-temporary-setting-values [experimental-enable-actions true]
      (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions true}}
        (testing "Should return a 400 when deleting the row violates a foreign key constraint"
          (let [request-body (mt/mbql-query categories {:filter [:= $id 22]})]
            (mt/user-http-request :crowberto :post 400 "action/row/delete" request-body))))))

(deftest feature-flags-test
  (testing "Disable endpoints unless both global and Database feature flags are enabled"
    (doseq [{:keys [action request-body]} (mock-requests)
            enable-global-feature-flag?   [true false]
            enable-database-feature-flag? [true false]]
      (testing action
        (mt/with-temporary-setting-values [experimental-enable-actions enable-global-feature-flag?]
          (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions enable-database-feature-flag?}}
            (cond
              (not enable-global-feature-flag?)
              (testing "Should return a 400 if global feature flag is disabled"
                (is (= "Actions are not enabled."
                       (mt/user-http-request :crowberto :post 400 action request-body))))

              (not enable-database-feature-flag?)
              (testing "Should return a 400 if Database feature flag is disabled."
                (is (re= #"^Actions are not enabled for Database [\d,]+\.$"
                         (mt/user-http-request :crowberto :post 400 action request-body)))))))))))

(driver/register! ::feature-flag-test-driver, :parent :h2)

(defmethod driver/database-supports? [::feature-flag-test-driver :actions]
  [_driver _feature _database]
  false)

(deftest actions-feature-test
  (testing "Only allow actions for drivers that support the `:actions` driver feature. (#22557)"
    (mt/with-temporary-setting-values [experimental-enable-actions true]
      (mt/with-temp* [Database [{db-id :id} {:name     "Birds"
                                             :engine   ::feature-flag-test-driver
                                             :settings {:database-enable-actions true}}]
                      Table    [{table-id :id} {:db_id db-id}]]
        (is (partial= {:message (format "%s Database %d \"Birds\" does not support actions."
                                        (u/qualified-name ::feature-flag-test-driver)
                                        db-id)}
                      ;; TODO -- not sure what the actual shape of this API is supposed to look like. We'll have to
                      ;; update this test when the PR to support row insertion is in.
                      (mt/user-http-request :crowberto :post 400 "action/table/insert"
                                            {:database db-id
                                             :table-id table-id
                                             :values   {:name "Toucannery"}})))))))

(defn- row-action? [action]
  (str/starts-with? action "action/row"))

(deftest validation-test
  (actions.test-util/with-actions-enabled
    (doseq [{:keys [action request-body]} (mock-requests)]
      (testing (str action " without :query")
        (when (row-action? action)
          (is (re= #"Value does not match schema:.*"
                   (:message (mt/user-http-request :crowberto :post 400 action (dissoc request-body :query))))))))))

(deftest row-update-action-gives-400-when-matching-more-than-one
  (actions.test-util/with-actions-enabled
    (let [query-that-returns-more-than-one (assoc (mt/mbql-query users {:filter [:>= $id 1]}) :update_row {:name "new-name"})
          result-count (count (mt/rows (qp/process-query query-that-returns-more-than-one)))]
      (is (< 1 result-count))
      (doseq [{:keys [action]} (filter #(= "action/row/update" (:action %)) (mock-requests))
              :when (not= action "action/row/create")] ;; the query in create is not used to select values to act upopn.
        (is (re= #"Sorry, this would update [\d|,]+ rows, but you can only act on 1"
                 (:message (mt/user-http-request :crowberto :post 400 action query-that-returns-more-than-one))))
        (is (= result-count (count (mt/rows (qp/process-query query-that-returns-more-than-one))))
            "The result-count after a rollback must remain the same!")))))

(deftest row-delete-action-gives-400-when-matching-more-than-one
  (actions.test-util/with-actions-enabled
    (let [query-that-returns-more-than-one (assoc (mt/mbql-query checkins {:filter [:>= $id 1]}) :update_row {:name "new-name"})
          result-count (count (mt/rows (qp/process-query query-that-returns-more-than-one)))]
      (is (< 1 result-count))
      (doseq [{:keys [action]} (filter #(= "action/row/delete" (:action %)) (mock-requests))
              :when (not= action "action/row/create")] ;; the query in create is not used to select values to act upopn.
        (is (re= #"Sorry, this would delete [\d|,]+ rows, but you can only act on 1"
                 (:message (mt/user-http-request :crowberto :post 400 action query-that-returns-more-than-one))))
        (is (= result-count (count (mt/rows (qp/process-query query-that-returns-more-than-one))))
            "The result-count after a rollback must remain the same!")))))

(deftest unknown-row-action-gives-404
  (actions.test-util/with-actions-enabled
    (testing "404 for unknown Row action"
      (is (re= #"^Unknown Action :row/fake. Valid Actions are: .+"
               (mt/user-http-request :crowberto :post 404 "action/row/fake" (mt/mbql-query categories {:filter [:= $id 1]})))))))

(deftest four-oh-four-test
  (actions.test-util/with-actions-enabled
    (doseq [{:keys [action request-body]} (mock-requests)]
      (testing action
        (testing "404 for unknown Table"
          (is (= "Failed to fetch Table 2,147,483,647: Table does not exist, or belongs to a different Database."
                 (:message (mt/user-http-request :crowberto :post 404 action
                                                 (assoc-in request-body [:query :source-table] Integer/MAX_VALUE))))))))))

(deftest action-crud
  (testing "Happy Path"
    (actions.test-util/with-actions-enabled
      (let [initial-action {:name "Get example"
                            :type "http"
                            :template {:method "GET"
                                       :url "https://example.com"}
                            :response_handle ".body"
                            :error_handle ".status >= 400"}
            created-action (mt/user-http-request :crowberto :post 200 "action" initial-action)
            updated-action (merge initial-action {:name "New name"})
            action-path (str "action/" (:id created-action))]
        (try
          (testing "Create"
            (is (partial= initial-action created-action)))
          (testing "Update"
            (is (partial= updated-action
                          (mt/user-http-request :crowberto :put 200 action-path
                                                {:name "New name" :type "http"}))))
          (testing "Get"
            (is (partial= updated-action
                          (mt/user-http-request :crowberto :get 200 action-path)))
            (is (partial= [updated-action]
                          (mt/user-http-request :crowberto :get 200 "action"))))
          (testing "Can't create or change http type"
            (is (partial= {:type "query"} (:action (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :type "query")))))
            (is (partial= {:type "query"} (:action (mt/user-http-request :crowberto :put 400 action-path {:type "query"})))))
          (testing "Delete"
            (is (nil? (mt/user-http-request :crowberto :delete 204 action-path)))
            (is (= "Not found." (mt/user-http-request :crowberto :get 404 action-path))))
          (finally
            (db/delete! Action :id (:id created-action))))))))
