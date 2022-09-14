(ns metabase.actions.test-util
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.http-client :as client]
   [metabase.models :refer [Action Card CardEmitter Dashboard DashboardEmitter
                            Database Emitter QueryAction]]
   [metabase.models.action :as action]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.interface :as tx]
   [metabase.test.initialize :as initialize]
   [toucan.db :as db]))

(def ^:dynamic ^:private *actions-test-data-tables*
  #{"categories"})

(defn do-with-actions-test-data-tables
  "Impl for [[with-actions-test-data-tables]]."
  [tables thunk]
  ;; make sure all the table names are valid so we can catch errors/typos
  (let [valid-table-names-set (into #{}
                                    (map :table-name)
                                    (:table-definitions (tx/get-dataset-definition defs/test-data)))]
    (doseq [table-name tables]
      (assert (contains? valid-table-names-set table-name)
              (format "Invalid table for `with-actions-test-data-tables` %s. Valid tables: %s"
                      (pr-str table-name)
                      (pr-str valid-table-names-set)))))
  (binding [*actions-test-data-tables* (set tables)]
    (thunk)))

(defmacro with-actions-test-data-tables
  "Override the tables that should be included in the [[actions-test-data]] test data DB when
  using [[with-actions-test-data]]. Normally only the `categories` table is included for maximum speed since this is
  usually enough to test things. Sometimes, however, you need some of the other tables, e.g. to test FK constraints
  failures:

    ;; using categories AND venues will let us test FK constraint failures
    (actions.test-util/with-actions-test-data-tables #{\"categories\" \"venues\"}
      (actions.test-util/with-actions-test-data
        ...))

  Note that [[with-actions-test-data-tables]] needs to wrap [[with-actions-test-data]]; it won't work the other way
  around."
  {:style/indent 1}
  [tables & body]
  `(do-with-actions-test-data-tables ~tables (^:once fn* [] ~@body)))

(defrecord ^:private ActionsTestDatasetDefinition [])

(defmethod tx/get-dataset-definition ActionsTestDatasetDefinition
  [_this]
  (tx/get-dataset-definition
   (tx/transformed-dataset-definition
    "actions-test-data"
    defs/test-data
    (fn [database-definition]
      (update database-definition :table-definitions (fn [table-definitions]
                                                       (filter #(contains? *actions-test-data-tables* (:table-name %))
                                                               table-definitions)))))))

(def actions-test-data
  "This is basically the same as [[defs/test-data]] but it only includes the [[*actions-test-data-tables*]] Tables (by
  default, only `categories`) for faster loading. It's meant to be reloaded at the start of every test using it so
  tests can do destructive things against it e.g. deleting rows. (With one Table it takes ~100ms/~250ms instead of
  ~200ms/~450ms for H2/Postgres respectively to load all the data and sync it.)

  You can use [[with-actions-test-data-tables]] if you need something other than the `categories` table, e.g. for
  testing FK constraints."
  (ActionsTestDatasetDefinition.))

(defn do-with-actions-test-data
  "Impl for [[with-actions-test-data]] macro."
  [thunk]
  (let [db (atom nil)]
    (try
      (mt/dataset actions-test-data
        (reset! db (mt/db))
        (thunk))
      (finally
        (when-let [{driver :engine, db-id :id} @db]
          (tx/destroy-db! driver (tx/get-dataset-definition actions-test-data))
          (db/delete! Database :id db-id))))))

(defmacro with-actions-test-data
  "Sets the current dataset to a freshly-loaded copy of [[defs/test-data]] that only includes the `categories` table
  that gets destroyed at the conclusion of `body`. Use this to test destructive actions that may modify the data."
  {:style/indent 0}
  [& body]
  `(do-with-actions-test-data (fn [] ~@body)))

(deftest with-actions-test-data-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (dotimes [i 2]
      (testing (format "Iteration %d" i)
        (with-actions-test-data
          (letfn [(row-count []
                    (mt/rows (mt/run-mbql-query categories {:aggregation [[:count]]})))]
            (testing "before"
              (is (= [[75]]
                     (row-count))))
            (testing "delete row"
              (is (= [1]
                     (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
                                    "DELETE FROM CATEGORIES WHERE ID = 1;"))))
            (testing "after"
              (is (= [[74]]
                     (row-count))))))))))

