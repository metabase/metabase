(ns metabase.actions.test-util
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.http-client :as client]
   [metabase.models :refer [Action Card Database]]
   [metabase.models.action :as action]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test.data :as data]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.datasets :as datasets]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.users :as test.users]
   [metabase.test.initialize :as initialize]
   [metabase.test.util :as tu]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

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

(defn do-with-dataset-definition
  "Impl for [[with-temp-test-data]] and [[with-actions-test-data]] macros."
  [dataset-definition thunk]
  (let [db (atom nil)]
    (try
      (data/dataset dataset-definition
        (reset! db (data/db))
        (thunk))
      (finally
        (when-let [{driver :engine, db-id :id} @db]
          (tx/destroy-db! driver (tx/get-dataset-definition dataset-definition))
          (t2/delete! Database :id db-id))))))

(defmacro with-actions-test-data
  "Sets the current dataset to a freshly-loaded copy of [[defs/test-data]] that only includes the `categories` table
  that gets destroyed at the conclusion of `body`. Use this to test destructive actions that may modify the data."
  {:style/indent :defn}
  [& body]
  `(do-with-dataset-definition actions-test-data (fn [] ~@body)))

(defmacro with-temp-test-data
  "Sets the current dataset to a freshly created table-definitions that gets destroyed at the conclusion of `body`.
   Use this to test destructive actions that may modify the data.
    (with-temp-test-data [[\"product\"
                           [{:field-name \"name\" :base-type :type/Text}]
                           [[\"Tesla Model S\"]]]
                          [\"rating\"
                           [{:field-name \"score\" :base-type :type/Integer}]
                           [[5]]]]
      ...)"
  {:style/indent :defn}
  [table-definitions & body]
  `(do-with-dataset-definition (apply tx/dataset-definition ~(str (gensym)) ~table-definitions) (fn [] ~@body)))

