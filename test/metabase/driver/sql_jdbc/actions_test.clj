(ns ^:mb/driver-tests metabase.driver.sql-jdbc.actions-test
  "Most of the tests for code in [[metabase.driver.sql-jdbc.actions]] are e2e tests that live
  in [[metabase.actions-rest.api-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.actions.actions :as actions]
   [metabase.actions.args :as actions.args]
   [metabase.actions.error :as actions.error]
   [metabase.actions.test-util :as actions.tu]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.lib.schema.id :as lib.schema.id]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import (clojure.lang ExceptionInfo)))

(use-fixtures :each (fn [t]
                      (mt/with-test-user :rasta
                        (t))))

(mu/defn- cast-values :- ::actions.args/row
  [driver        :- :keyword
   column->value :- ::actions.args/row
   table-id      :- ::lib.schema.id/table]
  (qp.store/with-metadata-provider (mt/id)
    (#'sql-jdbc.actions/cast-values driver column->value (mt/id) table-id)))

(deftest cast-values-test
  (testing "Should work with underscored Field names (#24166)"
    (is (= {"CATEGORY_ID" (h2x/cast "INTEGER" 50)}
           (cast-values :h2 {"CATEGORY_ID" 50} (mt/id :venues))))
    (testing "Should parse string values as integers"
      (is (= {"CATEGORY_ID" (h2x/cast "INTEGER" "50")}
             (cast-values :h2 {"CATEGORY_ID" "50"} (mt/id :venues))))))
  (testing "Should cache column types for repeated calls"
    (binding [actions/*misc-value-cache* (atom {})]
      (is (= {"CATEGORY_ID" (h2x/cast "INTEGER" 50)}
             (cast-values :h2 {"CATEGORY_ID" 50} (mt/id :venues))))
      (mt/with-temp-vals-in-db :model/Field (mt/id :venues :category_id) {:base_type :type/Float}
        (is (= {"CATEGORY_ID" (h2x/cast "INTEGER" 40)}
               (cast-values :h2 {"CATEGORY_ID" 40} (mt/id :venues))))))))

;; this driver throws an Exception when you call `parse-sql-error`.
(driver/register! ::parse-sql-error-exception, :parent :h2)

(def ^:private parse-sql-error-called? (atom false))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [::parse-sql-error-exception actions.error/incorrect-value-type]
  [_driver _error-type _database _action-type message]
  (reset! parse-sql-error-called? true)
  (throw (ex-info "OOPS I THREW AN EXCEPTION!" {:message message})))

(deftest parse-sql-error-catch-exceptions-test
  (testing "If parse-sql-error throws an Exception, log it and return the unparsed exception instead of failing entirely (#24021)"
    (driver/with-driver ::parse-sql-error-exception
      (mt/with-actions-test-data-tables #{"venues" "categories"}
        (mt/with-actions-test-data-and-actions-enabled
          (reset! parse-sql-error-called? false)
          ;; attempting to delete the `Pizza` category should fail because there are several rows in `venues` that have
          ;; this `category_id` -- it's an FK constraint violation.
          (mt/as-admin
            (is (thrown-with-msg? Exception #"Referential integrity constraint violation:.*"
                                  (actions/perform-action! :model.row/delete (mt/mbql-query categories {:filter [:= $id 58]})))))
          (testing "Make sure our impl was actually called."
            (is @parse-sql-error-called?)))))))

(mt/defdataset action-error-handling
  [["group"
    [{:field-name "name" :base-type :type/Text :not-null? true}
     {:field-name "ranking" :base-type :type/Integer :not-null? true :unique? true}]
    [["admin" 1]
     ["user" 2]]]
   ["user"
    [{:field-name "name" :base-type :type/Text :not-null? true}
     {:field-name "group-id" :base-type :type/Integer :fk "group" :not-null? true}]
    [["crowberto" 1]
     ["rasta"     2]
     ["lucky"     1]]]])

(mt/defdataset action-nullable
  [["thought"
    [{:field-name "name" :base-type :type/Text :not-null? false}]
    [["hungry"]
     ["happy"]]]])

(defn perform-action-ex-data
  "Calls [[actions/perform-action!]] and returns the `ex-data` of exception.
  Used to test error message when executing implicit action for SQL DBs."
  [& args]
  (try
    (apply actions/perform-action! args)
    (catch Exception e
      (ex-data e))))

(defn- field-id->name [id] (t2/select-one-fn :name :model/Field id))

(defn- test-action-error-handling! [f]
  (mt/test-drivers (filter #(isa? driver/hierarchy % :sql-jdbc) (mt/normal-drivers-with-feature :actions))
    (actions.tu/with-actions-temp-db action-error-handling
      (mt/with-actions-enabled
        (let [db-id          (mt/id)]
          (f {:db-id         db-id
              :group-name    (field-id->name (mt/id :group :name))
              :group-ranking (field-id->name (mt/id :group :ranking))
              :user-name     (field-id->name (mt/id :user :name))
              :user-group-id (field-id->name (mt/id :user :group-id))}))))))

(deftest action-error-handling-not-null-constraint-creating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-name]}]
     (testing "violate not-null constraint"
       (is (=? {:message     "Ranking must have values."
                :errors      {"ranking" "You must provide a value."}
                :type        actions.error/violate-not-null-constraint
                :status-code 400}
               (perform-action-ex-data :model.row/create (mt/$ids {:create-row {group-name "admin"}
                                                                   :database   db-id
                                                                   :query      {:source-table $$group}
                                                                   :type       :query}))))))))

(deftest action-error-handling-not-null-constraint-creating-test-2
  (test-action-error-handling!
   (fn [{:keys [db-id group-name]}]
     (testing "violate not-null constraint"
       (testing "when creating"
         (is (=? {:message     "Ranking must have values."
                  :errors      {"ranking" "You must provide a value."}
                  :type        actions.error/violate-not-null-constraint
                  :status-code 400}
                 (perform-action-ex-data :model.row/create (mt/$ids {:create-row {group-name "admin"}
                                                                     :database   db-id
                                                                     :query      {:source-table $$group}
                                                                     :type       :query})))))))))

(deftest action-error-handling-not-null-constraint-updating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-ranking]}]
     (testing "violate not-null constraint"
       (testing "when updating"
         (is (=? {:message     "Ranking must have values."
                  :errors      {"ranking" "You must provide a value."}
                  :type        actions.error/violate-not-null-constraint
                  :status-code 400}
                 (perform-action-ex-data :model.row/update (mt/$ids {:update-row {group-ranking nil}
                                                                     :database   db-id
                                                                     :query      {:filter       [:= $group.id 1]
                                                                                  :source-table $$group}
                                                                     :type       :query})))))))))

(deftest action-error-handling-unique-constraint-creating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-name group-ranking]}]
     (testing "violate unique constraint"
       (testing "when creating"
         (is (=? {:message     "Ranking already exists."
                  :errors      {"ranking" "This Ranking value already exists."}
                  :type        actions.error/violate-unique-constraint
                  :status-code 400}
                 (perform-action-ex-data :model.row/create (mt/$ids {:create-row {group-name    "new"
                                                                                  group-ranking 1}
                                                                     :database   db-id
                                                                     :query      {:source-table $$group}
                                                                     :type       :query})))))))))

(deftest action-error-handling-unique-constraint-updating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-ranking]}]
     (testing "violate unique constraint"
       (testing "when updating"
         (is (=? {:message     "Ranking already exists."
                  :errors      {"ranking" "This Ranking value already exists."}
                  :type        actions.error/violate-unique-constraint
                  :status-code 400}
                 (perform-action-ex-data :model.row/update (mt/$ids {:update-row {group-ranking 2}
                                                                     :database   db-id
                                                                     :query      {:filter [:= $group.id 1]
                                                                                  :source-table $$group}
                                                                     :type       :query})))))))))

(defmethod driver/database-supports? [::driver/driver ::action-error-handling-incorrect-type-error-message]
  [_driver _feature _database]
  true)

(doseq [driver [:h2 :postgres]]
  (defmethod driver/database-supports? [driver ::action-error-handling-incorrect-type-error-message]
    [_driver _feature _database]
    false))

(deftest action-error-handling-incorrect-type-creating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-name group-ranking]}]
     (testing "incorrect type"
       (testing "when creating"
         (is (=? {:message     "Some of your values aren’t of the correct type for the database."
                  :type        actions.error/incorrect-value-type
                  :status-code 400
                  :errors      (if (driver/database-supports?
                                    driver/*driver*
                                    ::action-error-handling-incorrect-type-error-message
                                    (mt/db))
                                 {"ranking" "This value should be of type Integer."}
                                 {})}
                 (perform-action-ex-data :model.row/create (mt/$ids {:create-row {group-name    "new"
                                                                                  group-ranking "S"}
                                                                     :database   db-id
                                                                     :query      {:source-table $$group}
                                                                     :type       :query})))))))))

(deftest action-error-handling-incorrect-type-updating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-ranking]}]
     (testing "incorrect type"
       (testing "when updating"
         (is (=? {:message     "Some of your values aren’t of the correct type for the database."
                  :type        actions.error/incorrect-value-type
                  :status-code 400
                  :errors      (if (driver/database-supports?
                                    driver/*driver*
                                    ::action-error-handling-incorrect-type-error-message
                                    (mt/db))
                                 {"ranking" "This value should be of type Integer."}
                                 {})}
                 (perform-action-ex-data :model.row/update (mt/$ids {:update-row {group-ranking "S"}
                                                                     :database   db-id
                                                                     :query      {:filter [:= $group.id 1]
                                                                                  :source-table $$group}
                                                                     :type       :query})))))))))

(deftest action-error-handling-fk-constraint-creating-test
  (test-action-error-handling!
   (fn [{:keys [db-id user-name user-group-id]}]
     (testing "violate fk constraint"
       (testing "when creating"
         (is (=? {:message     "Unable to create a new record."
                  :errors      {"group_id" "This value does not exist in table \"group\"."}
                  :type        actions.error/violate-foreign-key-constraint
                  :status-code 400}
                 (perform-action-ex-data :model.row/create (mt/$ids {:create-row {user-name    "new"
                                                                                  user-group-id 999}
                                                                     :database   db-id
                                                                     :query      {:source-table $$user}
                                                                     :type       :query})))))))))

(deftest action-error-handling-fk-constraint-updating-test
  (test-action-error-handling!
   (fn [{:keys [db-id user-group-id]}]
     (testing "violate fk constraint"
       (testing "when updating"
         (is (=? {:message     "Unable to update the record."
                  :errors      {"group_id" "This value does not exist in table \"group\"."}
                  :type        actions.error/violate-foreign-key-constraint
                  :status-code 400}
                 (perform-action-ex-data :model.row/update (mt/$ids {:update-row {user-group-id 999}
                                                                     :database   db-id
                                                                     :query      {:filter [:= $user.id 1]
                                                                                  :source-table $$user}
                                                                     :type       :query})))))))))

(deftest action-error-handling-fk-constraint-deleting-test
  (test-action-error-handling!
   (fn [{:keys [db-id]}]
     (testing "violate fk constraint"
       (testing "when deleting"
         (is (=? {:message "Other rows refer to this row so it cannot be deleted."
                  :errors {}
                  :type        actions.error/violate-foreign-key-constraint
                  :status-code 400}
                 (perform-action-ex-data :model.row/delete (mt/$ids {:database db-id
                                                                     :query    {:filter [:= $group.id 1]
                                                                                :source-table $$group}
                                                                     :type     :query})))))))))

(deftest actions-return-rows-with-correct-names-test
  (testing "rows returned by perform action should match the name in metabase_field.name"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (actions.tu/with-actions-temp-db action-error-handling
        (mt/with-actions-enabled
          (let [db-id (mt/id)
                created-user (actions/perform-action!
                              :table.row/create
                              {:database db-id
                               :table-id (mt/id :user)
                               :row      {(field-id->name (mt/id :user :name))    "New User"
                                          (field-id->name (mt/id :user :group-id)) 1}})
                created-user-id (get-in created-user [:row (field-id->name (mt/id :user :id))])]
            (testing ":table.row/create"
              (is (=? {:op       :created
                       :row      {(field-id->name (mt/id :user :group-id)) 1
                                  (field-id->name (mt/id :user :id))       (mt/malli=? int?)
                                  (field-id->name (mt/id :user :name))     "New User"}
                       :table-id (mt/id :user)}
                      created-user)))

            (testing ":table.row/update"
              (is (=? {:op       :updated
                       :row      {(field-id->name (mt/id :user :group-id)) 1
                                  (field-id->name (mt/id :user :id))       (mt/malli=? int?)
                                  (field-id->name (mt/id :user :name))     "New Name"}
                       :table-id (mt/id :user)}
                      (actions/perform-action!
                       :table.row/update
                       {:database db-id
                        :table-id (mt/id :user)
                        :row      {(field-id->name (mt/id :user :id))   created-user-id
                                   (field-id->name (mt/id :user :name)) "New Name"}}))))
            (testing ":table.row/delete"
              (is (=? {:op       :deleted
                       :row      {(field-id->name (mt/id :user :id)) created-user-id}
                       :table-id (mt/id :user)}
                      (actions/perform-action!
                       :table.row/delete
                       {:database db-id
                        :table-id (mt/id :user)
                        :row      {(field-id->name (mt/id :user :id)) created-user-id}}))))))))))

(deftest delete-row-with-children-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (actions.tu/with-actions-temp-db action-error-handling
      (mt/with-actions-enabled
        (let [group-id-col   (field-id->name (mt/id :group :id))
              group-name-col (field-id->name (mt/id :group :name))
              group-rank-col (field-id->name (mt/id :group :ranking))
              user-name-col  (field-id->name (mt/id :user :name))
              user-group-id-col (field-id->name (mt/id :user :group-id))
              new-group      (fn []
                               (-> (actions/perform-action!
                                    :table.row/create
                                    {:database (mt/id)
                                     :table-id (mt/id :group)
                                     :arg      {group-name-col "New Group"
                                                group-rank-col 46}})
                                   :row
                                   (get group-id-col)))

              new-user       (fn [group-id]
                               (actions/perform-action!
                                :table.row/create
                                {:database (mt/id)
                                 :table-id (mt/id :user)
                                 :row      {user-name-col     "New User"
                                            user-group-id-col group-id}}))
              users-of-group (fn [group-id]
                               (-> (mt/run-mbql-query user {:aggregation [:count]
                                                            :filter      [:= $user.group-id group-id]})
                                   mt/rows
                                   first
                                   first))]
          (testing "group without user can be deleted"
            (let [created-group-id (new-group)]
              (is (=? {:op  :deleted
                       :row {group-id-col created-group-id}}
                      (actions/perform-action!
                       :table.row/delete
                       {:database (mt/id)
                        :table-id (mt/id :group)
                        :row      {group-id-col created-group-id}})))))

          (testing "group with user fails due to FK constraint"
            (let [created-group-id (new-group)]
              ;; create 2 users
              (new-user created-group-id)
              (new-user created-group-id)

              (testing "sanity check that we have the users"
                (is (= 2 (users-of-group created-group-id))))

              (testing "we fail if there are children without cascade-on-delete behavior"
                (is (thrown-with-msg?
                     ExceptionInfo
                     #"Error\(s\) deleting rows"
                     (actions/perform-action!
                      :table.row/delete
                      {:database (mt/id)
                       :table-id (mt/id :group)
                       :row      {group-id-col created-group-id}})))))))))))

(deftest create-all-nil-test
  (testing "table.row/create with no optional fields provided"
    ;; This has been broken since Basic Actions were first built.
    ;; It was recently fixed for postgres, but we still need to fix the other drivers.
    #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
    (mt/test-drivers #{:postgres} #_(mt/normal-drivers-with-feature :actions)
      (actions.tu/with-actions-temp-db action-nullable
        (mt/with-actions-enabled
          (testing "creates new row with no populated columns"
            (let [result (actions/perform-action!
                          :table.row/create
                          {:table-id (mt/id :thought)
                           :row      {}})]
              (is (=? {:op       :created
                       :table-id (mt/id :thought)
                       :row      {"name" nil}}
                      result)))))))))
