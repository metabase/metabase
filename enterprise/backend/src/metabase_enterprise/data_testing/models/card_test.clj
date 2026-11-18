(ns metabase-enterprise.data-testing.models.card-test
  "`:model/CardTest`: a saved test of one card."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CardTest [_model] :card_test)

(doto :model/CardTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive :hook/events)
  (derive ::data-testing.models/saved-test))

(defmethod events/spec :model/CardTest
  [_model]
  {:create :event/card-test-create
   :update :event/card-test-update
   :delete :event/card-test-delete})

(defmethod audit/spec :model/CardTest [_model]
  {:track          [:card_id :name :description]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]})

(defmethod app-db-copy/spec :model/CardTest [_model]
  {:skip? false})

(methodical/defmethod t2/model-for-automagic-hydration [:model/CardTest :card]
  [_original-model _k]
  :model/Card)

(t2/deftransforms :model/CardTest
  {:inputs       (data-testing.models/json-column ::data-testing.schema/inputs)
   :expectations (data-testing.models/json-column ::data-testing.schema/expectations)})

(methodical/defmethod t2/batched-hydrate [:model/CardTest :last_run]
  "Add the newest run, or nil, to each card test."
  [_model _k card-tests]
  (data-testing.models/with-last-runs :card card-tests))

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(t2/define-before-delete :model/CardTest [card-test]
  ;; No foreign key keeps a run's test id valid, so the hook sets the test id of the test's runs to null, in the
  ;; delete's transaction. Toucan 2 has no after-delete hook. A delete that skips model hooks (a Database deleted by
  ;; raw SQL; a Dashboard or Document whose cards go by database cascade) leaves the runs' test id naming no test; such
  ;; runs are never listed or shown as `last_run`.
  (data-testing.db/clear-test-id-of-runs! :card (:id card-test))
  card-test)

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn- card-allows?
  "Whether `card-check` holds for the Card `card-id`, hydrated with `k`, and the current user may run the card's query
  and write the native SQL of a test against the Database of that query."
  [card-check k card-id]
  (let [card (data-testing.db/card card-id)]
    (data-testing.models/query-subject-allows? card-check k card (:dataset_query card))))

(mu/defn- can-save-test? :- :boolean
  "Whether the current user may save or delete a test of the Card `card-id`: they may edit the card and run its query,
  and write the native SQL of a test against the Database of its query."
  [card-id :- ::lib.schema.id/card]
  (card-allows? mi/can-write? :can_write card-id))

(mu/defn can-run? :- :boolean
  "Whether the current user may run the saved `card-test`: they may read its card and run the card's query, and write
  the native SQL of a test against the Database of the card's query."
  [card-test :- ::data-testing.schema/card-test]
  ;; Input SQL can read any table of the Database, and the guards do not check it, so reading the card is not enough.
  (card-allows? mi/can-read? :can_read (:card_id card-test)))

(methodical/defmethod t2/batched-hydrate [:model/CardTest :can_read]
  "Add whether the current user can read the card of each card test, loading the cards at once."
  [_model k card-tests]
  (data-testing.models/with-readable-subjects k card-tests :card_id
    (data-testing.db/cards-by-ids (into [] (comp (keep :card_id) (distinct)) card-tests))))

(methodical/defmethod t2/simple-hydrate [:model/CardTest :can_write]
  [_model k instance]
  (assoc instance k (boolean (can-save-test? (:card_id instance)))))

(defmethod mi/can-create? :model/CardTest
  [_model instance]
  (can-save-test? (:card_id instance)))

(defmethod mi/can-update? :model/CardTest
  [instance changes]
  (and (mi/can-write? instance)
       (can-save-test? (:card_id changes (:card_id instance)))))

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(mu/defn create-card-test! :- ::data-testing.schema/card-test
  "Insert the CardTest `card-test` returning the inserted test."
  [card-test :- [:merge
                 ::data-testing.schema/card-test.create
                 [:map {:closed true}
                  [:creator_id ::lib.schema.id/user]]]]
  (data-testing.db/insert-card-test! card-test))

(mu/defn update-card-test! :- :nil
  "Apply `changes` to the CardTest with `id`."
  [id      :- ms/PositiveInt
   changes :- ::data-testing.schema/card-test.update]
  (data-testing.db/update-card-test! id changes)
  nil)

(mu/defn delete-card-test! :- :nil
  "Delete the CardTest with `id`."
  [id :- ms/PositiveInt]
  (data-testing.db/delete-card-test! id)
  nil)

(defenterprise delete-card-tests!
  "Deletes the tests of the card `card-id` whatever the token says, since the
  rows outlive the feature."
  :feature :none
  [card-id]
  (data-testing.db/delete-card-tests! card-id))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:card_id :name :description :inputs :expectations])

(defn- revert-card-test!
  [id _user-id snapshot]
  (data-testing.models/check-revert-available)
  (update-card-test! id (select-keys snapshot revision-columns)))

(defmethod revisions/spec :model/CardTest [_model]
  {:track     revision-columns
   :skip      [:creator_id :entity_id]
   :authorize :snapshot
   :revert!   revert-card-test!})

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/CardTest [_]
  {:schema              ::data-testing.schema/external-card-test
   :copy                [:entity_id :name :description :inputs :expectations]
   :transform           {:card_id    (serialization/fk-transform :model/Card)
                         :creator_id serialization/user-transform}
   :storage-paths       data-testing.serialization/card-test-storage-paths
   :import-dependencies data-testing.serialization/card-test-import-dependencies})

;;; -------------------------------------------------- Remote sync -------------------------------------------------

(defmethod remote-sync/spec :model/CardTest
  [_model]
  {:synced-items         data-testing.db/synced-card-test-items
   :synced-filter-clause data-testing.db/synced-card-tests-clause})
