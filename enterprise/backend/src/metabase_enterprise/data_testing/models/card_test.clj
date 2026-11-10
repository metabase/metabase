(ns metabase-enterprise.data-testing.models.card-test
  "`:model/CardTest`: a saved test of one card."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CardTest [_model] :card_test)

(doto :model/CardTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

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

(defmethod audit-app/model-details :model/CardTest
  [card-test _event-type]
  (select-keys card-test [:card_id :name :description]))

;;; ---------------------------------------------------- Events ----------------------------------------------------

(defenterprise delete-card-tests!
  "Enterprise implementation: delete the tests of the card `card-id`, each through its own hook. Runs whatever the token
  says, since the rows outlive the feature."
  :feature :none
  [card-id]
  (data-testing.db/delete-card-tests! card-id))

(t2/define-before-delete :model/CardTest [card-test]
  ;; No foreign key keeps a run's test id valid, so the hook sets the test id of the test's runs to null, in the
  ;; delete's transaction. Toucan 2 has no after-delete hook. A delete that skips model hooks (a Database deleted by
  ;; raw SQL; a Dashboard or Document whose cards go by database cascade) leaves the runs' test id naming no test; such
  ;; runs are never listed or shown as `last_run`.
  (data-testing.db/clear-test-id-of-runs! :card (:id card-test))
  (when-not mi/*deserializing?*
    (events/publish-event! :event/card-test-delete {:object card-test}))
  card-test)

(t2/define-after-insert :model/CardTest [card-test]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/card-test-create
                           {:object  (t2/instance :model/CardTest card-test)
                            :user-id (:creator_id card-test)}))
  card-test)

(t2/define-after-update :model/CardTest [card-test]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/card-test-update
                           {:object (t2/instance :model/CardTest card-test)}))
  card-test)

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn- query-database-id
  "The id of the Database the query of `card` runs on, or nil when `card` has no query."
  [card]
  (some-> (not-empty (:dataset_query card)) lib/database-id))

(defn- card-allows?
  "Whether `card-check` holds for the Card `card-id`, and the current user may run the card's query and write the native
  SQL of a test against the Database of that query."
  [card-check card-id]
  (boolean
   (when-let [card (data-testing.db/card card-id)]
     (and (card-check card)
          ;; A run compiles the query with the cards and snippets it includes, and its errors can quote their SQL, so
          ;; the user must be allowed to run the query itself, not only to read the card.
          (query-perms/can-run-query? (:dataset_query card))
          (or (mi/superuser?)
              (some-> (query-database-id card) data-testing.models/can-run-native-query?))))))

(mu/defn- can-save-test? :- :boolean
  "Whether the current user may save or delete a test of the Card `card-id`: they may edit the card and run its query,
  and write the native SQL of a test against the Database of its query."
  [card-id :- ::lib.schema.id/card]
  (card-allows? mi/can-write? card-id))

(mu/defn can-run? :- :boolean
  "Whether the current user may run the saved `card-test`: they may read its card and run the card's query, and write
  the native SQL of a test against the Database of the card's query."
  [card-test :- ::data-testing.schema/card-test]
  ;; Input SQL can read any table of the Database, and the guards do not check it, so reading the card is not enough.
  (card-allows? mi/can-read? (:card_id card-test)))

(defmethod mi/can-read? :model/CardTest
  ([instance]
   (mi/can-read? :model/Card (:card_id instance)))
  ([_model pk]
   (when-let [card-test (data-testing.db/card-test pk)]
     (mi/can-read? card-test))))

(defmethod mi/can-write? :model/CardTest
  ([instance]
   (can-save-test? (:card_id instance)))
  ([_model pk]
   (when-let [card-test (data-testing.db/card-test pk)]
     (mi/can-write? card-test))))

(defmethod mi/can-create? :model/CardTest
  [_model instance]
  (can-save-test? (:card_id instance)))

(defmethod mi/can-update? :model/CardTest
  [instance changes]
  (and (can-save-test? (:card_id instance))
       (can-save-test? (:card_id changes (:card_id instance)))))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:card_id :name :description :inputs :expectations])

(defmethod revision/serialize-instance :model/CardTest
  [_model _id card-test]
  (select-keys card-test revision-columns))

(defmethod revision/revision-readable? :model/CardTest
  [_model object]
  ;; An older revision can name a card that has since been deleted; nobody may read a revision about it.
  (boolean (some-> (data-testing.db/card (:card_id object)) mi/can-read?)))

(defmethod revision/check-revisions-available :model/CardTest
  [_model]
  (premium-features/assert-has-feature :transforms-testing (tru "Transforms Testing")))

(defmethod revision/revert-to-revision! :model/CardTest
  [_model id _user-id serialized-instance]
  (data-testing.db/update-card-test! id (select-keys serialized-instance revision-columns)))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/CardTest [_]
  {:schema    ::data-testing.schema/external-card-test
   :copy      [:entity_id :name :description :inputs :expectations]
   :transform {:card_id    (serialization/fk-transform :model/Card)
               :creator_id serialization/user-transform}})

(defn- entity-ids
  "The entity ids of the `model` rows with the database ids `ids`, in order, nil for a nil id."
  [model ids]
  (serialization/column-refs serialization/app-db-store model ids))

(defmethod serialization/storage-paths :model/CardTest [_ entities _ctx]
  ;; A test is stored in the directory named like its card's file, wherever the card is: in a collection, a dashboard
  ;; or a document.
  (let [cards (vec (data-testing.db/cards-by-entity-ids (vec (distinct (keep :card_id entities)))))
        cards (u/index-by :entity_id
                          (map (fn [card coll-eid dash-eid doc-eid]
                                 {:serdes/meta   [{:model "Card"}]
                                  :name          (:name card)
                                  :entity_id     (:entity_id card)
                                  :collection_id coll-eid
                                  :dashboard_id  dash-eid
                                  :document_id   doc-eid})
                               cards
                               (entity-ids :model/Collection (map :collection_id cards))
                               (entity-ids :model/Dashboard (map :dashboard_id cards))
                               (entity-ids :model/Document (map :document_id cards))))
        paths (serialization/batch-storage-paths (mapv #(get cards (:card_id %)) entities))]
    (mapv (fn [card-test path]
            (conj path {:label (:name card-test) :key (:entity_id card-test)}))
          entities paths)))

(defmethod serialization/import-dependencies :model/CardTest [_ entities]
  (mapv (fn [{:keys [card_id]}]
          #{[:model/Card card_id]})
        entities))
