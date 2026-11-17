(ns metabase-enterprise.data-testing.models.action-test
  "`:model/ActionTest`: a saved test of one action."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.actions.core :as actions]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
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

(methodical/defmethod t2/batched-hydrate [:model/ActionTest :last_run]
  "Add the newest run, or nil, to each action test."
  [_model _k action-tests]
  (data-testing.models/with-last-runs :action action-tests))

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

(t2/define-before-delete :model/ActionTest [action-test]
  ;; No foreign key keeps a run's test id valid, so the hook sets the test id of the test's runs to null, in the
  ;; delete's transaction.
  (data-testing.db/clear-test-id-of-runs! :action (:id action-test))
  (when-not mi/*deserializing?*
    (events/publish-event! :event/action-test-delete {:object action-test}))
  action-test)

(t2/define-after-insert :model/ActionTest [action-test]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/action-test-create
                           {:object  (t2/instance :model/ActionTest action-test)
                            :user-id (:creator_id action-test)}))
  action-test)

(t2/define-after-update :model/ActionTest [action-test]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/action-test-update
                           {:object (t2/instance :model/ActionTest action-test)}))
  action-test)

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
  ;; Input SQL can read any table of the Database, and the guards do not check it, so reading the action is not enough.
  ;; A run compiles the action's query with the cards and snippets it includes, and a refusal can quote their SQL, so
  ;; the user must be allowed to run that query. It is checked with the test's values: a query missing a required value
  ;; cannot be preprocessed, and its required permissions would fall back to access to the Database.
  (action-allows? mi/can-read? :can_read (:action_id action-test)
                  #(can-run-query-with-values? % (:parameters action-test))))

(methodical/defmethod t2/simple-hydrate [:model/ActionTest :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean (some-> (data-testing.db/action (:action_id instance))
                                               (t2/hydrate :can_read)
                                               mi/can-read?))))

(methodical/defmethod t2/simple-hydrate [:model/ActionTest :can_write]
  [_model k instance]
  (assoc instance k (boolean (can-save-test? (:action_id instance)))))

(defmethod mi/can-create? :model/ActionTest
  [_model instance]
  (can-save-test? (:action_id instance)))

(defmethod mi/can-update? :model/ActionTest
  [instance changes]
  (and (can-save-test? (:action_id instance))
       (can-save-test? (:action_id changes (:action_id instance)))))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:action_id :name :description :parameters :inputs :expectations])

(defmethod revision/serialize-instance :model/ActionTest
  [_model _id action-test]
  (select-keys action-test revision-columns))

(defmethod revision/revisions-readable? :model/ActionTest
  [_model objects]
  ;; An older revision can name an action that has since been deleted; nobody may read a revision about it.
  (let [readable-ids (into #{}
                           (comp (filter mi/can-read?) (map :id))
                           (t2/hydrate (data-testing.db/actions-by-ids
                                        (into [] (comp (keep :action_id) (distinct)) objects))
                                       :can_read))]
    (mapv #(contains? readable-ids (:action_id %)) objects)))

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
  ;; An action's path reads its own collection and, for an action of a model, the model.
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