(defmacro with-empty-db
  "Sets the current dataset to a freshly created db that gets destroyed at the conclusion of `body`.
   Use this to test destructive actions that may modify the data.
   WARNING: this doesn't actually create and destroy a temporary database for cloud databases (like redshift) that
   reuse a single database for all tests."
  {:style/indent :defn}
  [& body]
  `(do-with-dataset-definition (tx/dataset-definition ~(str (gensym))) (fn [] ~@body)))

(defn- delete-categories-1-query []
  (sql.qp/format-honeysql
   2
   (sql.qp/quote-style driver/*driver*)
   {:delete-from [(h2x/identifier :table (ddl.i/format-name driver/*driver* "categories"))]
    :where       [:=
                  (h2x/identifier :field (ddl.i/format-name driver/*driver* "id"))
                  [:inline 1]]}))

(deftest ^:parallel delete-categories-1-query-test
  (are [driver query] (= query
                         (binding [driver/*driver* driver]
                           (delete-categories-1-query)))
    :h2       ["DELETE FROM \"CATEGORIES\" WHERE \"ID\" = 1"]
    :postgres ["DELETE FROM \"categories\" WHERE \"id\" = 1"]
    :mysql    ["DELETE FROM `categories` WHERE `id` = 1"]))

(deftest with-actions-test-data-test
  (datasets/test-drivers (qp.test-util/normal-drivers-with-feature :actions/custom)
    (dotimes [i 2]
      (testing (format "Iteration %d" i)
        (with-actions-test-data
          (letfn [(row-count []
                    (qp.test-util/rows (data/run-mbql-query categories {:aggregation [[:count]]})))]
            (testing "before"
              (is (= [[75]]
                     (row-count))))
            (testing "delete row"
              (is (= [1]
                     (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (data/id))
                                    (delete-categories-1-query)))))
            (testing "after"
              (is (= [[74]]
                     (row-count))))))))))

(defn do-with-action
  "Impl for [[with-action]]."
  [options-map model-id]
  (let [options-map (merge options-map {:created_at (t/zoned-date-time)
                                        :updated_at (t/zoned-date-time)})]
    (case (:type options-map)
      :query
      (let [action-id (action/insert!
                       (merge {:model_id model-id
                               :name "Query Example"
                               :parameters [{:id "id"
                                             :slug "id"
                                             :type "number"
                                             :target [:variable [:template-tag "id"]]}
                                            {:id "name"
                                             :slug "name"
                                             :type "text"
                                             :required false
                                             :target [:variable [:template-tag "name"]]}]
                               :visualization_settings {:inline true}
                               :public_uuid (str (random-uuid))
                               :made_public_by_id (test.users/user->id :crowberto)
                               :database_id (data/id)
                               :creator_id (test.users/user->id :crowberto)
                               :dataset_query {:database (data/id)
                                               :type :native
                                               :native {:query (str "UPDATE categories\n"
                                                                    "SET name = concat([[{{name}}, ' ',]] 'Sh', 'op')\n"
                                                                    "WHERE id = {{id}}")
                                                        :template-tags {"id" {:name         "id"
                                                                              :display-name "ID"
                                                                              :type         :number
                                                                              :required     true}
                                                                        "name" {:name         "name"
                                                                                :display-name "Name"
                                                                                :type         :text
                                                                                :required     false}}}}}
                              options-map))]
        {:action-id action-id :model-id model-id})

      :implicit
      (let [action-id (action/insert! (merge
                                       {:type :implicit
                                        :name "Update Example"
                                        :kind "row/update"
                                        :public_uuid (str (random-uuid))
                                        :made_public_by_id (test.users/user->id :crowberto)
                                        :creator_id (test.users/user->id :crowberto)
                                        :model_id model-id}
                                       options-map))]
        {:action-id action-id :model-id model-id})

      :http
      (let [action-id (action/insert! (merge
                                       {:type :http
                                        :name "Echo Example"
                                        :template {:url (client/build-url "testing/echo[[?fail={{fail}}]]" {})
                                                   :method "POST"
                                                   :body "{\"the_parameter\": {{id}}}"
                                                   :headers "{\"x-test\": \"{{id}}\"}"}
                                        :parameters [{:id "id"
                                                      :type "number"
                                                      :target [:template-tag "id"]}
                                                     {:id "fail"
                                                      :type "text"
                                                      :target [:template-tag "fail"]}]
                                        :response_handle ".body"
                                        :model_id model-id
                                        :public_uuid (str (random-uuid))
                                        :made_public_by_id (test.users/user->id :crowberto)
                                        :creator_id (test.users/user->id :crowberto)}
                                       options-map))]
        {:action-id action-id :model-id model-id}))))

(defmacro with-actions
  "Execute `body` with newly created Actions.
  `binding-forms-and-options-maps` is a vector of even number of elements, binding and options-map,
  similar to a `let` form.
  The first two elements of `binding-forms-and-options-maps` can describe the model, for this the
  first option-map should map :dataset to a truthy value and contain :dataset_query. In this case
  the first binding is bound to the model card created.
  For actions, the binding form is bound to a map with :action-id and :model-id set to the ID of
  the created action and model card respectively. The options-map overrides the defaults in
  `do-with-action`.

  (with-actions [{model-card-id :id} {:type :model :dataset_query (mt/mbql-query types)}
                 {id :action-id} {}
                 {:keys [action-id model-id]} {:type :http :name \"Temp HTTP Action\"}]
    (assert (= model-card-id model-id))
    (something model-card-id id action-id model-id))"
  {:style/indent 1}
  [binding-forms-and-option-maps & body]
  (assert (vector? binding-forms-and-option-maps)
          "binding-forms-and-option-maps should be a vector")
  (assert (even? (count binding-forms-and-option-maps))
          "binding-forms-and-option-maps should have an even number of elements")
  (let [model (gensym "model-")
        [_ maybe-model-def :as model-part] (subvec binding-forms-and-option-maps 0 2)
        [[custom-binding model-def] binding-forms-and-option-maps]
        (if (and (map? maybe-model-def)
                 (= (:type maybe-model-def) :model)
                 (contains? maybe-model-def :dataset_query))
          [model-part (drop 2 binding-forms-and-option-maps)]
          ['[_ {:type :model, :dataset_query (mt/mbql-query categories)}]
           binding-forms-and-option-maps])]
    `(do
       (initialize/initialize-if-needed! :web-server)
       (t2.with-temp/with-temp ~[Card model model-def]
         (tu/with-model-cleanup [Action]
           (let [~custom-binding ~model
                 ~@(mapcat (fn [[binding-form option-map]]
                             [binding-form `(do-with-action (merge {:type :query} ~option-map) (:id ~model))])
                           (partition 2 binding-forms-and-option-maps))]
             ~@body))))))

(comment
  (with-actions [{id :action-id} {:type :implicit :kind "row/create"}
                 {:keys [action-id model-id]} {:type :http}]
    (something id action-id model-id))
  (with-actions [{model-card-id :id} {:type :model, :dataset_query (data/mbql-query types)}
                 {id :action-id} {:type :implicit :kind "row/create"}
                 {:keys [action-id model-id]} {}]
    (something model-card-id id action-id model-id))
  nil)

(defn do-with-actions-set
  "Impl for [[with-actions-enabled]]."
  [enable? thunk]
  (tu/with-temp-vals-in-db Database (data/id) {:settings {:database-enable-actions enable?}}
    (thunk)))

(defmacro with-actions-enabled
  "Execute `body` with Actions enabled for the current test Database."
  {:style/indent 0}
  [& body]
  `(do-with-actions-set true (fn [] ~@body)))

(defmacro with-actions-disabled
  "Execute `body` with Actions disabled for the current test Database."
  {:style/indent 0}
  [& body]
  `(do-with-actions-set false (fn [] ~@body)))

(defmacro with-actions-test-data-and-actions-enabled
  "Combines [[with-actions-test-data]] and [[with-actions-enabled]]."
  {:style/indent 0}
  [& body]
  `(with-actions-test-data
     (with-actions-enabled
       ~@body)))
