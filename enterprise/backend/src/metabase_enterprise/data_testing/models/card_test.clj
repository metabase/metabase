(ns metabase-enterprise.data-testing.models.card-test
  "`:model/CardTest`: a saved test of one card."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.subject.card :as data-testing.subject.card]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase-enterprise.data-testing.util :as data-testing.util]
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

(methodical/defmethod t2/model-for-automagic-hydration [:model/CardTest :card]
  [_original-model _k]
  :model/Card)

(t2/deftransforms :model/CardTest
  {:now          data-testing.models/now-column
   :inputs       (data-testing.util/json-column ::data-testing.schema/inputs)
   :expectations (data-testing.util/json-column ::data-testing.schema/expectations)})

(methodical/defmethod t2/batched-hydrate [:model/CardTest :last_run]
  "Add the newest run, or nil, to each card test."
  [_model _k card-tests]
  (data-testing.models/with-last-runs :card card-tests))

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

(mu/defn create-card-tests! :- [:sequential ::data-testing.schema/card-test]
  "Insert the CardTests `rows`, returning the inserted tests. The column transforms of the model normalize and
  validate each row."
  [rows :- [:sequential :map]]
  (data-testing.models/create-saved-tests! :model/CardTest rows))

(mu/defn create-card-test! :- ::data-testing.schema/card-test
  "Insert the CardTest `card-test` returning the inserted test."
  [card-test :- [:merge ::data-testing.schema/card-test.create data-testing.models/saved-test-row]]
  (first (create-card-tests! [card-test])))

(mu/defn update-card-tests! :- :nil
  "Apply the changes in `changes-by-id`, a map from the id of a CardTest to its changes, which the column
  transforms of the model normalize and validate."
  [changes-by-id :- [:map-of ms/PositiveInt :map]]
  (data-testing.models/update-saved-tests! :model/CardTest changes-by-id))

(mu/defn update-card-test! :- :nil
  "Apply `changes` to the CardTest with `id`."
  [id      :- ms/PositiveInt
   changes :- ::data-testing.schema/card-test.update]
  (update-card-tests! {id changes}))

(mu/defn delete-card-test! :- :nil
  "Delete the CardTest with `id`."
  [id :- ms/PositiveInt]
  (data-testing.models/delete-saved-tests! :card :model/CardTest [id]))

(defenterprise delete-card-tests!
  "Deletes the tests of the cards with `card-ids` whatever the token says, since the rows outlive the feature."
  :feature :none
  [card-ids]
  (data-testing.models/delete-saved-tests-of-subjects! :card :model/CardTest :card_id (vec card-ids)))

(defn- update-imported-card-tests!
  "Update the CardTests of an import with `rows`, each its id and changed columns, returning `rows`."
  [rows]
  (update-card-tests! (into {} (map (fn [{:keys [id] :as row}] [id (dissoc row :id)])) rows))
  rows)

(defn- delete-card-tests-by-id!
  "Delete the CardTests with `ids`."
  [ids]
  (data-testing.models/delete-saved-tests! :card :model/CardTest ids))

;;; -------------------------------------------------- Validation --------------------------------------------------

(mu/defn testable-card :- [:maybe :map]
  "The Card with `card-id`, or nil when there is none. Throws a typed refusal when the card has no query."
  [card-id :- ::lib.schema.id/card]
  (doto (data-testing.db/card card-id)
    (data-testing.subject.card/check-testable)))

(mu/defn validate-test :- :nil
  "Throws the typed refusal of a test of the Card `card-id` with the inputs, expectations and `now` of `definition`
  that could not run."
  [card-id    :- ::lib.schema.id/card
   definition :- ::data-testing.runner/definition]
  (data-testing.runner/validate-test :card (testable-card card-id) definition))

(mu/defn check-edit :- :nil
  "Throws the typed refusal of an edit that sets the keys `edited-keys` of a card test and leaves it as `edited`. An
  edit that sets the card or what a run reads is refused as a new test like `edited` would be. Any other edit is
  refused when the card is archived."
  [edited      :- [:map [:card_id ::lib.schema.id/card]]
   edited-keys :- [:sequential :keyword]]
  (if (data-testing.models/validates-edit? :card_id edited-keys)
    (validate-test (:card_id edited) (data-testing.runner/test-definition edited))
    (let [card (data-testing.db/card (:card_id edited))]
      ;; A new test of an archived card with no query is refused for having no query; so is this edit.
      (when (:archived card)
        (data-testing.subject.card/check-testable card))
      (data-testing.subject/check-not-archived :card card))))

(defmethod data-testing.test-type/spec :card [_test-type]
  {:model      :model/CardTest
   :run-topics {:start   :event/card-test-run-start
                :timeout :event/card-test-run-timeout}
   ;; A suite records a typed refusal of the subject as the member's refusal.
   :subject    #(testable-card (:card_id %))
   :can-run?   can-run?})

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:card_id :name :description :now :inputs :expectations])

(defn- revert-card-test!
  [id _user-id snapshot]
  (update-card-test! id (select-keys snapshot revision-columns)))

(defn- check-revert
  "Returns `snapshot`, with `:now` nil when it has none, after refusing it as an edit to the same state would be
  refused."
  [id _user-id snapshot]
  (data-testing.models/check-revert-available)
  ;; A revision written before tests had `now` has no `:now`; the test then read the real clock.
  (let [snapshot (merge {:now nil} snapshot)]
    (data-testing.errors/refusing
     "card-test"
     #(check-edit snapshot (data-testing.models/reverted-keys (data-testing.db/card-test id) snapshot)))
    snapshot))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod events/spec :model/CardTest
  [_model]
  {:create :event/card-test-create
   :update :event/card-test-update
   :delete :event/card-test-delete})

(defmethod app-db-copy/spec :model/CardTest [_model]
  {:skip? false})

(defmethod serialization/spec :model/CardTest [_]
  {:schema              ::data-testing.schema/external-card-test
   :insert!             create-card-tests!
   :update!             update-imported-card-tests!
   :delete!             delete-card-tests-by-id!
   :copy                [:entity_id :name :description :inputs :expectations]
   :transform           {:card_id    (serialization/fk-transform :model/Card)
                         :creator_id serialization/user-transform
                         :now        data-testing.models/now-transform}
   :storage-paths       data-testing.serialization/card-test-storage-paths
   :import-dependencies data-testing.serialization/card-test-import-dependencies})

(defmethod remote-sync/spec :model/CardTest
  [_model]
  {:synced-items         data-testing.db/synced-card-test-items
   :synced-filter-clause data-testing.db/synced-card-tests-clause})

(defmethod revisions/spec :model/CardTest [_model]
  {:track         revision-columns
   :skip          [:creator_id :entity_id]
   :authorize     :snapshot
   :before-revert check-revert
   :revert!       revert-card-test!})

(defmethod audit/spec :model/CardTest [_model]
  {:track          [:card_id :name :description :now]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]})
