(ns metabase.driver.sql-jdbc.actions-test
  "Most of the tests for code in [[metabase.driver.sql-jdbc.actions]] are e2e tests that live
  in [[metabase.api.action-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.actions :as actions]
   [metabase.actions.error :as actions.error]
   [metabase.api.common :refer [*current-user-permissions-set*]]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.lib.schema.actions :as lib.schema.actions]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models :refer [Field]]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn ^:private cast-values :- ::lib.schema.actions/row
  [driver        :- :keyword
   column->value :- ::lib.schema.actions/row
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
      (mt/with-temp-vals-in-db Field (mt/id :venues :category_id) {:base_type :type/Float}
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
          (binding [*current-user-permissions-set* (delay #{"/"})]
            (is (thrown-with-msg? Exception #"Referential integrity constraint violation:.*"
                                            (actions/perform-action! :row/delete (mt/mbql-query categories {:filter [:= $id 58]})))))
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

(defn perform-action-ex-data
  "Calls [[actions/perform-action!]] and returns the `ex-data` of exception.
  Used to test error message when executing implicit action for SQL DBs."
  [& args]
  (try
   (apply actions/perform-action! args)
   (catch Exception e
     (ex-data e))))

(defn- test-action-error-handling! [f]
  (mt/test-drivers (filter #(isa? driver/hierarchy % :sql-jdbc) (mt/normal-drivers-with-feature :actions))
    (mt/dataset action-error-handling
      (mt/with-actions-enabled
        (let [db-id          (mt/id)
              field-id->name #(t2/select-one-fn :name :model/Field %)]
          (f {:db-id         db-id
              :group-name    (field-id->name (mt/id :group :name))
              :group-ranking (field-id->name (mt/id :group :ranking))
              :user-name     (field-id->name (mt/id :user :name))
              :user-group-id (field-id->name (mt/id :user :group-id))}))))))

(deftest action-error-handling-not-null-constraint-creating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-name]}]
     (testing "violate not-null constraint"
       (is (= {:message     "Ranking must have values."
               :errors      {"ranking" "You must provide a value."}
               :type        actions.error/violate-not-null-constraint
               :status-code 400}
              (perform-action-ex-data :row/create (mt/$ids {:create-row {group-name "admin"}
                                                            :database   db-id
                                                            :query      {:source-table $$group}
                                                            :type       :query}))))))))

(deftest action-error-handling-not-null-constraint-creating-test-2
  (test-action-error-handling!
   (fn [{:keys [db-id group-name]}]
     (testing "violate not-null constraint"
       (testing "when creating"
         (is (= {:message     "Ranking must have values."
                 :errors      {"ranking" "You must provide a value."}
                 :type        actions.error/violate-not-null-constraint
                 :status-code 400}
                (perform-action-ex-data :row/create (mt/$ids {:create-row {group-name "admin"}
                                                              :database   db-id
                                                              :query      {:source-table $$group}
                                                              :type       :query})))))))))

(deftest action-error-handling-not-null-constraint-updating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-ranking]}]
     (testing "violate not-null constraint"
       (testing "when updating"
         (is (= {:message     "Ranking must have values."
                 :errors      {"ranking" "You must provide a value."}
                 :type        actions.error/violate-not-null-constraint
                 :status-code 400}
                (perform-action-ex-data :row/update (mt/$ids {:update-row {group-ranking nil}
                                                              :database   db-id
                                                              :query      {:filter       [:= $group.id 1]
                                                                           :source-table $$group}
                                                              :type       :query})))))))))

(deftest action-error-handling-unique-constraint-creating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-name group-ranking]}]
     (testing "violate unique constraint"
       (testing "when creating"
         (is (= {:message     "Ranking already exists."
                 :errors      {"ranking" "This Ranking value already exists."}
                 :type        actions.error/violate-unique-constraint
                 :status-code 400}
                (perform-action-ex-data :row/create (mt/$ids {:create-row {group-name    "new"
                                                                           group-ranking 1}
                                                              :database   db-id
                                                              :query      {:source-table $$group}
                                                              :type       :query})))))))))

