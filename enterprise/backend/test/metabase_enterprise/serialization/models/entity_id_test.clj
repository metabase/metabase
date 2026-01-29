(ns metabase-enterprise.serialization.models.entity-id-test
  "To support serialization, all exported entities should have either an external name (eg. a database path) or a
  generated NanoID in a column called entity_id. There's a property :entity_id to automatically populate that field.

  This file makes it impossible to forget to add entity_id to new entities. It tests that every entity is either
  explicitly excluded, or has the :entity_id property."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

(def ^:private entities-external-name
  "Entities with external names, so they don't need a generated entity_id."
  #{:model/Channel
    ;; Databases have external names based on their URLs; tables are nested under databases; fields under tables.
    :model/Database
    :model/Table
    :model/Field
    :model/FieldValues
    :model/FieldUserSettings
    ;; Settings have human-selected unique names.
    :model/Setting
    ;; Glossary items have unique `term` key
    :model/Glossary})

(def ^:private entities-not-exported
  "Entities that are either:
  - not exported in serialization; or
  - exported as a child of something else (eg. timeline_event under timeline)
  so they don't need a generated entity_id."
  #{:model/AnalysisFinding
    :model/AnalysisFindingError
    :model/ApiKey
    :model/AuthIdentity
    :model/HTTPAction
    :model/ImplicitAction
    :model/QueryAction
    :model/ApplicationPermissionsRevision
    :model/AuditLog
    :model/BookmarkOrdering
    :model/CacheConfig
    :model/CardBookmark
    :model/ChannelTemplate
    :model/CollectionBookmark
    :model/ContentTranslation
    :model/DashboardBookmark
    :model/DataPermissions
    :model/DatabaseRouter
    :model/Dependency
    :model/DocumentBookmark
    :model/CollectionPermissionGraphRevision
    :model/DashboardCardSeries
    :model/LoginHistory
    :model/FieldValues
    :model/MetabotConversation
    :model/MetabotMessage
    :model/ModelIndex
    :model/ModelIndexValue
    :model/ModerationReview
    :model/Notification
    :model/NotificationCard
    :model/NotificationSubscription
    :model/NotificationHandler
    :model/NotificationRecipient
    :model/ParameterCard
    :model/Permissions
    :model/PermissionsGroup
    :model/PermissionsGroupMembership
    :model/PermissionsRevision
    :model/PersistedInfo
    :model/Pulse
    :model/PulseCard
    :model/PulseChannel
    :model/PulseChannelRecipient
    :model/Query
    :model/QueryCache
    :model/QueryExecution
    :model/QueryField
    :model/QueryTable
    :model/RecentViews
    :model/RemoteSyncObject
    :model/RemoteSyncTask
    :model/Revision
    :model/SemanticSearchTokenTracking
    :model/SearchIndexMetadata
    :model/Secret
    :model/Session
    :model/SupportAccessGrantLog
    :model/TaskHistory
    :model/TaskRun
    :model/Tenant
    :model/TimelineEvent
    ;; TODO we should remove these models from here once serialization is supported
    :model/TransformRun
    :model/TransformRunCancelation
    :model/TransformJobRun
    :model/TransformJobTransformTag
    :model/TransformTransformTag
    :model/PythonLibrary
    :model/Undo
    :model/User
    :model/UserParameterValue
    :model/UserKeyValue
    :model/ViewLog
    :model/Sandbox
    :model/ConnectionImpersonation
    :model/CloudMigration
    :model/Comment
    :model/CommentReaction
    ;; TODO (lbrdnk 2025/12/17): I've added rest of the workspace models here as Workspace was present. I believe
    ;; going forward all of that will be available for export. We should revisit this later in the project.
    :model/Workspace
    :model/WorkspaceInput
    :model/WorkspaceInputExternal
    :model/WorkspaceLog
    :model/WorkspaceMerge
    :model/WorkspaceMergeTransform
    :model/WorkspaceGraph
    :model/WorkspaceOutput
    :model/WorkspaceOutputExternal
    :model/WorkspaceTransform})

(deftest ^:parallel comprehensive-entity-id-test
  (let [entity-id-models (->> (v2.entity-ids/toucan-models)
                              (remove entities-not-exported)
                              (remove entities-external-name))]
    (testing "All exported models should get entity id except those with other unique property (like name)"
      (is (= (set (concat serdes.models/exported-models
                          ;; those are inline models which still have entity_id
                          ["DashboardCard" "DashboardTab" "Dimension" "MetabotPrompt"]))
             (set (->> (concat entity-id-models
                               entities-external-name)
                       (map name))))))
    (doseq [model entity-id-models]
      (testing (format (str "Model %s should either: have the ::mi/entity-id property, or be explicitly listed as having "
                            "an external name, or explicitly listed as excluded from serialization")
                       model)
        (is (serdes.backfill/has-entity-id? model))))))

(deftest ^:parallel comprehensive-identity-hash-test
  (doseq [model (->> (v2.entity-ids/toucan-models)
                     (remove entities-not-exported))]
    (testing (format "Model %s should implement identity-hash-fields" model)
      (is (some? (try
                   (serdes/hash-fields model)
                   (catch java.lang.IllegalArgumentException _
                     nil)))))))
