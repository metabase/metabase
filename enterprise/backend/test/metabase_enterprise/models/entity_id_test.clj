(ns metabase_enterprise.models.entity-id-test
  "To support serialization, all exported entities should have either an external name (eg. a database path) or a
  generated NanoID in a column called entity_id. There's a property :entity_id to automatically populate that field.

  This file makes it impossible to forget to add entity_id to new entities. It tests that every entity is either
  explicitly excluded, or has the :entity_id property."
  (:require
   [clojure.test :refer :all]
   metabase.db.data-migrations
   metabase.models
   metabase.models.dependency-test
   metabase.models.revision-test
   [metabase.models.serialization.hash :as serdes.hash]
   [toucan.models :refer [IModel]]))

(comment metabase.models/keep-me
         metabase.db.data-migrations/keep-me
         metabase.models.dependency-test/keep-me
         metabase.models.revision-test/keep-me)

(def entities-external-name
  "Entities with external names, so they don't need a generated entity_id."
  #{;; Databases have external names based on their URLs; tables are nested under databases; fields under tables.
    metabase.models.database.DatabaseInstance
    metabase.models.table.TableInstance
    metabase.models.field.FieldInstance
    ;; Settings have human-selected unique names.
    metabase.models.setting.SettingInstance
    ;; Dependencies are serialized but no extra ID is necessary since they're just many-to-many links between entities
    ;; with unique IDs, and don't need unique IDs of their own.
    metabase.models.dependency.DependencyInstance})

(def entities-not-exported
  "Entities that are either:
  - not exported in serialization; or
  - exported as a child of something else (eg. timeline_event under timeline)
  so they don't need a generated entity_id."
  #{metabase.db.data_migrations.DataMigrationsInstance
    metabase.models.activity.ActivityInstance
    metabase.models.application_permissions_revision.ApplicationPermissionsRevisionInstance
    metabase.models.bookmark.BookmarkOrderingInstance
    metabase.models.bookmark.CardBookmarkInstance
    metabase.models.bookmark.CollectionBookmarkInstance
    metabase.models.bookmark.DashboardBookmarkInstance
    metabase.models.collection.root.RootCollection
    metabase.models.collection_permission_graph_revision.CollectionPermissionGraphRevisionInstance
    metabase.models.dashboard_card_series.DashboardCardSeriesInstance
    metabase.models.dependency_test.MockInstance
    metabase.models.field_values.FieldValuesInstance
    metabase.models.login_history.LoginHistoryInstance
    metabase.models.metric_important_field.MetricImportantFieldInstance
    metabase.models.moderation_review.ModerationReviewInstance
    metabase.models.permissions.PermissionsInstance
    metabase.models.permissions_group.PermissionsGroupInstance
    metabase.models.permissions_group_membership.PermissionsGroupMembershipInstance
    metabase.models.permissions_revision.PermissionsRevisionInstance
    metabase.models.persisted_info.PersistedInfoInstance
    metabase.models.pulse_card.PulseCardInstance
    metabase.models.pulse_channel.PulseChannelInstance
    metabase.models.pulse_channel_recipient.PulseChannelRecipientInstance
    metabase.models.query.QueryInstance
    metabase.models.query_cache.QueryCacheInstance
    metabase.models.query_execution.QueryExecutionInstance
    metabase.models.revision.RevisionInstance
    metabase.models.revision_test.FakedCardInstance
    metabase.models.secret.SecretInstance
    metabase.models.session.SessionInstance
    metabase.models.task_history.TaskHistoryInstance
    metabase.models.timeline_event.TimelineEventInstance
    metabase.models.user.UserInstance
    metabase.models.view_log.ViewLogInstance
    metabase_enterprise.sandbox.models.group_table_access_policy.GroupTableAccessPolicyInstance})

(deftest comprehensive-entity-id-test
  (doseq [model (->> (extenders IModel)
                     (remove entities-not-exported)
                     (remove entities-external-name))]
    (testing (format "Model %s should either: have the :entity_id property, or be explicitly listed as having an external name, or explicitly listed as excluded from serialization"
                     (.getSimpleName model))
      (is (= true (-> (.newInstance model)
                      toucan.models/properties
                      :entity_id))))))

(deftest comprehensive-identity-hash-test
  (doseq [model (->> (extenders IModel)
                     (remove entities-not-exported))]
    (testing (format "Model %s should implement IdentityHashable" (.getSimpleName model))
      (is (extends? serdes.hash/IdentityHashable model)))))
