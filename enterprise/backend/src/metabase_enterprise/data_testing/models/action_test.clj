(ns metabase-enterprise.data-testing.models.action-test
  "`:model/ActionTest`: a saved test of one action."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.actions.core :as actions]
   [metabase.audit-app.core :as audit-app]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ActionTest [_model] :action_test)

(doto :model/ActionTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive ::data-testing.models/saved-test))

(methodical/defmethod t2/model-for-automagic-hydration [:model/ActionTest :action]
  [_original-model _k]
  :model/Action)

(def ^:private parameters-column
  "The transform of the `parameters` column: [[data-testing.models/json-column]] of the parameter values, or nil."
  (let [{:keys [in out]} (data-testing.models/json-column ::data-testing.schema/parameters)]
    {:in  #(some-> % in)
     :out #(some-> % out)}))

(t2/deftransforms :model/ActionTest
  {:parameters   parameters-column
   :inputs       (data-testing.models/json-column ::data-testing.schema/inputs)
   :expectations (data-testing.models/json-column ::data-testing.schema/expectations)})

(defmethod audit-app/model-details :model/ActionTest
  [action-test _event-type]
  (select-keys action-test [:action_id :name :description]))

;;; ---------------------------------------------------- Events ----------------------------------------------------

(defenterprise delete-action-tests!
  "Enterprise implementation: delete the tests of the action `action-id`, each through its own hook. Runs whatever the
  token says, since the rows outlive the feature."
  :feature :none
  [action-id]
  (data-testing.db/delete-action-tests! action-id))

(defenterprise delete-model-action-tests!
  "Enterprise implementation: delete the tests of the actions of the model `model-id`, each through its own hook. Runs
  whatever the token says, since the rows outlive the feature."
  :feature :none
  [model-id]
  (data-testing.db/delete-model-action-tests! model-id))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn- action-allows?
  "Whether `action-check` holds for the Action `action-id`, hydrated with `k`, `query-check` holds for the action, and
  the current user may write the native SQL of a test against the Database of the action's query."
  [action-check k action-id query-check]
  (boolean
   (when-let [action (some-> (data-testing.db/action action-id) (t2/hydrate k))]
     (and (action-check action)
          (query-check action)
          (or (mi/superuser?)
              (some-> (:database_id action) data-testing.models/can-run-native-query?))))))

(mu/defn- can-save-test? :- :boolean
  "Whether the current user may save or delete a test of the Action `action-id`: they may edit the action, and write
  the native SQL of a test against the Database of its query."
  [action-id :- ::lib.schema.id/action]
  (action-allows? mi/can-write? :can_write action-id (constantly true)))

(defn- can-run-query-with-values?
  "Whether the current user may run the query of `action` with the test's `parameters`. A non-query action, or
  `parameters` that do not fit the action, have no query to check: a run refuses them before the query compiles."
  [action parameters]
  (or (not= :query (keyword (:type action)))
      (let [values (try
                     (actions/parameter-values action (or parameters {}))
                     (catch clojure.lang.ExceptionInfo e
                       (if (= 400 (:status-code (ex-data e)))
                         ::unfit
                         (throw e))))]
        (or (= ::unfit values)
            (query-perms/can-run-query? (actions/query-with-parameter-values action values))))))

(mu/defn can-run? :- :boolean
  "Whether the current user may run the saved `action-test`: they may read its action, run the action's query with the
  test's parameter values, and write the native SQL of a test against the Database of the action's query."
  [action-test :- ::data-testing.schema/action-test]
  ;; Input SQL can read any table of the Database, and the test validator does not check it, so reading the action is
  ;; not enough.
  ;; A run compiles the action's query with the cards and snippets it includes, and a refusal can quote their SQL, so
  ;; the user must be allowed to run that query. It is checked with the test's values: a query missing a required value
  ;; cannot be preprocessed, and its required permissions would fall back to access to the Database.
  (action-allows? mi/can-read? :can_read (:action_id action-test)
                  #(can-run-query-with-values? % (:parameters action-test))))

(defmethod data-testing.models/saved-test-spec :model/ActionTest
  [_model]
  {:test-type   :action
   :subject-key :action_id
   :subject     data-testing.db/action
   :subjects    data-testing.db/actions-by-ids
   :can-save?   can-save-test?})

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:action_id :name :description :parameters :inputs :expectations])

(defmethod revision/serialize-instance :model/ActionTest
  [_model _id action-test]
  (select-keys action-test revision-columns))

(defmethod revision/revert-to-revision! :model/ActionTest
  [_model id _user-id serialized-instance]
  (data-testing.db/update-action-test! id (select-keys serialized-instance revision-columns)))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/ActionTest [_]
  {:schema    ::data-testing.schema/external-action-test
   :copy      [:entity_id :name :description :parameters :inputs :expectations]
   :transform {:action_id  (serialization/fk-transform :model/Action)
               :creator_id serialization/user-transform}})

(defmethod serialization/storage-paths :model/ActionTest [_ entities _ctx]
  ;; An action's path reads its collection, and whether it belongs to a model.
  (data-testing.models/subject-storage-paths entities :model/Action :action_id {:collection_id :model/Collection
                                                                                :model_id      :model/Card}))

(defmethod serialization/import-dependencies :model/ActionTest [_ entities]
  (mapv (fn [{:keys [action_id]}]
          #{[:model/Action action_id]})
        entities))

;;; -------------------------------------------------- Remote sync -------------------------------------------------

(defmethod remote-sync/spec :model/ActionTest
  [_model]
  {:synced-items         data-testing.db/synced-action-test-items
   :synced-filter-clause data-testing.db/synced-action-tests-clause})
