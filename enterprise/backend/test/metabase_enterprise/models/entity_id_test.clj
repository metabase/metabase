(ns ^:mb/once metabase-enterprise.models.entity-id-test
  "To support serialization, all exported entities should have either an external name (eg. a database path) or a
  generated NanoID in a column called entity_id. There's a property :entity_id to automatically populate that field.

  This file makes it impossible to forget to add entity_id to new entities. It tests that every entity is either
  explicitly excluded, or has the :entity_id property."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.seed-entity-ids :as v2.seed-entity-ids]
   [metabase.db.data-migrations]
   [metabase.models]
   [metabase.models.revision-test]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

(comment metabase.models/keep-me
         metabase.db.data-migrations/keep-me
         metabase.models.revision-test/keep-me)

(def ^:private entities-external-name
  "Entities with external names, so they don't need a generated entity_id."
  #{;; Databases have external names based on their URLs; tables are nested under databases; fields under tables.
    :model/Database
    :model/Table
    :model/Field
    ;; Settings have human-selected unique names.
    :metabase.models.setting/Setting})

(def ^:private entities-not-exported
  "Entities that are either:
  - not exported in serialization; or
  - exported as a child of something else (eg. timeline_event under timeline)
  so they don't need a generated entity_id."
  #{:metabase.db.data-migrations/DataMigrations
    :model/HTTPAction
    :model/ImplicitAction
    :model/QueryAction
    :metabase.models.activity/Activity
    :metabase.models.application-permissions-revision/ApplicationPermissionsRevision
    :metabase.models.bookmark/BookmarkOrdering
    :metabase.models.bookmark/CardBookmark
    :metabase.models.bookmark/CollectionBookmark
    :metabase.models.bookmark/DashboardBookmark
    :metabase.models.collection.root/RootCollection
    :metabase.models.collection-permission-graph-revision/CollectionPermissionGraphRevision
    :model/DashboardCardSeries
    :model/FieldValues
    :metabase.models.login-history/LoginHistory
    :metabase.models.metric-important-field/MetricImportantField
    :metabase.models.moderation-review/ModerationReview
    :metabase.models.parameter-card/ParameterCard
    :metabase.models.permissions/Permissions
    :metabase.models.permissions-group/PermissionsGroup
    :metabase.models.permissions-group-membership/PermissionsGroupMembership
    :metabase.models.permissions-revision/PermissionsRevision
    :metabase.models.persisted-info/PersistedInfo
    :metabase.models.pulse-card/PulseCard
    :metabase.models.pulse-channel/PulseChannel
    :metabase.models.pulse-channel-recipient/PulseChannelRecipient
    :metabase.models.query/Query
    :metabase.models.query-cache/QueryCache
    :metabase.models.query-execution/QueryExecution
    :metabase.models.revision/Revision
    :metabase.models.revision-test/FakedCard
    :metabase.models.secret/Secret
    :metabase.models.session/Session
    :metabase.models.task-history/TaskHistory
    :metabase.models.timeline-event/TimelineEvent
    :metabase.models.user/User
    :metabase.models.view-log/ViewLog
    :metabase-enterprise.sandbox.models.group-table-access-policy/GroupTableAccessPolicy})

(deftest ^:parallel comprehensive-entity-id-test
  (doseq [model (->> (v2.seed-entity-ids/toucan-models)
                     (remove entities-not-exported)
                     (remove entities-external-name))]
    (testing (format (str "Model %s should either: have the ::mi/entity-id property, or be explicitly listed as having "
                          "an external name, or explicitly listed as excluded from serialization")
                     model)
      (is (true? (serdes.backfill/has-entity-id? model))))))

(deftest ^:parallel comprehensive-identity-hash-test
  (doseq [model (->> (v2.seed-entity-ids/toucan-models)
                     (remove entities-not-exported))]
    (testing (format "Model %s should implement identity-hash-fields" model)
      (is (some? (try
                   (serdes/hash-fields model)
                   (catch java.lang.IllegalArgumentException _
                     nil)))))))