(defn do-with-action
  "Impl for [[with-action]]."
  [options-map f]
  (initialize/initialize-if-needed! :web-server)
  (case (:type options-map)
    :query
    (mt/with-temp* [Card [{card-id :id} (merge
                                          {:database_id   (mt/id)
                                           :dataset_query {:database (mt/id)
                                                           :type     :native
                                                           :native   {:query         (str "UPDATE categories\n"
                                                                                          "SET name = [[{{name}} || ' ' ||]] 'Shop'\n"
                                                                                          "WHERE id = {{id}}")
                                                                      :template-tags {"id" {:name         "id"
                                                                                            :display-name "ID"
                                                                                            :type         :number
                                                                                            :required     true}
                                                                                      "name" {:name         "name"
                                                                                              :display-name "Name"
                                                                                              :type         :text
                                                                                              :required     false}}}}
                                           :name          "Query Example"
                                           :parameters    [{:id "id"
                                                            :type "number"
                                                            :target [:variable [:template-tag "id"]]}
                                                           {:id "name"
                                                            :type "text"
                                                            :required false
                                                            :target [:variable [:template-tag "name"]]}]
                                           :is_write      true
                                           :visualization_settings {:inline true}}
                                          (dissoc options-map :type))]]
      (let [action-id (db/select-one-field :action_id QueryAction :card_id card-id)]
        (f {:query-action-card-id card-id
            :action-id            action-id})))

    :http
    (mt/with-model-cleanup [Action]
      (let [action-id (action/insert! (merge
                                        {:type :http
                                         :name "Echo Example"
                                         :template {:url (client/build-url "testing/echo[[?fail={{fail}}]]" {})
                                                    :method "POST"
                                                    :body "{\"the_parameter\": {{id}}}"
                                                    :headers "{\"x-test\": \"{{id}}\"}"
                                                    :parameters [{:id "id"
                                                                  :type "number"
                                                                  :target [:template-tag "id"]}
                                                                 {:id "fail"
                                                                  :type "text"
                                                                  :target [:template-tag "fail"]}]}
                                         :response_handle ".body"}
                                        options-map))]
        (f {:action-id action-id})))))

(defmacro with-action
  "Execute `body` with a newly created Action.
   `binding-form` is a returned map with key `:action-id`, and `:query-action-card-id` for QueryActions.
   `options-map` contains overrides for the action. Defaults to a sane QueryAction.

    (with-action [{:keys [action-id], :as context} {:type :http :name \"Temp HTTP Action\"}]
      (do-something))"
  {:style/indent 1}
  [[binding-form options-map] & body]
  `(do-with-action
     (merge {:type :query} ~options-map)
     (fn [~binding-form] ~@body)))

(defn do-with-emitter
  "Impl for [[with-emitter]]."
  [card-or-dashboard-model {:keys [action-id], :as context} f]
  (let [parent-model (db/resolve-model card-or-dashboard-model)]
    (mt/with-temp* [parent-model [{emitter-parent-id :id} {:name (str (name parent-model) " " action-id)}]
                    Emitter [{emitter-id :id} {:parameter_mappings {"my_id" [:variable [:template-tag "id"]]
                                                                    "my_fail" [:variable [:template-tag "fail"]]}
                                               :action_id action-id}]]
      (testing "Sanity check: emitter-id should be non-nil"
        (is (integer? emitter-id)))
      (testing "Sanity check: make sure parameter mappings were defined the way we'd expect"
        (is (= {:my_id [:variable [:template-tag "id"]]
                :my_fail [:variable [:template-tag "fail"]]}
               (db/select-one-field :parameter_mappings Emitter :id emitter-id))))
      ;; these are tied to the Card or Dashboad and Emitter above and will get cascade deleted. We can't use `with-temp*` for them
      ;; because it doesn't seem to work with tables with compound PKs
      (condp = parent-model
        Card
        (db/insert! CardEmitter {:card_id    emitter-parent-id
                                 :emitter_id emitter-id})
        Dashboard
        (db/insert! DashboardEmitter {:dashboard_id emitter-parent-id
                                      :emitter_id   emitter-id}))
      (f (assoc context
                :emitter-id        emitter-id
                :emitter-parent-id emitter-parent-id)))))

(defmacro with-dashboard-emitter
  "Execute `body` with a newly created DashboardEmitter created for an Action with `:action-id`. Intended for use with the
  `context` returned by with [[with-query-action]]. `bindings` is bound to a map with the keys `:emitter-id` and
  `:emitter-parent-id` pointing to the dashboard-id.

    (with-query-action [{:keys [action-id query-action-card-id], :as context}]
      (with-dashboard-emitter [{:keys [emitter-id emitter-parent-id]} context]
        (do-something)))"
  {:style/indent 1
   :arglists '([bindings {:keys [action-id], :as _action}] & body)}
  [[bindings action] & body]
  `(do-with-emitter Dashboard ~action (fn [~bindings] ~@body)))

(defmacro with-card-emitter
  "Execute `body` with a newly created CardEmitter created for an Action with `:action-id`. Intended for use with the
  `context` returned by with [[with-query-action]]. `bindings` is bound to a map with the keys `:emitter-id` and
  `:emitter-parent-id` pointing to the card-id.

    (with-query-action [{:keys [action-id query-action-card-id], :as context}]
      (with-card-emitter [{:keys [emitter-id emitter-parent-id]} context]
        (do-something)))"
  {:style/indent 1
   :arglists '([bindings {:keys [action-id], :as _action}] & body)}
  [[bindings action] & body]
  `(do-with-emitter Card ~action (fn [~bindings] ~@body)))

(defn do-with-actions-enabled
  "Impl for [[with-actions-enabled]]."
  [thunk]
  (mt/with-temporary-setting-values [experimental-enable-actions true]
    (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions true}}
      (thunk))))

(defmacro with-actions-enabled
  "Execute `body` with Actions enabled at the global level and for the current test Database."
  {:style/indent 0}
  [& body]
  `(do-with-actions-enabled (fn [] ~@body)))

(defmacro with-actions-test-data-and-actions-enabled
  "Combines [[with-actions-test-data]] and [[with-actions-enabled]]."
  {:style/indent 0}
  [& body]
  `(with-actions-test-data
     (with-actions-enabled
       ~@body)))
