(ns metabase-enterprise.data-testing.models.action-test
  "`:model/ActionTest`: a saved test of one action."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase-enterprise.data-testing.subject.action :as data-testing.subject.action]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase-enterprise.data-testing.util :as data-testing.util]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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
  "The transform of the `parameters` column: [[data-testing.util/json-column]] of the parameter values, or nil."
  (let [{:keys [in out]} (data-testing.util/json-column ::data-testing.schema/parameters)]
    {:in  #(some-> % in)
     :out #(some-> % out)}))

(t2/deftransforms :model/ActionTest
  {:parameters   parameters-column
   :inputs       (data-testing.util/json-column ::data-testing.schema/inputs)
   :expectations (data-testing.util/json-column ::data-testing.schema/expectations)})

;;; ------------------------------------------------- Permissions --------------------------------------------------

;; Who may save and who may run an action test is not what the shared saved-test methods say, so `:can_write`,
;; `:can_query`, `mi/can-create?` and `mi/can-update?` are defined here.

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
      (let [query (try
                    (data-testing.subject.action/filled-query action parameters)
                    (catch clojure.lang.ExceptionInfo e
                      (if (= ::data-testing.errors/invalid-parameters (:error-type (ex-data e)))
                        ::unfit
                        (throw e))))]
        (or (= ::unfit query)
            (query-perms/can-run-query? query)))))

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

(methodical/defmethod t2/batched-hydrate [:model/ActionTest :can_write]
  "Add whether the current user may edit each action test, checking each action once."
  [_model k action-tests]
  (let [writable? (memoize (fn [action-id] (boolean (some-> action-id can-save-test?))))]
    (vec (for [action-test action-tests]
           (when action-test
             (assoc action-test k (writable? (:action_id action-test))))))))

(methodical/defmethod t2/batched-hydrate [:model/ActionTest :can_query]
  "Add whether the current user may run each action test: they read it and [[can-run?]] holds."
  [_model k action-tests]
  (vec (for [action-test (t2/hydrate action-tests :can_read)]
         (when action-test
           (assoc action-test k (boolean (and (mi/can-read? action-test) (can-run? action-test))))))))

(defmethod mi/can-create? :model/ActionTest
  [_model instance]
  (boolean (some-> (:action_id instance) can-save-test?)))

(defmethod mi/can-update? :model/ActionTest
  [instance changes]
  (boolean (and (mi/can-write? instance)
                (some-> (:action_id changes (:action_id instance)) can-save-test?))))

;;; -------------------------------------------------- Validation --------------------------------------------------

(mu/defn validate-test :- :nil
  "Throws the typed refusal of a test of the Action `action-id` with the inputs, expectations and parameter values of
  `definition` that could not run. 404 when there is no such Action."
  [action-id  :- ::lib.schema.id/action
   definition :- ::data-testing.runner/definition]
  (data-testing.runner/validate-test :action (api/check-404 (data-testing.db/action action-id)) definition))

(defmethod data-testing.test-type/spec :action [_test-type]
  {:model      :model/ActionTest
   :run-topics {:start   :event/action-test-run-start
                :timeout :event/action-test-run-timeout}
   :subject    #(data-testing.db/action (:action_id %))})

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(mu/defn create-action-tests! :- [:sequential ::data-testing.schema/action-test]
  "Insert the ActionTests `rows`, returning the inserted tests, each row normalized and validated by the column
  transforms of the model."
  [rows :- [:sequential ::data-testing.schema/action-test.create]]
  (data-testing.models/create-saved-tests! :model/ActionTest rows))

(mu/defn update-action-tests! :- :nil
  "Apply the changes in each of `rows`, the id of an ActionTest and the columns to change, which the column transforms
  of the model normalize and validate, publishing one update event for all."
  ([rows :- [:sequential ::data-testing.schema/action-test.update]]
   (update-action-tests! rows nil))
  ([rows :- [:sequential ::data-testing.schema/action-test.update]
    opts :- :metabase.events.schema/write-opts]
   (data-testing.models/update-saved-tests! :model/ActionTest rows opts)))

(mu/defn delete-action-tests! :- :nil
  "Delete the ActionTests with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (data-testing.models/delete-saved-tests! :action :model/ActionTest ids))

(defenterprise delete-action-tests-for-actions!
  "Deletes the tests of the actions with `action-ids` whatever the token says, since the rows outlive the feature."
  :feature :none
  [action-ids]
  (delete-action-tests! (data-testing.db/saved-test-ids-of-subjects :model/ActionTest :action_id (vec action-ids))))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:action_id :name :description :parameters :inputs :expectations])

(defn- revert-action-test!
  [id _user-id snapshot]
  (update-action-tests! [(assoc snapshot :id id)] {:writer :revert}))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod data-testing.models/saved-test-spec :model/ActionTest [_model]
  {:test-type     :action
   :subject-key   :action_id
   :subject       data-testing.db/action
   :subjects      data-testing.db/actions-by-ids
   :database-id   :database_id
   :validate-test validate-test})

(defmethod app-db-copy/spec :model/ActionTest [_model]
  {:skip? false})

(defmethod serialization/spec :model/ActionTest [_]
  {:schema              ::data-testing.schema/external-action-test
   :insert!             create-action-tests!
   :update!             #(update-action-tests! % {:writer :import})
   :delete!             delete-action-tests!
   :copy                [:entity_id :name :description :parameters :inputs :expectations]
   :transform           {:action_id  (serialization/fk-transform :model/Action)
                         :creator_id serialization/user-transform}
   :storage-paths       data-testing.serialization/action-test-storage-paths
   :import-dependencies data-testing.serialization/action-test-import-dependencies})

(defmethod remote-sync/spec :model/ActionTest
  [_model]
  {:synced-items         data-testing.db/synced-action-test-items
   :synced-filter-clause data-testing.db/synced-action-tests-clause})

(defmethod revisions/spec :model/ActionTest [_model]
  {:track         revision-columns
   :skip          [:creator_id :entity_id]
   :schema        ::data-testing.schema/action-test.revision
   :authorize     :snapshot
   :before-revert #(data-testing.models/check-revert :model/ActionTest %1 %2 %3)
   :revert!       revert-action-test!})

(defmethod audit/spec :model/ActionTest [_model]
  {:track          [:action_id :name :description]
   :track-redacted [:creator_id :expectations :inputs :parameters]
   :skip           [:entity_id]})