(deftest action-error-handling-unique-constraint-updating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-ranking]}]
     (testing "violate unique constraint"
       (testing "when updating"
         (is (= {:message     "Ranking already exists."
                 :errors      {"ranking" "This Ranking value already exists."}
                 :type        actions.error/violate-unique-constraint
                 :status-code 400}
                (perform-action-ex-data :row/update (mt/$ids {:update-row {group-ranking 2}
                                                              :database   db-id
                                                              :query      {:filter [:= $group.id 1]
                                                                           :source-table $$group}
                                                              :type       :query})))))))))

(deftest action-error-handling-incorrect-type-creating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-name group-ranking]}]
     (testing "incorrect type"
       (testing "when creating"
         (is (= (merge
                 {:message     "Some of your values aren’t of the correct type for the database."
                  :type        actions.error/incorrect-value-type
                  :status-code 400}
                 (case driver/*driver*
                   (:h2 :postgres)
                   {:errors {}}
                   {:errors {"ranking" "This value should be of type Integer."}}))
                (perform-action-ex-data :row/create (mt/$ids {:create-row {group-name    "new"
                                                                           group-ranking "S"}
                                                              :database   db-id
                                                              :query      {:source-table $$group}
                                                              :type       :query})))))))))

(deftest action-error-handling-incorrect-type-updating-test
  (test-action-error-handling!
   (fn [{:keys [db-id group-ranking]}]
     (testing "incorrect type"
       (testing "when updating"
         (is (= (merge
                 {:message     "Some of your values aren’t of the correct type for the database."
                  :type        actions.error/incorrect-value-type
                  :status-code 400}
                 (case driver/*driver*
                   (:h2 :postgres)
                   {:errors {}}
                   {:errors {"ranking" "This value should be of type Integer."}}))
                (perform-action-ex-data :row/update (mt/$ids {:update-row {group-ranking "S"}
                                                              :database   db-id
                                                              :query      {:filter [:= $group.id 1]
                                                                           :source-table $$group}
                                                              :type       :query})))))))))

(deftest action-error-handling-fk-constraint-creating-test
  (test-action-error-handling!
   (fn [{:keys [db-id user-name user-group-id]}]
     (testing "violate fk constraint"
       (testing "when creating"
         (is (= {:message     "Unable to create a new record."
                 :errors      {"group_id" "This Group-id does not exist."}
                 :type        actions.error/violate-foreign-key-constraint
                 :status-code 400}
                (perform-action-ex-data :row/create (mt/$ids {:create-row {user-name    "new"
                                                                           user-group-id 999}
                                                              :database   db-id
                                                              :query      {:source-table $$user}
                                                              :type       :query})))))))))

(deftest action-error-handling-fk-constraint-updating-test
  (test-action-error-handling!
   (fn [{:keys [db-id user-group-id]}]
     (testing "violate fk constraint"
       (testing "when updating"
         (is (= {:message     "Unable to update the record."
                 :errors      {"group_id" "This Group-id does not exist."}
                 :type        actions.error/violate-foreign-key-constraint
                 :status-code 400}
                (perform-action-ex-data :row/update (mt/$ids {:update-row {user-group-id 999}
                                                              :database   db-id
                                                              :query      {:filter [:= $user.id 1]
                                                                           :source-table $$user}
                                                              :type       :query})))))))))

(deftest action-error-handling-fk-constraint-deleting-test
  (test-action-error-handling!
   (fn [{:keys [db-id]}]
     (testing "violate fk constraint"
       (testing "when deleting"
         (is (= {:message "Other tables rely on this row so it cannot be deleted."
                 :errors {}
                 :type        actions.error/violate-foreign-key-constraint
                 :status-code 400}
                (perform-action-ex-data :row/delete (mt/$ids {:database db-id
                                                              :query    {:filter [:= $group.id 1]
                                                                         :source-table $$group}
                                                              :type     :query})))))))))
