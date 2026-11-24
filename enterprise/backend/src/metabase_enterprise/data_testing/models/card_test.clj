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

(methodical/defmethod t2/batched-hydrate [:model/CardTest :can_read]
  "Add whether the current user can read the card of each card test, loading the cards at once."
  [_model k card-tests]
  (data-testing.models/with-readable-subjects k card-tests :card_id
    (data-testing.db/cards-by-ids (into [] (comp (keep :card_id) (distinct)) card-tests))))

(defn- assoc-card-answers
  "Each of `card-tests` with under `k` whether the current user passes `card-check` on its card hydrated with
  `card-ks` and, unless a superuser, may write native SQL against its Database, loading the cards and hydrating them
  at once."
  [card-tests k card-ks card-check]
  (vec (data-testing.models/assoc-subject-answers
        card-tests k
        {:subject-key   :card_id
         :subjects      (data-testing.db/cards-by-ids
                         (into [] (comp (remove nil?) (keep :card_id) (distinct)) card-tests))
         :subject-ks    card-ks
         :subject-check card-check
         :db-id         (comp data-testing.models/query-database-id :dataset_query)})))

(methodical/defmethod t2/batched-hydrate [:model/CardTest :can_write]
  "Add whether the current user may save or delete each card test: they may edit its card, run the card's query, and
  write native SQL against its Database."
  [_model k card-tests]
  (assoc-card-answers card-tests k [:can_write :can_query] #(and (mi/can-write? %) (mi/can-query? %))))

(methodical/defmethod t2/batched-hydrate [:model/CardTest :can_query]
  "Add whether the current user may run each card test: they may run its card, as its `:can_query` says, and
  write native SQL against its Database."
  [_model k card-tests]
  (assoc-card-answers card-tests k [:can_query] mi/can-query?))

(defmethod mi/can-create? :model/CardTest
  [_model instance]
  (can-save-test? (:card_id instance)))

(defmethod mi/can-update? :model/CardTest
  [instance changes]
  (and (mi/can-write? instance)
       (can-save-test? (:card_id changes (:card_id instance)))))

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
   :subject    #(testable-card (:card_id %))})

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(mu/defn create-card-tests! :- [:sequential ::data-testing.schema/card-test]
  "Insert the CardTests `rows`, returning the inserted tests, each row normalized and validated by the column
  transforms of the model."
  [rows :- [:sequential ::data-testing.schema/card-test.create]]
  (data-testing.models/create-saved-tests! :model/CardTest rows))

(mu/defn update-card-tests! :- :nil
  "Apply the changes in each of `rows`, the id of a CardTest and the columns to change, which the column transforms of
  the model normalize and validate, publishing one update event for all."
  ([rows :- [:sequential ::data-testing.schema/card-test.update]]
   (update-card-tests! rows nil))
  ([rows :- [:sequential ::data-testing.schema/card-test.update]
    opts :- :metabase.events.schema/write-opts]
   (data-testing.models/update-saved-tests! :model/CardTest rows opts)))

(mu/defn delete-card-tests! :- :nil
  "Delete the CardTests with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (data-testing.models/delete-saved-tests! :card :model/CardTest ids))

(defenterprise delete-card-tests-for-cards!
  "Deletes the tests of the cards with `card-ids` whatever the token says, since the rows outlive the feature."
  :feature :none
  [card-ids]
  (delete-card-tests! (data-testing.db/saved-test-ids-of-subjects :model/CardTest :card_id (vec card-ids))))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:card_id :name :description :now :inputs :expectations])

(defn- revert-card-test!
  [id _user-id snapshot]
  (update-card-tests! [(assoc snapshot :id id)] {:writer :revert}))

(defn- check-revert
  "Returns `snapshot`, after refusing it as an edit to the same state would be refused."
  [id _user-id snapshot]
  (data-testing.models/check-revert-available)
  (data-testing.errors/refusing
   "card-test"
   #(check-edit snapshot (data-testing.models/reverted-keys (data-testing.db/card-test id) snapshot)))
  snapshot)

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/CardTest [_model]
  {:skip? false})

(defmethod serialization/spec :model/CardTest [_]
  {:schema              ::data-testing.schema/external-card-test
   :insert!             create-card-tests!
   :update!             #(update-card-tests! % {:writer :import})
   :delete!             delete-card-tests!
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
   :schema        ::data-testing.schema/card-test.revision
   :authorize     :snapshot
   :before-revert check-revert
   :revert!       revert-card-test!})

(defmethod audit/spec :model/CardTest [_model]
  {:track          [:card_id :name :description :now]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]})
