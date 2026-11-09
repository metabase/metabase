(ns metabase-enterprise.data-testing.models.card-test
  "`:model/CardTest`: a saved test of one card."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
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
  (if-not (seq card-tests)
    card-tests
    (let [id->run (into {}
                        (map (juxt :test_id identity))
                        (data-testing.db/latest-test-runs :card (into #{} (map :id) card-tests)))]
      (for [card-test card-tests]
        (assoc card-test :last_run (get id->run (:id card-test)))))))

(defenterprise delete-card-tests!
  "Enterprise implementation: delete the tests of the card `card-id`, each through its own hook. Runs whatever the token
  says, since the rows outlive the feature. See the OSS declaration in `metabase.queries.models.card`."
  :feature :none
  [card-id]
  (data-testing.db/delete-card-tests! card-id))

(t2/define-before-delete :model/CardTest [card-test]
  ;; No foreign key keeps a run's test id valid, so the hook sets the test id of the test's runs to null, in the
  ;; delete's transaction. Toucan 2 has no after-delete hook.
  (data-testing.db/clear-test-id-of-runs! :card (:id card-test))
  card-test)

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn- query-database-id
  "The id of the Database the query of `card` runs on."
  [card]
  (lib/database-id (:dataset_query card)))

(mu/defn- can-save-test? :- :boolean
  "Whether the current user may save or delete a test of the Card `card-id`: they may edit the card, and write the
  native SQL of a test against the Database of its query."
  [card-id :- ::lib.schema.id/card]
  (boolean
   (when-let [card (data-testing.db/card card-id)]
     (and (mi/can-write? card)
          (or (mi/superuser?)
              (some-> (query-database-id card) data-testing.models/can-run-native-query?))))))

(mu/defn can-run? :- :boolean
  "Whether the current user may run the saved `card-test`: they may read it, and write the native SQL of a test against
  the Database of its card's query."
  [card-test :- ::data-testing.schema/card-test]
  ;; Input SQL can read any table of the Database, and the guards do not check it, so reading the card is not enough.
  (boolean
   (when-let [card (data-testing.db/card (:card_id card-test))]
     (and (mi/can-read? card)
          (or (mi/superuser?)
              (some-> (query-database-id card) data-testing.models/can-run-native-query?))))))

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
