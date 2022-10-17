(ns metabase.api.action-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.actions.test-util :as actions.test-util]
            [metabase.api.action :as api.action]
            [metabase.driver :as driver]
            [metabase.models :refer [Card ModelAction]]
            [metabase.models.action :refer [Action]]
            [metabase.models.database :refer [Database]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]))

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
   :parameters s/Any
   :visualization_settings su/Map
   s/Keyword s/Any})

(deftest list-actions-test
  (testing "GET /api/action"
    (actions.test-util/with-actions-enabled
      (actions.test-util/with-action [{:keys [action-id]} {}]
        (mt/with-temp* [Card [{card-id :id} {:dataset true :dataset_query (mt/mbql-query categories)}]
                        ModelAction [_ {:card_id card-id :slug "custom" :action_id action-id}]
                        ModelAction [_ {:card_id card-id :slug "insert"}]
                        ModelAction [_ {:card_id card-id :slug "update" :requires_pk true}]
                        ModelAction [_ {:card_id card-id :slug "delete" :requires_pk true}]]
          (let [response (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))]
            (is (partial= [{:slug "custom"
                            :action_id action-id
                            :parameters [{:id "id"} {:id "name"}]
                            :card {:is_write true}
                            :type "query"
                            :name "Query Example"}
                           {:slug "insert" :action_id nil :parameters [{:id "name"}] :type "implicit"}
                           {:slug "update" :action_id nil :parameters [{:id "id"} {:id "name"}] :type "implicit"}
                           {:slug "delete" :action_id nil :parameters [{:id "id"}] :type "implicit"}]
                          response))
            (let [action (some (fn [action]
                                 (when (= (:id action) action-id)
                                   action))
                               response)]
              (testing "Should return Card dataset_query deserialized (#23201)"
                (is (schema= ExpectedGetCardActionAPIResponse
                             action))))))))))

(deftest get-action-test
  (testing "GET /api/action/:id"
    (testing "Should return Card dataset_query deserialized (#23201)"
      (actions.test-util/with-actions-enabled
        (actions.test-util/with-action [{:keys [action-id]} {}]
          (let [action (mt/user-http-request :crowberto :get 200 (format "action/%d" action-id))]
            (testing "Should return Card dataset_query deserialized (#23201)"
              (is (schema= ExpectedGetCardActionAPIResponse
                           action)))))))))

(defn- format-field-name
  "Format `field-name` appropriately for the current driver (e.g. uppercase it if we're testing against H2)."
  [field-name]
  (keyword (mt/format-name (name field-name))))

(defn- categories-row-count []
  (first (mt/first-row (mt/run-mbql-query categories {:aggregation [[:count]]}))))

(deftest create-test
  (testing "POST /api/action/row/create"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (let [response (mt/user-http-request :crowberto :post 200
                                             "action/row/create"
                                             (assoc (mt/mbql-query categories) :create-row {(format-field-name :name) "created_row"}))]
          (is (schema= {:created-row {(format-field-name :id)   (s/eq 76)
                                      (format-field-name :name) (s/eq "created_row")}}
                       response)
              "Create should return the entire row")
          (let [created-id (get-in response [:created-row (format-field-name :id)])]
            (is (= "created_row" (-> (mt/rows (mt/run-mbql-query categories {:filter [:= $id created-id]})) last last))
                "The record at created-id should now have its name set to \"created_row\"")))))))

