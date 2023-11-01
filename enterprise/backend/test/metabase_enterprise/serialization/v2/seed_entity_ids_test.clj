(ns metabase-enterprise.serialization.v2.seed-entity-ids-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.seed-entity-ids
    :as v2.seed-entity-ids]
   [metabase.models :refer [Collection]]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

(deftest seed-entity-ids-test
  (testing "Sanity check: should succeed before we go around testing specific situations"
    (is (true? (v2.seed-entity-ids/seed-entity-ids!))))
  (testing "With a temp Collection with no entity ID"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (t2.with-temp/with-temp [Collection c {:name       "No Entity ID Collection"
                                             :slug       "no_entity_id_collection"
                                             :created_at now
                                             :color      "#FF0000"}]
        (t2/update! Collection (:id c) {:entity_id nil})
        (letfn [(entity-id []
                  (some-> (t2/select-one-fn :entity_id Collection :id (:id c)) str/trim))]
          (is (= nil
                 (entity-id)))
          (testing "Should return truthy on success"
            (is (= true
                   (v2.seed-entity-ids/seed-entity-ids!))))
          (is (= "998b109c"
                 (entity-id))))
        (testing "Error: duplicate entity IDs"
          (t2.with-temp/with-temp [Collection c2 {:name       "No Entity ID Collection"
                                                  :slug       "no_entity_id_collection"
                                                  :created_at now
                                                  :color      "#FF0000"}]
            (t2/update! Collection (:id c2) {:entity_id nil})
            (letfn [(entity-id []
                      (some-> (t2/select-one-fn :entity_id Collection :id (:id c2)) str/trim))]
              (is (= nil
                     (entity-id)))
              (testing "Should return falsey on error"
                (is (= false
                       (v2.seed-entity-ids/seed-entity-ids!))))
              (is (= nil
                     (entity-id))))))))))

(deftest entity-models-test
  (testing "Sanity check: list of models that does not need an entity_id column,
           if this test fails, check if it really needs it.
           If yes, makes surethe exported data includes `:entity_id` column
           or the model implements [[serdes/hash-fields]] (#35097)"
    (is (= #{:model/MetricImportantField
             :model/ModerationReview
             :model/CollectionBookmark
             :model/Secret
             :model/GroupTableAccessPolicy
             :model/FieldValues
             :model/ModelIndex
             :model/DashboardCardSeries
             :model/DataMigrations
             :model/ParameterCard
             :model/QueryAction
             :model/ImplicitAction
             :model/User
             :model/Revision
             :model/PermissionsRevision
             :model/CardBookmark
             :model/CollectionPermissionGraphRevision
             :model/BookmarkOrdering
             :model/ModelIndexValue
             :model/PermissionsGroupMembership
             :model/ViewLog
             :model/Field
             :model/QueryCache
             :model/ApplicationPermissionsRevision
             :model/LoginHistory
             :model/Database
             :model/Session
             :model/Permissions
             :model/TaskHistory
             :model/Setting
             :model/Activity
             :model/PulseChannelRecipient
             :model/TimelineEvent
             :model/PersistedInfo
             :model/HTTPAction
             :model/QueryExecution
             :model/DashboardBookmark
             :model/Table
             :model/Query
             :model/PermissionsGroup}
           (set/difference (set (v2.seed-entity-ids/toucan-models)) (#'v2.seed-entity-ids/entity-id-models))))))
