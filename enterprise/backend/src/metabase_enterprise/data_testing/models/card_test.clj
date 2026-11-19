(ns metabase-enterprise.data-testing.models.card-test
  "`:model/CardTest`: a saved test of one card."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.audit-app.core :as audit-app]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
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
  {:inputs       (data-testing.models/json-column ::data-testing.schema/inputs)
   :expectations (data-testing.models/json-column ::data-testing.schema/expectations)})

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
  ;; Input SQL can read any table of the Database: the validator checks the tables that the query under test and the
  ;; expectations read, and not the tables an input reads. So reading the card is not enough.
  (card-allows? mi/can-read? :can_read (:card_id card-test)))

(defmethod data-testing.models/saved-test-spec :model/CardTest
  [_model]
  {:test-type   :card
   :subject-key :card_id
   :subjects    data-testing.db/cards-by-ids
   :can-save?   can-save-test?})

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:card_id :name :description :inputs :expectations])

(defmethod revision/serialize-instance :model/CardTest
  [_model _id card-test]
  (select-keys card-test revision-columns))

(defmethod revision/revert-to-revision! :model/CardTest
  [_model id _user-id serialized-instance]
  (data-testing.db/update-card-test! id (select-keys serialized-instance revision-columns)))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/CardTest [_]
  {:schema    ::data-testing.schema/external-card-test
   :copy      [:entity_id :name :description :inputs :expectations]
   :transform {:card_id    (serialization/fk-transform :model/Card)
               :creator_id serialization/user-transform}})

(defmethod serialization/storage-paths :model/CardTest [_ entities _ctx]
  ;; A card's file can sit in a collection, a dashboard or a document, so its path reads all three.
  (data-testing.models/subject-storage-paths entities :model/Card :card_id {:collection_id :model/Collection
                                                                            :dashboard_id  :model/Dashboard
                                                                            :document_id   :model/Document}))

(defmethod serialization/import-dependencies :model/CardTest [_ entities]
  (mapv (fn [{:keys [card_id]}]
          #{[:model/Card card_id]})
        entities))

;;; -------------------------------------------------- Remote sync -------------------------------------------------

(defmethod remote-sync/spec :model/CardTest
  [_model]
  {:synced-items         data-testing.db/synced-card-test-items
   :synced-filter-clause data-testing.db/synced-card-tests-clause})
