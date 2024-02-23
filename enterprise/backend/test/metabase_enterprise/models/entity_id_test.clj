(ns ^:mb/once metabase-enterprise.models.entity-id-test
  "To support serialization, all exported entities should have either an external name (eg. a database path) or a
  generated NanoID in a column called entity_id. There's a property :entity_id to automatically populate that field.

  This file makes it impossible to forget to add entity_id to new entities. It tests that every entity is either
  explicitly excluded, or has the :entity_id property."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.models]
   [metabase.models.revision-test]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

(comment metabase.models/keep-me
         metabase.models.revision-test/keep-me)

(def ^:private entities-external-name
  "Entities with external names, so they don't need a generated entity_id."
  #{;; Databases have external names based on their URLs; tables are nested under databases; fields under tables.
    :model/Database
    :model/Table
    :model/Field
    ;; Settings have human-selected unique names.
    :model/Setting})

(def ^:private entities-not-exported
  "Entities that are either:
  - not exported in serialization; or
  - exported as a child of something else (eg. timeline_event under timeline)
  so they don't need a generated entity_id."
  #{:model/ApiKey
    :model/HTTPAction
    :model/ImplicitAction
    :model/QueryAction
    :model/Activity
    :model/ApplicationPermissionsRevision
    :model/AuditLog
    :model/BookmarkOrdering
    :model/CardBookmark
    :model/CollectionBookmark
    :model/DashboardBookmark
    :model/CollectionPermissionGraphRevision
    :model/DashboardCardSeries
    :model/LoginHistory
    :model/FieldValues
    :model/LegacyMetricImportantField
    :model/ModelIndex
    :model/ModelIndexValue
    :model/ModerationReview
    :model/ParameterCard
    :model/Permissions
    :model/PermissionsGroup
    :model/PermissionsGroupMembership
    :model/PermissionsRevision
    :model/PersistedInfo
    :model/PulseCard
    :model/PulseChannel
    :model/PulseChannelRecipient
    :model/Query
    :model/QueryCache
    :model/QueryExecution
    :model/RecentViews
    :model/Revision
    :model/Secret
    :model/Session
    :model/TablePrivileges
    :model/TaskHistory
    :model/TimelineEvent
    :model/User
    :model/ViewLog
    :model/GroupTableAccessPolicy
    :model/ConnectionImpersonation})

(deftest ^:parallel comprehensive-entity-id-test
  (doseq [model (->> (v2.entity-ids/toucan-models)
                     (remove (fn [model]
                               (not= (namespace model) "model")))
                     (remove entities-not-exported)
                     (remove entities-external-name))]
    (testing (format (str "Model %s should either: have the ::mi/entity-id property, or be explicitly listed as having "
                          "an external name, or explicitly listed as excluded from serialization")
                     model)
      (is (serdes.backfill/has-entity-id? model)))))

(deftest ^:parallel comprehensive-identity-hash-test
  (doseq [model (->> (v2.entity-ids/toucan-models)
                     (remove entities-not-exported))]
    (testing (format "Model %s should implement identity-hash-fields" model)
      (is (some? (try
                   (serdes/hash-fields model)
                   (catch java.lang.IllegalArgumentException _
                     nil)))))))
