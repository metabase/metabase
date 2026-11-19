(ns metabase-enterprise.data-testing.models.action-test
  "`:model/ActionTest`: a saved test of one action."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase-enterprise.data-testing.subject.action :as data-testing.subject.action]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ActionTest [_model] :action_test)

(doto :model/ActionTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive :hook/events)
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

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(defenterprise delete-action-tests!
  "Deletes the tests of the action `action-id` whatever the token says, since the rows outlive the feature."
  :feature :none
  [action-id]
  (data-testing.db/delete-action-tests! action-id))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:action_id :name :description :parameters :inputs :expectations])

(defn- revert-action-test!
  [id _user-id snapshot]
  (data-testing.models/check-revert-available)
  (data-testing.db/update-action-test! id (select-keys snapshot revision-columns)))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod data-testing.models/saved-test-spec :model/ActionTest
  [_model]
  {:test-type   :action
   :subject-key :action_id
   :subjects    data-testing.db/actions-by-ids
   :can-save?   can-save-test?})

(defmethod events/spec :model/ActionTest
  [_model]
  {:create :event/action-test-create
   :update :event/action-test-update
   :delete :event/action-test-delete})

(defmethod app-db-copy/spec :model/ActionTest [_model]
  {:skip? false})

(defmethod serialization/spec :model/ActionTest [_]
  {:schema              ::data-testing.schema/external-action-test
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
  {:track     revision-columns
   :skip      [:creator_id :entity_id]
   :authorize :snapshot
   :revert!   revert-action-test!})

(defmethod audit/spec :model/ActionTest [_model]
  {:track          [:action_id :name :description]
   :track-redacted [:creator_id :expectations :inputs :parameters]
   :skip           [:entity_id]})
