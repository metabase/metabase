(ns metabase.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions :as actions]
   [metabase.api.common :refer [*current-user-permissions-set*]]
   [metabase.driver :as driver]
   [metabase.models :refer [Database Table]]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [schema.core :as s]))

(defmacro with-actions-test-data-and-actions-permissively-enabled
  "Combines [[mt/with-actions-test-data-and-actions-enabled]] with full permissions."
  {:style/indent 0}
  [& body]
  `(mt/with-actions-test-data-and-actions-enabled
     (binding [*current-user-permissions-set* (delay #{"/"})]
       ~@body)))

(deftest normalize-as-mbql-query-test
  (testing "Make sure normalize-as-mbql-query can exclude certain keys from normalization"
    (is (= {:database    1
            :type        :query
            :updated-row {:my_snake_case_column 1000
                          "CamelCaseColumn"     {:ABC 200}}
            :query       {:source-table 2}}
           (#'actions/normalize-as-mbql-query
            {"database"   1
             :updated_row {:my_snake_case_column 1000
                           "CamelCaseColumn"     {:ABC 200}}
             :query       {"source_table" 2}}
            :exclude #{:updated-row})))))

(defn- format-field-name
  "Format `field-name` appropriately for the current driver (e.g. uppercase it if we're testing against H2)."
  [field-name]
  (keyword (mt/format-name (name field-name))))

(defn- categories-row-count []
  (first (mt/first-row (mt/run-mbql-query categories {:aggregation [[:count]]}))))

(deftest create-test
  (testing "row/create"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (let [response (actions/perform-action! :row/create
                                                (assoc (mt/mbql-query categories) :create-row {(format-field-name :name) "created_row"}))]
          (is (schema= {:created-row {(format-field-name :id)   (s/eq 76)
                                      (format-field-name :name) (s/eq "created_row")}}
                       response)
              "Create should return the entire row")
          (let [created-id (get-in response [:created-row (format-field-name :id)])]
            (is (= "created_row" (-> (mt/rows (mt/run-mbql-query categories {:filter [:= $id created-id]})) last last))
                "The record at created-id should now have its name set to \"created_row\"")))))))

(deftest create-invalid-data-test
  (testing "row/create -- invalid data"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (is (= 75
               (categories-row-count)))
        (is (thrown-with-msg? Exception (case driver/*driver*
                                          :h2       #"^Data conversion error converting \"created_row\""
                                          :postgres #"^ERROR: invalid input syntax for (?:type )?integer: \"created_row\""
                                          ;; Newer versions of MySQL check for not null fields without default values
                                          ;; before checking the type of the parameter.
                                          ;; MySQL 5.7 checks the type of the parameter first.
                                          :mysql    #"Field 'name' doesn't have a default value|Incorrect integer value: 'created_row' for column 'id'")
                              ;; bad data -- ID is a string instead of an Integer.
                              (actions/perform-action! :row/create
                                                       (assoc (mt/mbql-query categories) :create-row {(format-field-name :id) "created_row"}))))
        (testing "no row should have been inserted"
          (is (= 75
                 (categories-row-count))))))))

(deftest update-test
  (testing "row/update"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (is (= {:rows-updated [1]}
               (actions/perform-action! :row/update
                                        (assoc (mt/mbql-query categories {:filter [:= $id 50]})
                                               :update_row {(format-field-name :name) "updated_row"})))
            "Update should return the right shape")
        (is (= "updated_row"
               (-> (mt/rows (mt/run-mbql-query categories {:filter [:= $id 50]})) last last))
            "The row should actually be updated")))))

(deftest delete-test
  (testing "row/delete"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (is (= {:rows-deleted [1]}
               (actions/perform-action! :row/delete
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
  [{:action       :row/create
    :request-body (assoc (mt/mbql-query categories) :create-row {(format-field-name :name) "created_row"})
    :expect-fn    (fn [result]
                    ;; check that we return the entire row
                    (is (schema= {:created-row {(format-field-name :id)   su/IntGreaterThanZero
                                                (format-field-name :name) su/NonBlankString}}
                                 result)))}
   {:action       :row/update
    :request-body (assoc (mt/mbql-query categories {:filter [:= $id 1]})
                         :update_row {(format-field-name :name) "updated_row"})
    :expected     {:rows-updated [1]}}
   {:action       :row/delete
    :request-body (mt/mbql-query categories {:filter [:= $id 1]})
    :expected     {:rows-deleted [1]}}
   {:action       :row/update
    :request-body (assoc (mt/mbql-query categories {:filter [:= $id 10]})
                         :update_row {(format-field-name :name) "new-category-name"})
    :expected     {:rows-updated [1]}}])

(deftest feature-flags-test
  (doseq [{:keys [action request-body]} (mock-requests)]
    (testing action
      (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions false}}
        (binding [*current-user-permissions-set* (delay #{"/"})]
          (testing "Should return a 400 if Database feature flag is disabled."
            (is (partial= ["Actions are not enabled." {:database-id (mt/id)}]
                          (try
                            (actions/perform-action! action request-body)
                            (catch Exception e
                              [(ex-message e) (ex-data e)]))))))))))

(driver/register! ::feature-flag-test-driver, :parent :h2)

(defmethod driver/database-supports? [::feature-flag-test-driver :actions]
  [_driver _feature _database]
  false)

(deftest actions-feature-test
  (testing "Only allow actions for drivers that support the `:actions` driver feature. (#22557)"
    (mt/with-temp* [Database [{db-id :id} {:name     "Birds"
                                           :engine   ::feature-flag-test-driver
                                           :settings {:database-enable-actions true}}]
                    Table    [{table-id :id} {:db_id db-id}]]
      (is (thrown-with-msg? Exception (re-pattern
                                       (format "%s Database %d \"Birds\" does not support actions."
                                               (u/qualified-name ::feature-flag-test-driver)
                                               db-id))
                            ;; TODO -- not sure what the actual shape of this API is supposed to look like. We'll have to
                            ;; update this test when the PR to support row insertion is in.
                            (actions/perform-action! :table/insert
                                                     {:database db-id
                                                      :table-id table-id
                                                      :values   {:name "Toucannery"}}))))))

(defn- row-action? [action]
  (= (namespace action) "row"))

(deftest validation-test
  (mt/with-actions-enabled
    (doseq [{:keys [action request-body]} (mock-requests)
            :when (row-action? action)]
      (testing (str action " without :query")
        (is (thrown-with-msg? Exception #"Value does not match schema:.*"
                              (actions/perform-action! action (dissoc request-body :query))))))))

(deftest row-update-action-gives-400-when-matching-more-than-one
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-enabled
      (binding [*current-user-permissions-set* (delay #{"/"})]
        (let [query-that-returns-more-than-one (assoc (mt/mbql-query users {:filter [:>= $id 1]})
                                                      :update_row {(format-field-name :name) "new-name"})
              query-that-returns-zero-row      (assoc (mt/mbql-query users {:filter [:= $id Integer/MAX_VALUE]})
                                                      :update_row {(format-field-name :name) "new-name"})
              result-count                     (count (mt/rows (qp/process-query query-that-returns-more-than-one)))]
          (is (< 1 result-count))
          (is (thrown-with-msg? Exception #"Sorry, this would update [\d|,]+ rows, but you can only act on 1"
                                (actions/perform-action! :row/update query-that-returns-more-than-one)))
          (is (thrown-with-msg? Exception #"Sorry, the row you're trying to update doesn't exist"
                                (actions/perform-action! :row/update query-that-returns-zero-row)))
          (is (= result-count (count (mt/rows (qp/process-query query-that-returns-more-than-one))))
              "The result-count after a rollback must remain the same!"))))))

(deftest row-delete-action-gives-400-when-matching-more-than-one
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-enabled
      (binding [*current-user-permissions-set* (delay #{"/"})]
        (let [query-that-returns-more-than-one (assoc (mt/mbql-query checkins {:filter [:>= $id 1]})
                                                      :update_row {(format-field-name :name) "new-name"})
              query-that-returns-zero-row      (assoc (mt/mbql-query checkins {:filter [:= $id Integer/MAX_VALUE]})
                                                      :update_row {(format-field-name :name) "new-name"})
              result-count                     (count (mt/rows (qp/process-query query-that-returns-more-than-one)))]
          (is (< 1 result-count))
          (is (thrown-with-msg? Exception #"Sorry, this would delete [\d|,]+ rows, but you can only act on 1"
                                (actions/perform-action! :row/delete query-that-returns-more-than-one)))
          (is (thrown-with-msg? Exception #"Sorry, the row you're trying to delete doesn't exist"
                                (actions/perform-action! :row/delete query-that-returns-zero-row)))
          (is (= result-count (count (mt/rows (qp/process-query query-that-returns-more-than-one))))
              "The result-count after a rollback must remain the same!"))))))

(deftest row-delete-unparseable-values-test
  (testing "row/delete"
    (testing "should return error message if value cannot be parsed correctly for Field in question"
      (mt/test-drivers (mt/normal-drivers-with-feature :actions)
        (with-actions-test-data-and-actions-permissively-enabled
          (is (thrown-with-msg? Exception #"Error filtering against :type/(Big)?Integer Field: unable to parse String \"one\" to a :type/(Big)?Integer"
                                ;; TODO -- this really should be returning a 400 but we need to rework the code in
                                ;; [[metabase.driver.sql-jdbc.actions]] a little to have that happen without changing other stuff
                                ;; that SHOULD be returning a 404
                                (actions/perform-action! :row/delete
                                                         (mt/mbql-query categories {:filter [:= $id "one"]})))
              "Delete should return the right shape")
          (testing "no rows should have been deleted"
            (is (= 75
                   (categories-row-count)))))))))

(deftest row-delete-fk-constraint-violation-test
  (testing "row/delete"
    (testing "FK constraint violations errors should have nice error messages (at least for Postgres) (#24021)"
      (mt/test-drivers (mt/normal-drivers-with-feature :actions)
        (mt/with-actions-test-data-tables #{"venues" "categories"}
          (with-actions-test-data-and-actions-permissively-enabled

            ;; attempting to delete the `Pizza` category should fail because there are several rows in `venues` that have
            ;; this `category_id` -- it's an FK constraint violation.
            (is (thrown-with-msg? Exception (case driver/*driver*
                                              ;; TODO -- we need nice error messages for `:h2`, and need to implement
                                              ;; [[metabase.driver.sql-jdbc.actions/parse-sql-error]] for it
                                              :h2       #"Referential integrity constraint violation.*PUBLIC\.VENUES FOREIGN KEY\(CATEGORY_ID\) REFERENCES PUBLIC\.CATEGORIES\(ID\).*"
                                              :postgres #"violates foreign key constraint .*"
                                              :mysql    #"Cannot delete or update a parent row: a foreign key constraint fails .*")
                                  (actions/perform-action! :row/delete (mt/mbql-query categories {:filter [:= $id 58]})))
                "Delete should return the right shape")
            (testing "no rows should have been deleted"
              (is (= 75
                     (categories-row-count))))))))))

(defmacro is-ex-data [expected actual-call]
  `(try
    ~actual-call
    (is (= true false))
    (catch clojure.lang.ExceptionInfo e#
      (is (~'schema= ~expected (ex-data e#))))))

(deftest bulk-create-happy-path-test
  (testing "bulk/create"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (is (= 75
               (categories-row-count)))
        (is (= {:created-rows [{(format-field-name :id) 76, (format-field-name :name) "NEW_A"}
                               {(format-field-name :id) 77, (format-field-name :name) "NEW_B"}]}
               (actions/perform-action! :bulk/create
                                        {:database (mt/id)
                                         :table-id (mt/id :categories)
                                         :arg      [{(format-field-name :name) "NEW_A"}
                                                    {(format-field-name :name) "NEW_B"}]})))
        (is (= [[76 "NEW_A"]
                [77 "NEW_B"]]
               (mt/rows (mt/run-mbql-query categories {:filter   [:starts-with $name "NEW"]
                                                       :order-by [[:asc $id]]}))))
        (is (= 77
               (categories-row-count)))))))

(deftest bulk-create-failure-test
  (testing "bulk/create"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (testing "error in some of the rows in request body"
          (is (= 75
                 (categories-row-count)))
          (testing "Should report indices of bad rows"
            (is-ex-data
             {:errors [(s/one {:index (s/eq 1)
                               :error (case driver/*driver*
                                        :h2       #"^NULL not allowed for column \"NAME\""
                                        :postgres #"^ERROR: null value in column \"name\""
                                        :mysql    #"Column 'name' cannot be null")}
                              "first error")
                       (s/one {:index (s/eq 3)
                               :error (case driver/*driver*
                                        :h2       #"^Data conversion error converting \"STRING\""
                                        :postgres #"^ERROR: invalid input syntax for (?:type )?integer: \"STRING\""
                                        ;; Newer versions of MySQL check for not null fields without default values
                                        ;; before checking the type of the parameter.
                                        ;; MySQL 5.7 checks the type of the parameter first.
                                        :mysql    #"Field 'name' doesn't have a default value|Incorrect integer value: 'STRING' for column 'id'")}
                              "second error")]
              :status-code (s/eq 400)}
             (actions/perform-action! :bulk/create
                                      {:database (mt/id)
                                       :table-id (mt/id :categories)
                                       :arg [{(format-field-name :name) "NEW_A"}
                                             ;; invalid because name has to be non-nil
                                             {(format-field-name :name) nil}
                                             {(format-field-name :name) "NEW_B"}
                                             ;; invalid because ID is supposed to be an integer
                                             {(format-field-name :id) "STRING"}]})))
          (testing "Should not have committed any of the valid rows"
            (is (= 75
                   (categories-row-count)))))))))

(deftest bulk-delete-happy-path-test
  (testing "bulk/delete"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (is (= 75
               (categories-row-count)))
        (is (= {:success true}
               (actions/perform-action! :bulk/delete
                                        {:database (mt/id)
                                         :table-id (mt/id :categories)
                                         :arg [{(format-field-name :id) 74}
                                               {(format-field-name :id) 75}]})))
        (is (= 73
               (categories-row-count)))))))

(deftest bulk-delete-failure-test
  (testing "bulk/delete"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (testing "error in some of the rows"
          (is (= 75
                 (categories-row-count)))
          (testing "Should report indices of bad rows"
            (is-ex-data
             {:errors
              [(s/one
                {:index (s/eq 1)
                 :error #"Error filtering against :type/(?:Big)?Integer Field: unable to parse String \"foo\" to a :type/(?:Big)?Integer"}
                "first error")
               (s/one
                {:index (s/eq 3)
                 :error #"Sorry, the row you're trying to delete doesn't exist"}
                "second error")]
              :status-code (s/eq 400)}
             (actions/perform-action! :bulk/delete
                                      {:database (mt/id)
                                       :table-id (mt/id :categories)
                                       :arg
                                       [{(format-field-name :id) 74}
                                        {(format-field-name :id) "foo"}
                                        {(format-field-name :id) 75}
                                        {(format-field-name :id) 107}]})))
          (testing "Should report non-pk keys"
            (is (thrown-with-msg? Exception (re-pattern (format "Rows have the wrong columns: expected #\\{%s\\}, but got #\\{%s\\}"
                                                                (pr-str (name (format-field-name :id)))
                                                                (pr-str (name (format-field-name :nonid)))))
                                  (actions/perform-action! :bulk/delete
                                                           {:database (mt/id)
                                                            :table-id (mt/id :categories)
                                                            :arg
                                                            [{(format-field-name :nonid) 75}]})))
            (testing "Even if all PK columns are specified"
              (is (thrown-with-msg? Exception (re-pattern (format "Rows have the wrong columns: expected #\\{%s\\}, but got #\\{%s %s\\}"
                                                                  (pr-str (name (format-field-name :id)))
                                                                  (pr-str (name (format-field-name :id)))
                                                                  (pr-str (name (format-field-name :nonid)))))
                                    (actions/perform-action! :bulk/delete
                                                             {:database (mt/id)
                                                              :table-id (mt/id :categories)
                                                              :arg
                                                              [{(format-field-name :id)    75
                                                                (format-field-name :nonid) 75}]})))))
          (testing "Should report repeat rows"
            (is (thrown-with-msg? Exception (re-pattern (format "Rows need to be unique: repeated rows \\{%s 74\\} × 3, \\{%s 75\\} × 2"
                                                                (pr-str (name (format-field-name :id)))
                                                                (pr-str (name (format-field-name :id)))))
                                  (actions/perform-action! :bulk/delete
                                                           {:database (mt/id)
                                                            :table-id (mt/id :categories)
                                                            :arg
                                                            [{(format-field-name :id) 73}
                                                             {(format-field-name :id) 74}
                                                             {(format-field-name :id) 74}
                                                             {(format-field-name :id) 74}
                                                             {(format-field-name :id) 75}
                                                             {(format-field-name :id) 75}]}))))
          (is (= 75
                 (categories-row-count))))))))

(defn- first-three-categories []
  (mt/rows (mt/run-mbql-query categories {:filter [:< $id 4], :order-by [[:asc $id]]})))

(deftest bulk-update-happy-path-test
  (testing "bulk/update"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (is (= [[1 "African"]
                [2 "American"]
                [3 "Artisan"]]
               (first-three-categories)))
        (is (= {:rows-updated 2}
               (actions/perform-action! :bulk/update
                                        {:database (mt/id)
                                         :table-id (mt/id :categories)
                                         :arg
                                         (let [id   (format-field-name :id)
                                               name (format-field-name :name)]
                                           [{id 1, name "Seed Bowl"}
                                            {id 2, name "Millet Treat"}])})))

        (testing "rows should be updated in the DB"
          (is (= [[1 "Seed Bowl"]
                  [2 "Millet Treat"]
                  [3 "Artisan"]]
                 (first-three-categories))))))))

(deftest bulk-update-failure-test
  (testing "bulk/update"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled
        (let [id                 (format-field-name :id)
              name               (format-field-name :name)
              update-categories! (fn [rows]
                                   (actions/perform-action! :bulk/update
                                                            {:database (mt/id)
                                                             :table-id (mt/id :categories)
                                                             :arg
                                                             rows}))]
          (testing "Initial values"
            (is (= [[1 "African"]
                    [2 "American"]
                    [3 "Artisan"]]
                   (first-three-categories))))
          (testing "Should report the index of input rows with errors in the data warehouse"
            (let [error-message-regex (case driver/*driver*
                                        :h2       #"^NULL not allowed for column \"NAME\""
                                        :postgres #"^ERROR: null value in column \"name\" (?:of relation \"categories\" )?violates not-null constraint"
                                        :mysql    #"Column 'name' cannot be null")]
              (is-ex-data
               {:errors   [(s/one
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
                                    {id 3, name nil}]))))
          ;; TODO -- maybe this should come back with the row index as well. Maybe it's a little less important for the
          ;; Clojure-side validation because an error like this is presumably the result of the frontend passing in bad
          ;; maps since it should be enforcing this in the FE client as well. Row indexes are more important for errors
          ;; that happen in the DW since they often can't be enforced in the frontend client OR in the backend without
          ;; actually hitting the DW
          (testing "Should validate that every row has required PK columns"
            (is (thrown-with-msg? Exception (re-pattern (format "Row is missing required primary key column. Required #\\{%s\\}; got #\\{%s\\}"
                                                                (pr-str (clojure.core/name (format-field-name :id)))
                                                                (pr-str (clojure.core/name (format-field-name :name)))))
                                  (update-categories! [{id 1, name "Seed Bowl"}
                                                       {name "Millet Treat"}]))))
          (testing "Should validate that the fields in the row maps are valid for the Table"
            (is-ex-data {:errors [(s/one
                                   {:index (s/eq 0)
                                    :error (case driver/*driver*
                                             :h2       #"^Column \"FAKE\" not found"
                                             :postgres #"ERROR: column \"fake\" of relation \"categories\" does not exist"
                                             :mysql    #"Unknown column 'fake'")}
                                   "first error")]
                         s/Keyword s/Any}
                        (update-categories! [{id 1, (format-field-name :fake) "FAKE"}])))
          (testing "Should throw error if row does not contain any non-PK columns"
            (is (thrown-with-msg? Exception (re-pattern (format "Invalid update row map: no non-PK columns. Got #\\{%s\\}, all of which are PKs."
                                                                (pr-str (clojure.core/name (format-field-name :id)))))
                                  (update-categories! [{id 1}]))))
          (testing "Rows should be unchanged"
            (is (= [[1 "African"]
                    [2 "American"]
                    [3 "Artisan"]]
                   (first-three-categories)))))))))
