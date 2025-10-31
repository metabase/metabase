(ns ^:mb/driver-tests metabase.actions.actions-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.actions.actions :as actions]
   [metabase.actions.error :as actions.error]
   [metabase.actions.execution :as actions.execution]
   [metabase.actions.models :as action]
   [metabase.api.common :refer [*current-user-permissions-set*]]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.test-util :as driver.tu]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk] (mt/with-test-user :rasta (thunk))))

(def ^:private test-scope {:unknown :model-action})

(defmacro with-actions-test-data-and-actions-permissively-enabled!
  "Combines [[mt/with-actions-test-data-and-actions-enabled]] with full permissions."
  {:style/indent 0}
  [& body]
  `(mt/with-actions-test-data-and-actions-enabled
     (binding [*current-user-permissions-set* (delay #{"/"})]
       ~@body)))

(mu/defn- format-field-name :- :string
  "Format `field-name` appropriately for the current driver (e.g. uppercase it if we're testing against H2)."
  [field-name]
  (name (mt/format-name (name field-name))))

(defn- categories-row-count []
  (first (mt/first-row (mt/run-mbql-query categories {:aggregation [[:count]], :limit 1}))))

(deftest create-test
  (testing "row/create"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (let [response (actions/perform-action! :model.row/create
                                                (assoc (mt/mbql-query categories) :create-row {(format-field-name :name) "created_row"}))]
          (is (=? {:created-row {(format-field-name :id)   76
                                 (format-field-name :name) "created_row"}}
                  response)
              "Create should return the entire row")
          (let [created-id (get-in response [:created-row (format-field-name :id)])]
            (is (= "created_row" (-> (mt/rows (mt/run-mbql-query categories {:filter [:= $id created-id]})) last last))
                "The record at created-id should now have its name set to \"created_row\"")))))))

(deftest create-invalid-data-test
  (testing "row/create -- invalid data"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
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
                              (actions/perform-action! :model.row/create
                                                       (assoc (mt/mbql-query categories) :create-row {(format-field-name :id) "created_row"}))))
        (testing "no row should have been inserted"
          (is (= 75
                 (categories-row-count))))))))

(deftest update-test
  (testing "row/update"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (is (= {:rows-updated 1}
               (actions/perform-action! :model.row/update
                                        (assoc (mt/mbql-query categories {:filter [:= $id 50]})
                                               :update_row {(format-field-name :name) "updated_row"})))
            "Update should return the right shape")
        (is (= "updated_row"
               (-> (mt/rows (mt/run-mbql-query categories {:filter [:= $id 50]})) last last))
            "The row should actually be updated")))))

(deftest delete-test
  (testing "row/delete"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (is (= {:rows-deleted 1}
               (actions/perform-action! :model.row/delete
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
  [{:action       :model.row/create
    :request-body (assoc (mt/mbql-query categories) :create-row {(format-field-name :name) "created_row"})
    :expect-fn    (fn [result]
                    ;; check that we return the entire row
                    (is (malli= [:map {:closed true}
                                 [:created-row [:map {:closed true}
                                                [(format-field-name :id)   ms/PositiveInt]
                                                [(format-field-name :name) ms/NonBlankString]]]]
                                result)))}
   {:action       :model.row/update
    :request-body (assoc (mt/mbql-query categories {:filter [:= $id 1]})
                         :update_row {(format-field-name :name) "updated_row"})
    :expected     {:rows-updated 1}}
   {:action       :model.row/delete
    :request-body (mt/mbql-query categories {:filter [:= $id 1]})
    :expected     {:rows-deleted 1}}
   {:action       :model.row/update
    :request-body (assoc (mt/mbql-query categories {:filter [:= $id 10]})
                         :update_row {(format-field-name :name) "new-category-name"})
    :expected     {:rows-updated 1}}])

(deftest feature-flags-test
  (doseq [{:keys [action request-body]} (mock-requests)]
    (testing action
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-actions false}}
        (binding [*current-user-permissions-set* (delay #{"/"})]
          (testing "Should return a 400 if Database feature flag is disabled."
            (is (thrown-with-msg?
                 Throwable
                 #"\QActions are not enabled.\E"
                 (actions/perform-action! action request-body)))
            (try
              (actions/perform-action! action request-body)
              (catch Throwable e
                (is (=? {:database-id (mt/id)}
                        (ex-data e)))))))))))

(driver/register! ::feature-flag-test-driver, :parent :h2)

(defmethod driver/database-supports? [::feature-flag-test-driver :actions]
  [_driver _feature _database]
  false)

(deftest actions-feature-test
  (testing "Only allow actions for drivers that support the `:actions` driver feature. (#22557)"
    (mt/with-temp [:model/Database {db-id :id}    {:name     "Birds"
                                                   :engine   ::feature-flag-test-driver
                                                   :settings {:database-enable-actions true}}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (is (thrown-with-msg? Exception (re-pattern
                                       (format "%s Database %d \"Birds\" does not support actions."
                                               (u/qualified-name ::feature-flag-test-driver)
                                               db-id))
                            ;; TODO -- not sure what the actual shape of this API is supposed to look like. We'll have to
                            ;; update this test when the PR to support row insertion is in.
                            (actions/perform-action-v2! :table/insert
                                                        test-scope
                                                        [{:database db-id
                                                          :table-id table-id
                                                          :values   {:name "Toucannery"}}]))))))

(defn- row-action? [action]
  (= (namespace action) "row"))

(deftest validation-test
  (mt/with-actions-enabled
    (doseq [{:keys [action request-body]} (mock-requests)
            :when (row-action? action)]
      (testing (str action " without :query")
        (is (thrown-with-msg?
             Exception
             #"\QNative queries must not specify `:query`; MBQL queries must not specify `:native`.\E"
             (actions/perform-action! action (-> request-body
                                                 (dissoc :query)
                                                 (assoc :native {:query "Not really a SQL query"})))))))))

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
                                (actions/perform-action! :model.row/update query-that-returns-more-than-one)))
          (is (thrown-with-msg? Exception #"Sorry, the row you're trying to update doesn't exist"
                                (actions/perform-action! :model.row/update query-that-returns-zero-row)))
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
                                (actions/perform-action! :model.row/delete query-that-returns-more-than-one)))
          (is (thrown-with-msg? Exception #"Sorry, the row you're trying to delete doesn't exist"
                                (actions/perform-action! :model.row/delete query-that-returns-zero-row)))
          (is (= result-count (count (mt/rows (qp/process-query query-that-returns-more-than-one))))
              "The result-count after a rollback must remain the same!"))))))

(deftest row-delete-unparseable-values-test
  (testing "row/delete"
    (testing "should return error message if value cannot be parsed correctly for Field in question"
      (mt/test-drivers (mt/normal-drivers-with-feature :actions)
        (with-actions-test-data-and-actions-permissively-enabled!
          (is (thrown-with-msg? Exception #"Error filtering against :type/(Big)?Integer Field: unable to parse String \"one\" to a :type/(Big)?Integer"
                                ;; TODO -- this really should be returning a 400 but we need to rework the code in
                                ;; [[metabase.driver.sql-jdbc.actions]] a little to have that happen without changing other stuff
                                ;; that SHOULD be returning a 404
                                (actions/perform-action! :model.row/delete
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
          (with-actions-test-data-and-actions-permissively-enabled!

            ;; attempting to delete the `Pizza` category should fail because there are several rows in `venues` that have
            ;; this `category_id` -- it's an FK constraint violation.
            (is (thrown-with-msg? Exception (case driver/*driver*
                                              ;; TODO -- we need nice error messages for `:h2`, and need to implement
                                              ;; [[metabase.driver.sql-jdbc.actions/parse-sql-error]] for it
                                              :h2       #"Referential integrity constraint violation.*PUBLIC\.VENUES FOREIGN KEY\(CATEGORY_ID\) REFERENCES PUBLIC\.CATEGORIES\(ID\).*"
                                              :postgres #"violates foreign key constraint .*"
                                              :mysql    #"Cannot delete or update a parent row: a foreign key constraint fails .*")
                                  (actions/perform-action! :model.row/delete (mt/mbql-query categories {:filter [:= $id 58]})))
                "Delete should return the right shape")
            (testing "no rows should have been deleted"
              (is (= 75
                     (categories-row-count))))))))))

(defmacro ^:private is-ex-data [expected-schema actual-call]
  `(try
     ~actual-call
     (is (true? false))
     (catch clojure.lang.ExceptionInfo e#
       (is (~'=?
            ~expected-schema
            (assoc (ex-data e#) ::message (ex-message e#)))))))

(deftest table-row-create-happy-path-test
  (testing "table.row/create"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (let [db-id    (mt/id)
              table-id (mt/id :categories)
              id-col   (format-field-name :id)
              name-col (format-field-name :name)]
          (is (= 75
                 (categories-row-count)))
          (is (= [{:table-id table-id, :op :created, :row {id-col 76, name-col "NEW_A"}}
                  {:table-id table-id, :op :created, :row {id-col 77, name-col "NEW_B"}}]
                 (:outputs
                  (actions/perform-action-v2! :table.row/create
                                              test-scope
                                              [{:database db-id, :table-id table-id, :row {name-col "NEW_A"}}
                                               {:database db-id, :table-id table-id, :row {name-col "NEW_B"}}]))))
          (is (= [[76 "NEW_A"]
                  [77 "NEW_B"]]
                 (mt/rows (mt/run-mbql-query categories {:filter   [:starts-with $name "NEW"]
                                                         :order-by [[:asc $id]]}))))
          (is (= 77
                 (categories-row-count))))))))

(defn- unset-entity-key! [table-id]
  (t2/update! :model/Field
              {:table_id      table-id
               :semantic_type :type/PK}
              {:semantic_type nil}))

(deftest table-row-create-no-pk
  (testing "table.row/create"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (let [db-id    (mt/id)
              table-id (mt/id :categories)
              name-col (format-field-name :name)]
          (unset-entity-key! table-id)
          (is (= 75
                 (categories-row-count)))
          (is (= {:status-code               400
                  :errors                    [{:index 0, :error "Cannot edit a table without it having at least one entity key configured.", :type :data-editing/no-pk, :status-code 400, :table-id table-id}
                                              {:index 1, :error "Cannot edit a table without it having at least one entity key configured.", :type :data-editing/no-pk, :status-code 400, :table-id table-id}]
                  :results                   []
                  :metabase.util.log/context {:action :table.row/create, :db-id db-id}}
                 (try
                   (actions/perform-action-v2! :table.row/create
                                               test-scope
                                               [{:database db-id, :table-id table-id, :row {name-col "NEW_A"}}
                                                {:database db-id, :table-id table-id, :row {name-col "NEW_B"}}])
                   ::did-not-throw
                   (catch Exception e
                     (or (ex-data e) ::did-not-throw-ex-info)))))
          (is (= []
                 (mt/rows (mt/run-mbql-query categories {:filter   [:starts-with $name "NEW"]
                                                         :order-by [[:asc $id]]}))))
          (is (= 75
                 (categories-row-count))))))))

(deftest table-row-create-failure-test
  (testing "table.row/create"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (testing "error in some of the rows in request body"
          (is (= 75
                 (categories-row-count)))
          (testing "Should report indices of bad rows"
            (is-ex-data
             {:errors [{:index 1
                        :error (case driver/*driver*
                                 :h2       #"(?s)^NULL not allowed for column \"NAME\".*"
                                 :postgres #"(?s)^ERROR: null value in column \"name\".*"
                                 :mysql    #"(?s).*Column 'name' cannot be null.*")}
                       {:index 3
                        :error (case driver/*driver*
                                 :h2       #"(?s)^Data conversion error converting \"STRING\".*"
                                 :postgres #"(?s)^ERROR: invalid input syntax for (?:type )?integer: \"STRING\".*"
                                 ;; Newer versions of MySQL check for not null fields without default values
                                 ;; before checking the type of the parameter.
                                 ;; MySQL 5.7 checks the type of the parameter first.
                                 :mysql    #"(?s)(?:.*Field 'name' doesn't have a default value.*)|(?:.*Incorrect integer value: 'STRING' for column 'id'.*)")}]
              :status-code 400}
             (actions/perform-action-v2!
              :table.row/create
              test-scope
              (for [row [{(format-field-name :name) "NEW_A"}
                         ;; invalid because name has to be non-nil
                         {(format-field-name :name) nil}
                         {(format-field-name :name) "NEW_B"}
                         ;; invalid because ID is supposed to be an integer
                         {(format-field-name :id) "STRING"}]]
                {:database (mt/id)
                 :table-id (mt/id :categories)
                 :row      row}))))
          (testing "Should not have committed any of the valid rows"
            (is (= 75
                   (categories-row-count)))))))))

(deftest table-row-delete-happy-path-test
  (testing "table.row/delete"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (let [table-id (mt/id :categories)]
          (is (= 75 (categories-row-count)))
          (is (= [{:table-id table-id, :op :deleted, :row {:id 75}}
                  {:table-id table-id, :op :deleted, :row {:id 74}}]
                 (walk/postwalk
                  (fn [x]
                    (if (map? x)
                      (u/lower-case-map-keys x)
                      x))
                  (:outputs
                   (actions/perform-action-v2! :table.row/delete
                                               test-scope
                                               [{:database (mt/id)
                                                 :table-id table-id
                                                 :row      {(format-field-name :id) 75}}
                                                {:database (mt/id)
                                                 :table-id table-id
                                                 :row      {(format-field-name :id) 74}}])))))
          (is (= 73 (categories-row-count))))))))

(deftest table-row-delete-no-pk
  (testing "table.row/delete"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (let [db-id    (mt/id)
              table-id (mt/id :categories)]
          (unset-entity-key! table-id)

          (is (= 75 (categories-row-count)))
          (is (= {:type                      :data-editing/no-pk
                  :status-code               400
                  :table-id                  table-id
                  :metabase.util.log/context {:action :table.row/delete
                                              :db-id  db-id}}
                 (try
                   (actions/perform-action-v2! :table.row/delete
                                               test-scope
                                               [{:database db-id
                                                 :table-id table-id
                                                 :row      {}}])
                   ::did-not-throw
                   (catch Exception e
                     (or (ex-data e) ::did-not-throw-ex-info)))))
          (testing "nothing was deleted"
            (is (= 75 (categories-row-count)))))))))

(deftest table-row-delete-failure-test
  (testing "table.row/delete"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (testing "error in some of the rows"
          (is (= 75
                 (categories-row-count)))
          (testing "Should report indices of bad rows"
            (is-ex-data
             {:errors
              [{:index 1
                :error #".*Error filtering against :type/(?:Big)?Integer Field: unable to parse String \"foo\" to a :type/(?:Big)?Integer"}
               {:index 3
                :error #"Sorry, the row you're trying to delete doesn't exist"}]
              :status-code 400}
             (actions/perform-action-v2! :table.row/delete
                                         test-scope
                                         (for [row [{(format-field-name :id) 74}
                                                    {(format-field-name :id) "foo"}
                                                    {(format-field-name :id) 75}
                                                    {(format-field-name :id) 107}]]
                                           {:database (mt/id)
                                            :table-id (mt/id :categories)
                                            :row      row}))))
          (testing "Should report non-pk keys"
            (is (thrown-with-msg? Exception (re-pattern (format "Rows have the wrong columns: expected #\\{%s\\}, but got #\\{%s\\}"
                                                                (pr-str (name (format-field-name :id)))
                                                                (pr-str (name (format-field-name :nonid)))))
                                  (actions/perform-action-v2! :table.row/delete
                                                              test-scope
                                                              [{:database (mt/id)
                                                                :table-id (mt/id :categories)
                                                                :row      {(format-field-name :nonid) 75}}])))
            (testing "Even if all PK columns are specified"
              (is (thrown-with-msg? Exception (re-pattern (format "Rows have the wrong columns: expected #\\{%s\\}, but got #\\{%s %s\\}"
                                                                  (pr-str (name (format-field-name :id)))
                                                                  (pr-str (name (format-field-name :id)))
                                                                  (pr-str (name (format-field-name :nonid)))))
                                    (actions/perform-action-v2! :table.row/delete
                                                                test-scope
                                                                (for [row [{(format-field-name :id)    75
                                                                            (format-field-name :nonid) 75}]]
                                                                  {:database (mt/id)
                                                                   :table-id (mt/id :categories)
                                                                   :row      row}))))))
          (testing "Should report repeat rows"
            (is (thrown-with-msg? Exception (re-pattern (format "Rows need to be unique: repeated rows \\{%s 74\\} × 3, \\{%s 75\\} × 2"
                                                                (pr-str (name (format-field-name :id)))
                                                                (pr-str (name (format-field-name :id)))))
                                  (actions/perform-action-v2! :table.row/delete
                                                              test-scope
                                                              (for [row [{(format-field-name :id) 73}
                                                                         {(format-field-name :id) 74}
                                                                         {(format-field-name :id) 74}
                                                                         {(format-field-name :id) 74}
                                                                         {(format-field-name :id) 75}
                                                                         {(format-field-name :id) 75}]]
                                                                {:database (mt/id)
                                                                 :table-id (mt/id :categories)
                                                                 :row      row})))))
          (is (= 75
                 (categories-row-count))))))))

(defn- first-three-categories []
  (mt/rows (mt/run-mbql-query categories {:filter [:< $id 4], :order-by [[:asc $id]]})))

(deftest table-row-update-happy-path-test
  (testing "table.row/update"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (let [table-id (mt/id :categories)]
          (is (= [[1 "African"]
                  [2 "American"]
                  [3 "Artisan"]]
                 (first-three-categories)))
          (is (= [{:table-id table-id, :op :updated, :row {(format-field-name :id) 1 (format-field-name :name) "Seed Bowl"}}
                  {:table-id table-id, :op :updated, :row {(format-field-name :id) 2 (format-field-name :name) "Millet Treat"}}]
                 (let [id   (format-field-name :id)
                       name (format-field-name :name)]
                   (:outputs
                    (actions/perform-action-v2! :table.row/update
                                                test-scope
                                                (for [row [{id 1, name "Seed Bowl"}
                                                           {id 2, name "Millet Treat"}]]
                                                  {:database (mt/id)
                                                   :table-id table-id
                                                   :row      row}))))))

          (testing "rows should be updated in the DB"
            (is (= [[1 "Seed Bowl"]
                    [2 "Millet Treat"]
                    [3 "Artisan"]]
                   (first-three-categories)))))))))

(deftest table-row-update-no-pk
  (testing "table.row/update"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (let [db-id    (mt/id)
              table-id (mt/id :categories)]
          (unset-entity-key! table-id)
          (is (= [[1 "African"]
                  [2 "American"]
                  [3 "Artisan"]]
                 (first-three-categories)))

          (is (= {:type                      :data-editing/no-pk
                  :status-code               400
                  :table-id                  table-id
                  :metabase.util.log/context {:action :table.row/update
                                              :db-id  db-id}}
                 (try
                   (let [id   (format-field-name :id)
                         name (format-field-name :name)]
                     (actions/perform-action-v2! :table.row/update
                                                 test-scope
                                                 (for [row [{id 1, name "Seed Bowl"}
                                                            {id 2, name "Millet Treat"}]]
                                                   {:database db-id
                                                    :table-id table-id
                                                    :row      row})))
                   ::did-not-throw
                   (catch Exception e
                     (or (ex-data e) ::did-not-throw-ex-info)))))

          (testing "rows should NOT be updated in the DB"
            (is (= [[1 "African"]
                    [2 "American"]
                    [3 "Artisan"]]
                   (first-three-categories)))))))))

(deftest table-row-update-failure-test
  (testing "table.row/update"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (with-actions-test-data-and-actions-permissively-enabled!
        (let [id                 (format-field-name :id)
              name               (format-field-name :name)
              update-categories! (fn [rows]
                                   (actions/perform-action-v2! :table.row/update
                                                               test-scope
                                                               (for [row rows]
                                                                 {:database (mt/id)
                                                                  :table-id (mt/id :categories)
                                                                  :row      row})))]
          (testing "Initial values"
            (is (= [[1 "African"]
                    [2 "American"]
                    [3 "Artisan"]]
                   (first-three-categories))))
          (testing "Should report the index of input rows with errors in the data warehouse"
            (let [error-message-regex (case driver/*driver*
                                        :h2       #"(?s)^NULL not allowed for column \"NAME\".*"
                                        :postgres #"(?s)^ERROR: null value in column \"name\" (?:of relation \"categories\" )?violates not-null constraint.*"
                                        :mysql    #"(?s).*Column 'name' cannot be null.*")]
              (is-ex-data
               {:errors   [{:index 0
                            :error error-message-regex}
                           {:index 2
                            :error error-message-regex}]}
               (update-categories! [{id 1, name nil}
                                    {id 2, name "Millet Treat"}
                                    {id 3, name nil}]))))
          ;; TODO -- maybe this should come back with the row index as well. Maybe it's a little less important for the
          ;; Clojure-side validation because an error like this is presumably the result of the frontend passing in bad
          ;; maps since it should be enforcing this in the FE client as well. Row indexes are more important for errors
          ;; that happen in the DW since they often can't be enforced in the frontend client OR in the backend without
          ;; actually hitting the DW
          (testing "Should validate that every row has required PK columns"
            (is (thrown-with-msg? Exception (re-pattern (format "Row is missing required primary key column. Required \\(%s\\); got \\(%s\\)"
                                                                (pr-str (clojure.core/name (format-field-name :id)))
                                                                (pr-str (clojure.core/name (format-field-name :name)))))
                                  (update-categories! [{id 1, name "Seed Bowl"}
                                                       {name "Millet Treat"}]))))
          (testing "Should validate that the fields in the row maps are valid for the Table"
            (is-ex-data {:errors [{:index 0
                                   :error (case driver/*driver*
                                            :h2       #"(?s)^Column \"FAKE\" not found.*"
                                            :postgres #"(?s).*ERROR: column \"fake\" of relation \"categories\" does not exist.*"
                                            :mysql    #"(?s).*Unknown column 'fake'.*")}]}
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

(deftest actions-on-ssh-tunneled-db
  ;; testing actions against dbs with ssh tunnels. Use an in-memory ssh server that just forwards to the correct port
  ;; through localhost. Since it is local, it's possible for the application to ignore the ssh tunnel and just talk to
  ;; the db on the correct port. So we do the tests twice, once expecting the correct answer, and then again with the
  ;; wrong password for the ssh tunnel and we expect failures. This ensures that the correct result is actually going
  ;; through the ssh tunnel
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :actions) :h2)
    (let [username "username", password "password"]
      (with-open [ssh-server (driver.tu/basic-auth-ssh-server username password)]
        (doseq [[correct-password? ssh-password] [[true password] [false "wrong-password"]]]
          (with-actions-test-data-and-actions-permissively-enabled!
            (let [ssh-port (.getPort ssh-server)
                  table-id (mt/id :categories)]
              (let [details (t2/select-one-fn :details 'Database :id (mt/id))]
                (t2/update! 'Database (mt/id)
                            ;; enable ssh tunnel
                            {:details (assoc details
                                             :tunnel-enabled true
                                             :tunnel-host "localhost"
                                             :tunnel-auth-option "password"
                                             :tunnel-port ssh-port
                                             :tunnel-user username
                                             :tunnel-pass ssh-password)}))
              (testing "Can perform implicit actions on ssh-enabled database"
                (let [response (try (:outputs
                                     (actions/perform-action-v2!
                                      :table.row/update
                                      test-scope
                                      (let [id   (format-field-name :id)
                                            name (format-field-name :name)]
                                        (for [row [{id 1, name "Seed Bowl"}
                                                   {id 2, name "Millet Treat"}]]
                                          {:database (mt/id)
                                           :table-id table-id
                                           :row      row}))))
                                    (catch Exception e e))]
                  (if correct-password?
                    (is (= [{:table-id table-id, :op :updated, :row {(format-field-name :id) 1, (format-field-name :name) "Seed Bowl"}}
                            {:table-id table-id, :op :updated, :row {(format-field-name :id) 2, (format-field-name :name) "Millet Treat"}}]
                           response))
                    (do
                      (is (instance? Exception response) "Did not get an error with wrong password")
                      (is (some (partial instance? org.apache.sshd.common.SshException)
                                (u/full-exception-chain response))
                          "None of the errors are from ssh")))))
              (testing "Can perform custom actions on ssh-enabled database"
                (let [query (update (mt/native-query
                                     {:query "update categories set name = 'foo' where id = {{id}}"
                                      :template-tags {:id {:id "id"
                                                           :name "id"
                                                           :type "number"
                                                           :display-name "Id"}}})
                                    :type name)]
                  (mt/with-actions [{card-id :id} {:type :model
                                                   :dataset_query (mt/mbql-query categories)}
                                    {action-id :action-id} {:name                   "Query example"
                                                            :type                   :query
                                                            :model_id               card-id
                                                            :dataset_query          query
                                                            :database_id            (mt/id)
                                                            :parameters             [{:id "id"
                                                                                      :type :number/=
                                                                                      :target [:variable
                                                                                               [:template-tag "id"]]
                                                                                      :name "Id"
                                                                                      :slug "id"
                                                                                      :hasVariableTemplateTagTarget true}]
                                                            :visualization_settings {:position "top"}}]
                    (let [action (action/select-action :id action-id)]
                      (if correct-password?
                        (is (= {:rows-affected 1}
                               (actions.execution/execute-action! action {"id" 1})))
                        (let [response (try (actions.execution/execute-action! action {"id" 1})
                                            (catch Exception e e))]
                          (is (instance? Exception response) "Did not get an error with wrong password")
                          (is (some (partial instance? org.apache.sshd.common.SshException)
                                    (u/full-exception-chain response))
                              "None of the errors are from ssh"))))))))))))))

(defmacro with-uuids-test-data-and-actions-permissively-enabled!
  "Combines [[mt/with-actions-test-data-and-actions-enabled]] with full permissions."
  {:style/indent 0}
  [& body]
  `(mt/with-temp-test-data [["ants"
                             [{:field-name "id"
                               :base-type :type/UUID
                               :pk? true}
                              {:field-name "name"
                               :base-type :type/Text}]
                             [[#uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859" "Tim"]
                              [#uuid "d39bbe77-4e2e-4b7b-8565-cce90c25c99b" "Bob"]
                              [#uuid "b34b5c6e-2613-494a-9278-8a74c7ea915e" "Jane"]]]]
     (mt/with-actions-enabled
       (binding [*current-user-permissions-set* (delay #{"/"})]
         ~@body))))

(deftest uuid-update-test
  (testing "row/update with uuids"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions :uuid-type)
      (with-uuids-test-data-and-actions-permissively-enabled!
        (is (= {:rows-updated 1}
               (actions/perform-action!
                :model.row/update
                (assoc (mt/mbql-query ants {:filter [:= $id "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]})
                       :update_row {(format-field-name :name) "updated_row"})))
            "Update should return the right shape")
        (is (= "updated_row"
               (-> (mt/rows (mt/run-mbql-query ants
                              {:filter [:= $id "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]}))
                   last
                   last))
            "The row should actually be updated")))))

(deftest uuid-create-test
  (testing "row/create with uuids"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions :uuid-type)
      (with-uuids-test-data-and-actions-permissively-enabled!
        (let [response (actions/perform-action!
                        :model.row/create
                        (assoc (mt/mbql-query ants)
                               :create-row {(format-field-name :id) "5cba6f11-2325-400f-8f2e-82fbdc6f181c"
                                            (format-field-name :name) "created_row"}))]
          (is (=? {:created-row {(format-field-name :id)   #uuid "5cba6f11-2325-400f-8f2e-82fbdc6f181c"
                                 (format-field-name :name) "created_row"}}
                  response)
              "Create should return the entire row")
          (is (= "created_row"
                 (-> (mt/rows (mt/run-mbql-query ants
                                {:filter [:= $id "5cba6f11-2325-400f-8f2e-82fbdc6f181c"]}))
                     last
                     last))
              "The row should actually be created"))))))

(deftest uuid-delete-test
  (testing "row/delete with uuids"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions :uuid-type)
      (with-uuids-test-data-and-actions-permissively-enabled!
        (is (= {:rows-deleted 1}
               (actions/perform-action!
                :model.row/delete
                (mt/mbql-query ants {:filter [:= $id "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]})))
            "Delete should return the right shape")
        (is (= 2 (first (mt/first-row (mt/run-mbql-query ants {:aggregation [[:count]], :limit 1})))))
        (is (= [] (mt/rows (mt/run-mbql-query ants {:filter [:= $id "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]})))
            "Selecting for deleted rows should return an empty result")))))

(deftest test-permission-denied-errors
  (testing "Permission denied errors should return nice error messages"
    ;; can't create users with restricted permissions in h2
    (mt/with-actions-enabled
      (mt/test-drivers (disj (mt/normal-drivers-with-feature :actions) :h2)
        (let [test-db-name   "permission_test"
              test-user-name "test_user"]
          ;; Create a test database with test data
          (tx/drop-if-exists-and-create-db! driver/*driver* test-db-name)
          (let [details    (mt/dbdef->connection-details driver/*driver* :db {:database-name test-db-name})
                admin-spec (sql-jdbc.conn/connection-details->spec driver/*driver* details)]
            ;; Set up test data and user with limited permissions
            (doseq [stmt (concat
                          ;; Create the categories table with test data
                          ["CREATE TABLE categories (id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL);"
                           "INSERT INTO categories (id, name) VALUES (1, 'Test Category');"
                           "INSERT INTO categories (id, name) VALUES (2, 'Another Category');"]
                          ;; Create test user with no password and only SELECT permissions
                          [(format "DROP USER IF EXISTS %s" test-user-name)
                           (case driver/*driver*
                             :postgres (format "CREATE USER %s WITH PASSWORD '123456';" test-user-name)
                             :mysql    (format "CREATE USER '%s'" test-user-name))
                           (case driver/*driver*
                             :postgres (format "GRANT SELECT ON TABLE categories TO %s" test-user-name)
                             :mysql    (format "GRANT SELECT ON %s.categories TO '%s'" test-db-name test-user-name))])]
              (when stmt
                (jdbc/execute! admin-spec [stmt])))

            ;; Create connection details for test user (no password)
            (let [test-user-details (cond-> details
                                      (= driver/*driver* :mysql)
                                      (assoc :user test-user-name
                                             :additional-options "useSSL=false&allowPublicKeyRetrieval=true")

                                      (= driver/*driver* :postgres)
                                      (assoc :user test-user-name
                                             :password "123456"))]
              ;; Create temporary database with test user credentials
              (mt/with-temp [:model/Database test-database {:engine driver/*driver*, :details test-user-details :settings {:database-enable-actions true
                                                                                                                           :database-enable-table-editing true}}]
                ;; Sync the database to get table metadata
                (sync/sync-database! test-database)
                (let [table-id (t2/select-one-pk :model/Table :db_id (:id test-database) :name "categories")]
                  (testing (str "INSERT permission denied for " driver/*driver*)
                    (let [result (try
                                   (actions/perform-action-v2!
                                    :table.row/create
                                    test-scope
                                    [{:database (:id test-database)
                                      :table-id table-id
                                      :row      {"name" "New Test Category"}}])
                                   nil
                                   (catch Exception e
                                     (ex-data e)))
                          first-error (first (:errors result))]
                      (is (= 400 (:status-code result)))
                      (is (= actions.error/violate-permission-constraint (:type first-error)))
                      (is (= "You don't have permission to add data to this table." (:message first-error)))))

                  (testing (str "UPDATE permission denied for " driver/*driver*)
                    (let [result (try
                                   (actions/perform-action-v2!
                                    :table.row/update
                                    test-scope
                                    [{:database (:id test-database)
                                      :table-id table-id
                                      :row      {"id" 1 "name" "Updated Category"}}])
                                   nil
                                   (catch Exception e
                                     (ex-data e)))
                          first-error (first (:errors result))]
                      (is (= 400 (:status-code result)))
                      (is (= actions.error/violate-permission-constraint (:type first-error)))
                      (is (= "You don't have permission to update data in this table." (:message first-error)))))

                  (testing (str "DELETE permission denied for " driver/*driver*)
                    (let [result (try
                                   (actions/perform-action-v2!
                                    :table.row/delete
                                    test-scope
                                    [{:database (:id test-database)
                                      :table-id table-id
                                      :row      {"id" 1}}])
                                   nil
                                   (catch Exception e
                                     (ex-data e)))
                          first-error (first (:errors result))]
                      (is (= 400 (:status-code result)))
                      (is (= actions.error/violate-permission-constraint (:type first-error)))
                      (is (= "You don't have permission to delete data from this table." (:message first-error))))))))))))))