(deftest create-invalid-data-test
  (testing "POST /api/action/row/create -- invalid data"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (is (= 75
               (categories-row-count)))
        (is (schema= {:message  (case driver/*driver*
                                  :h2       #"^Data conversion error converting \"created_row\""
                                  :postgres #"^ERROR: invalid input syntax for (?:type )?integer: \"created_row\"")
                      s/Keyword s/Any}
                     ;; bad data -- ID is a string instead of an Integer.
                     (mt/user-http-request :crowberto :post 400
                                           "action/row/create"
                                           (assoc (mt/mbql-query categories) :create-row {(format-field-name :id) "created_row"}))))
        (testing "no row should have been inserted"
          (is (= 75
                 (categories-row-count))))))))

(deftest update-test
  (testing "POST /api/action/row/update"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (is (= {:rows-updated [1]}
               (mt/user-http-request :crowberto :post 200
                                     "action/row/update"
                                     (assoc (mt/mbql-query categories {:filter [:= $id 50]})
                                            :update_row {(format-field-name :name) "updated_row"})))
            "Update should return the right shape")
        (is (= "updated_row"
               (-> (mt/rows (mt/run-mbql-query categories {:filter [:= $id 50]})) last last))
            "The row should actually be updated")))))

(deftest delete-test
  (testing "POST /api/action/row/delete"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (is (= {:rows-deleted [1]}
               (mt/user-http-request :crowberto :post 200
                                     "action/row/delete"
                                     (mt/mbql-query categories {:filter [:= $id 50]})))
            "Delete should return the right shape")
        (is (= 74
               (categories-row-count)))
        (is (= [] (mt/rows (mt/run-mbql-query categories {:filter [:= $id 50]})))
            "Selecting for deleted rows should return an empty result")))))

(defn- mock-requests
  "Mock requests for testing validation for various actions. Don't use these for happy path tests! It's way too hard to
  wrap your head around them. Use them for validating preconditions and stuff like that."
  []
  [{:action       "action/row/create"
    :request-body (assoc (mt/mbql-query categories) :create-row {(format-field-name :name) "created_row"})
    :expect-fn    (fn [result]
                    ;; check that we return the entire row
                    (is (schema= {:created-row {(format-field-name :id)   su/IntGreaterThanZero
                                                (format-field-name :name) su/NonBlankString}}
                                 result)))}
   {:action       "action/row/update"
    :request-body (assoc (mt/mbql-query categories {:filter [:= $id 1]})
                         :update_row {(format-field-name :name) "updated_row"})
    :expected     {:rows-updated [1]}}
   {:action       "action/row/delete"
    :request-body (mt/mbql-query categories {:filter [:= $id 1]})
    :expected     {:rows-deleted [1]}}
   {:action       "action/row/update"
    :request-body (assoc (mt/mbql-query categories {:filter [:= $id 10]})
                         :update_row {(format-field-name :name) "new-category-name"})
    :expected     {:rows-updated [1]}}])

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
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (actions.test-util/with-actions-enabled
      (let [query-that-returns-more-than-one (assoc (mt/mbql-query users {:filter [:>= $id 1]})
                                                    :update_row {(format-field-name :name) "new-name"})
            result-count                     (count (mt/rows (qp/process-query query-that-returns-more-than-one)))]
        (is (< 1 result-count))
        (doseq [{:keys [action]} (filter #(= "action/row/update" (:action %)) (mock-requests))
                :when            (not= action "action/row/create")] ;; the query in create is not used to select values to act upopn.
          (is (schema= {:message #"Sorry, this would update [\d|,]+ rows, but you can only act on 1"
                        s/Keyword s/Any}
                       (mt/user-http-request :crowberto :post 400 action query-that-returns-more-than-one)))
          (is (= result-count (count (mt/rows (qp/process-query query-that-returns-more-than-one))))
              "The result-count after a rollback must remain the same!"))))))

(deftest row-delete-action-gives-400-when-matching-more-than-one
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (actions.test-util/with-actions-enabled
      (let [query-that-returns-more-than-one (assoc (mt/mbql-query checkins {:filter [:>= $id 1]})
                                                    :update_row {(format-field-name :name) "new-name"})
            result-count                     (count (mt/rows (qp/process-query query-that-returns-more-than-one)))]
        (is (< 1 result-count))
        (doseq [{:keys [action]} (filter #(= "action/row/delete" (:action %)) (mock-requests))
                :when            (not= action "action/row/create")] ;; the query in create is not used to select values to act upopn.
          (is (schema= {:message  #"Sorry, this would delete [\d|,]+ rows, but you can only act on 1"
                        s/Keyword s/Any}
                       (mt/user-http-request :crowberto :post 400 action query-that-returns-more-than-one)))
          (is (= result-count (count (mt/rows (qp/process-query query-that-returns-more-than-one))))
              "The result-count after a rollback must remain the same!"))))))

(deftest row-delete-unparseable-values-test
  (testing "POST /api/action/row/delete"
    (testing "should return error message if value cannot be parsed correctly for Field in question"
      (mt/test-drivers (mt/normal-drivers-with-feature :actions)
        (actions.test-util/with-actions-test-data-and-actions-enabled
          (is (schema= {:message  #"Error filtering against :type/(Big)?Integer Field: unable to parse String \"one\" to a :type/(Big)?Integer"
                        s/Keyword s/Any}
                       ;; TODO -- this really should be returning a 400 but we need to rework the code in
                       ;; [[metabase.driver.sql-jdbc.actions]] a little to have that happen without changing other stuff
                       ;; that SHOULD be returning a 404
                       (mt/user-http-request :crowberto :post 404
                                             "action/row/delete"
                                             (mt/mbql-query categories {:filter [:= $id "one"]})))
              "Delete should return the right shape")
          (testing "no rows should have been deleted"
            (is (= 75
                   (categories-row-count)))))))))

(deftest row-delete-fk-constraint-violation-test
  (testing "POST /api/action/row/delete"
    (testing "FK constraint violations errors should have nice error messages (at least for Postgres) (#24021)"
      (mt/test-drivers (mt/normal-drivers-with-feature :actions)
        (actions.test-util/with-actions-test-data-tables #{"venues" "categories"}
          (actions.test-util/with-actions-test-data-and-actions-enabled
            ;; attempting to delete the `Pizza` category should fail because there are several rows in `venues` that have
            ;; this `category_id` -- it's an FK constraint violation.
            (is (schema= (case driver/*driver*
                           ;; TODO -- we need nice error messages for `:h2`, and need to implement
                           ;; [[metabase.driver.sql-jdbc.actions/parse-sql-error]] for it
                           :h2       #"Referential integrity constraint violation.*PUBLIC\.VENUES FOREIGN KEY\(CATEGORY_ID\) REFERENCES PUBLIC\.CATEGORIES\(ID\).*"
                           :postgres {:errors {:id #"violates foreign key constraint .*"}})
                         (mt/user-http-request :crowberto :post 400
                                               "action/row/delete"
                                               (mt/mbql-query categories {:filter [:= $id 58]})))
                "Delete should return the right shape")
            (testing "no rows should have been deleted"
              (is (= 75
                     (categories-row-count))))))))))

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

(deftest action-crud-test
  (mt/with-model-cleanup [Action]
    (actions.test-util/with-actions-enabled
      (let [initial-action {:name "Get example"
                            :type "http"
                            :template {:method "GET"
                                       :url "https://example.com/{{x}}"
                                       :parameters [{:id "x" :type "text"}]}
                            :response_handle ".body"
                            :error_handle ".status >= 400"}
            created-action (mt/user-http-request :crowberto :post 200 "action" initial-action)
            updated-action (merge initial-action {:name "New name"})
            action-path (str "action/" (:id created-action))]
        (mt/with-temp* [Card [{card-id :id} {:dataset true}]
                        ModelAction [_ {:card_id card-id :action_id (:id created-action) :slug "action"}]]
          (testing "Create"
            (is (partial= initial-action created-action)))
          (testing "Validate POST"
            (testing "Required fields"
              (is (partial= {:errors {:type "Only http actions are supported at this time."}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "query"})))
              (is (partial= {:errors {:name "value must be a string."}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http"})))
              (is (partial= {:errors {:template "value must be a map with schema: (\n  body (optional) : value may be nil, or if non-nil, value must be a string.\n  headers (optional) : value may be nil, or if non-nil, value must be a string.\n  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.\n  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.\n  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.\n  url : value must be a string.\n)"}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http" :name "test"}))))
            (testing "Template needs method and url"
              (is (partial= {:errors {:template "value must be a map with schema: (\n  body (optional) : value may be nil, or if non-nil, value must be a string.\n  headers (optional) : value may be nil, or if non-nil, value must be a string.\n  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.\n  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.\n  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.\n  url : value must be a string.\n)"}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http" :name "Test" :template {}}))))
            (testing "Template parameters should be well formed"
              (is (partial= {:errors {:template "value must be a map with schema: (\n  body (optional) : value may be nil, or if non-nil, value must be a string.\n  headers (optional) : value may be nil, or if non-nil, value must be a string.\n  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.\n  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.\n  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.\n  url : value must be a string.\n)"}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http"
                                                                                 :name "Test"
                                                                                 :template {:url "https://example.com"
                                                                                            :method "GET"
                                                                                            :parameters {}}}))))
            (testing "Handles need to be valid jq"
              (is (partial= {:errors {:response_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :response_handle "body"))))
              (is (partial= {:errors {:error_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :error_handle "x"))))))
          (testing "Update"
            (is (partial= updated-action
                          (mt/user-http-request :crowberto :put 200 action-path
                                                {:name "New name" :type "http"}))))
          (testing "Get"
            (is (partial= updated-action
                          (mt/user-http-request :crowberto :get 200 action-path)))
            (is (partial= updated-action
                          (last (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))))))
          (testing "Validate PUT"
            (testing "Can't create or change http type"
              (is (partial= {:errors {:type "Only http actions are supported at this time."}}
                            (mt/user-http-request :crowberto :put 400 action-path {:type "query"}))))
            (testing "Template needs method and url"
              (is (partial= {:errors {:template "value may be nil, or if non-nil, value must be a map with schema: (\n  body (optional) : value may be nil, or if non-nil, value must be a string.\n  headers (optional) : value may be nil, or if non-nil, value must be a string.\n  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.\n  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.\n  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.\n  url : value must be a string.\n)"}}
                            (mt/user-http-request :crowberto :put 400 action-path {:type "http" :template {}}))))
            (testing "Handles need to be valid jq"
              (is (partial= {:errors {:response_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :response_handle "body"))))
              (is (partial= {:errors {:error_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :error_handle "x"))))))
          (testing "Delete"
            (is (nil? (mt/user-http-request :crowberto :delete 204 action-path)))
            (is (= "Not found." (mt/user-http-request :crowberto :get 404 action-path)))))))))

(deftest bulk-create-happy-path-test
  (testing "POST /api/action/bulk/create/:table-id"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (is (= 75
               (categories-row-count)))
        (is (= {:created-rows [{(format-field-name :id) 76, (format-field-name :name) "NEW_A"}
                               {(format-field-name :id) 77, (format-field-name :name) "NEW_B"}]}
               (mt/user-http-request :crowberto :post 200
                                     (format "action/bulk/create/%d" (mt/id :categories))
                                     [{(format-field-name :name) "NEW_A"}
                                      {(format-field-name :name) "NEW_B"}])))
        (is (= [[76 "NEW_A"]
                [77 "NEW_B"]]
               (mt/rows (mt/run-mbql-query categories {:filter   [:starts-with $name "NEW"]
                                                       :order-by [[:asc $id]]}))))
        (is (= 77
               (categories-row-count)))))))

(deftest bulk-create-failure-test
  (testing "POST /api/action/bulk/create/:table-id"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (testing "error in some of the rows in request body"
          (is (= 75
                 (categories-row-count)))
          (testing "Should report indices of bad rows"
            (is (schema= {:errors [(s/one {:index (s/eq 1)
                                           :error (s/constrained
                                                   s/Str
                                                   (case driver/*driver*
                                                     :h2       #(str/starts-with? % "NULL not allowed for column \"NAME\"")
                                                     :postgres #(str/starts-with? % "ERROR: null value in column \"name\"")))}
                                          "first error")
                                   (s/one {:index (s/eq 3)
                                           :error (case driver/*driver*
                                                    :h2       #"^Data conversion error converting \"STRING\""
                                                    :postgres #"^ERROR: invalid input syntax for (?:type )?integer: \"STRING\"")}
                                          "second error")]}
                         (mt/user-http-request :crowberto :post 400
                                               (format "action/bulk/create/%d" (mt/id :categories))
                                               [{(format-field-name :name) "NEW_A"}
                                                ;; invalid because name has to be non-nil
                                                {(format-field-name :name) nil}
                                                {(format-field-name :name) "NEW_B"}
                                                ;; invalid because ID is supposed to be an integer
                                                {(format-field-name :id) "STRING"}]))))
          (testing "Should not have committed any of the valid rows"
            (is (= 75
                   (categories-row-count)))))))))

(deftest bulk-delete-happy-path-test
  (testing "POST /api/action/bulk/delete/:table-id"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (is (= 75
               (categories-row-count)))
        (is (= {:success true}
               (mt/user-http-request :crowberto :post 200
                                     (format "action/bulk/delete/%d" (mt/id :categories))
                                     [{(format-field-name :id) 74}
                                      {(format-field-name :id) 75}])))
        (is (= 73
               (categories-row-count)))))))

(deftest bulk-delete-failure-test
  (testing "POST /api/action/bulk/delete/:table-id"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (testing "error in some of the rows"
          (is (= 75
                 (categories-row-count)))
          (testing "Should report indices of bad rows"
            (is (schema= {:errors
                          [(s/one
                            {:index (s/eq 1)
                             :error #"Error filtering against :type/(?:Big)?Integer Field: unable to parse String \"foo\" to a :type/(?:Big)?Integer"}
                            "first error")
                           (s/one
                            {:index (s/eq 3)
                             :error #"Sorry, this would delete 0 rows, but you can only act on 1"}
                            "second error")]}
                         (mt/user-http-request :crowberto :post 400
                                               (format "action/bulk/delete/%d" (mt/id :categories))
                                               [{(format-field-name :id) 74}
                                                {(format-field-name :id) "foo"}
                                                {(format-field-name :id) 75}
                                                {(format-field-name :id) 107}]))))
          (testing "Should report inconsistent keys"
            (is (partial= {:message (format "Some rows have different sets of columns: %s, %s"
                                            (pr-str #{(name (format-field-name :nonid))})
                                            (pr-str #{(name (format-field-name :id))}))}
                          (mt/user-http-request :crowberto :post 400
                                                (format "action/bulk/delete/%d" (mt/id :categories))
                                                [{(format-field-name :id) 74}
                                                 {(format-field-name :nonid) 75}]))))
          (testing "Should report non-pk keys"
            (is (partial= {:message (format "Rows have the wrong columns: expected %s, but got %s"
                                            (pr-str #{(name (format-field-name :id))})
                                            (pr-str #{(name (format-field-name :nonid))}))}
                          (mt/user-http-request :crowberto :post 400
                                                (format "action/bulk/delete/%d" (mt/id :categories))
                                                [{(format-field-name :nonid) 75}])))
            (testing "Even if all PK columns are specified"
              (is (partial= {:message (format "Rows have the wrong columns: expected %s, but got %s"
                                              (pr-str #{(name (format-field-name :id))})
                                              (pr-str #{(name (format-field-name :id))
                                                        (name (format-field-name :nonid))}))}
                            (mt/user-http-request :crowberto :post 400
                                                  (format "action/bulk/delete/%d" (mt/id :categories))
                                                  [{(format-field-name :id)    75
                                                    (format-field-name :nonid) 75}])))))
          (testing "Should report repeat rows"
            (is (partial= {:message (format "Rows need to be unique: repeated rows {%s 74} × 3, {%s 75} × 2"
                                            (pr-str (name (format-field-name :id)))
                                            (pr-str (name (format-field-name :id))))}
                          (mt/user-http-request :crowberto :post 400
                                                (format "action/bulk/delete/%d" (mt/id :categories))
                                                [{(format-field-name :id) 73}
                                                 {(format-field-name :id) 74}
                                                 {(format-field-name :id) 74}
                                                 {(format-field-name :id) 74}
                                                 {(format-field-name :id) 75}
                                                 {(format-field-name :id) 75}]))))
          (is (= 75
                 (categories-row-count))))))))

(defn- first-three-categories []
  (mt/rows (mt/run-mbql-query categories {:filter [:< $id 4], :order-by [[:asc $id]]})))

(deftest bulk-update-happy-path-test
  (testing "POST /api/action/bulk/update/:table-id"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (is (= [[1 "African"]
                [2 "American"]
                [3 "Artisan"]]
               (first-three-categories)))
        (is (= {:rows-updated 2}
               (mt/user-http-request :crowberto :post 200
                                     (format "action/bulk/update/%d" (mt/id :categories))
                                     (let [id   (format-field-name :id)
                                           name (format-field-name :name)]
                                       [{id 1, name "Seed Bowl"}
                                        {id 2, name "Millet Treat"}]))))
        (testing "rows should be updated in the DB"
          (is (= [[1 "Seed Bowl"]
                  [2 "Millet Treat"]
                  [3 "Artisan"]]
                 (first-three-categories))))))))

(deftest bulk-update-failure-test
  (testing "POST /api/action/bulk/update/:table-id"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (let [id                 (format-field-name :id)
              name               (format-field-name :name)
              update-categories! (fn [rows]
                                   (mt/user-http-request :crowberto :post 400
                                                         (format "action/bulk/update/%d" (mt/id :categories))
                                                         rows))]
          (testing "Initial values"
            (is (= [[1 "African"]
                    [2 "American"]
                    [3 "Artisan"]]
                   (first-three-categories))))
          (testing "Should report the index of input rows with errors in the data warehouse"
            (let [error-message-regex (case driver/*driver*
                                        :h2       #"^NULL not allowed for column \"NAME\""
                                        :postgres #"^ERROR: null value in column \"name\" (?:of relation \"categories\" )?violates not-null constraint")]
              (is (schema= {:errors   [(s/one
                                        {:index (s/eq 0)
                                         :error error-message-regex}
                                        "first error")
                                       (s/one
                                        {:index (s/eq 2)
                                         :error error-message-regex}
                                        "second error")]
                            s/Keyword s/Any}
                           (update-categories! [{id 1, name nil}
                                                {id 2, name "Millet Treat"}
                                                {id 3, name nil}])))))
          ;; TODO -- maybe this should come back with the row index as well. Maybe it's a little less important for the
          ;; Clojure-side validation because an error like this is presumably the result of the frontend passing in bad
          ;; maps since it should be enforcing this in the FE client as well. Row indexes are more important for errors
          ;; that happen in the DW since they often can't be enforced in the frontend client OR in the backend without
          ;; actually hitting the DW
          (testing "Should validate that every row has required PK columns"
            (is (partial= {:message (format "Row is missing required primary key column. Required %s; got %s"
                                            (pr-str #{(clojure.core/name (format-field-name :id))})
                                            (pr-str #{(clojure.core/name (format-field-name :name))}))}
                          (update-categories! [{id 1, name "Seed Bowl"}
                                               {name "Millet Treat"}]))))
          (testing "Should validate that the fields in the row maps are valid for the Table"
            (is (schema= {:errors [(s/one
                                    {:index (s/eq 0)
                                     :error (case driver/*driver*
                                              :h2       #"^Column \"FAKE\" not found"
                                              :postgres #"ERROR: column \"fake\" of relation \"categories\" does not exist")}
                                    "first error")]}
                         (update-categories! [{id 1, (format-field-name :fake) "FAKE"}]))))
          (testing "Should throw error if row does not contain any non-PK columns"
            (is (partial= {:message (format "Invalid update row map: no non-PK columns. Got #{%s}, all of which are PKs."
                                            (pr-str (clojure.core/name (format-field-name :id))))}
                          (update-categories! [{id 1}]))))
          (testing "Rows should be unchanged"
            (is (= [[1 "African"]
                    [2 "American"]
                    [3 "Artisan"]]
                   (first-three-categories)))))))))
