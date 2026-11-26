(ns metabase-enterprise.data-testing.models.card-test
  "`:model/CardTest`: a saved test of one card."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase-enterprise.data-testing.subject.card :as data-testing.subject.card]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase-enterprise.data-testing.util :as data-testing.util]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.lib.schema.id :as lib.schema.id]
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

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defn- card-database-id
  "The id of the Database of the query of `card`."
  [card]
  (data-testing.models/query-database-id (:dataset_query card)))

(defmethod data-testing.models/saved-test-spec :model/CardTest [_model]
  {:test-type         :card
   :subject-key       :card_id
   :subject           data-testing.db/card
   :subjects          data-testing.db/cards-by-ids
   :database-id       card-database-id
   :validate-test     validate-test
   :check-testable    data-testing.subject.card/check-testable
   :refuses-archived? true})

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
   :before-revert #(data-testing.models/check-revert :model/CardTest %1 %2 %3)
   :revert!       revert-card-test!})

(defmethod audit/spec :model/CardTest [_model]
  {:track          [:card_id :name :description :now]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]})
