(ns metabase.audit-app.impl
  "Namespace for anything related to the Audit subsystem (aka Metabase Analytics) which needs to be accessible in the
  OSS product. EE-only code is located in `metabase-enterprise.audit-app.audit`."
  (:require
   [metabase.audit-app.db :as audit-app.db]
   [metabase.audit-app.settings :as audit.settings]))

;; NOTE: Constants like `audit-db-id` and the entity IDs of audit collections are placed in OSS code because audit
;; content may be loaded on an OSS build in the case of an EE->OSS downgrade. In these situations, we still need
;; access to audit identifiers in order to enforce permission checks properly.

(def audit-db-id
  "ID of Audit DB which is loaded when running an EE build."
  13371337)

(def default-audit-collection-entity-id
  "Default audit collection entity (instance analytics) id."
  "vG58R8k-QddHWA7_47umn")

(def ^:private default-custom-reports-entity-id
  "Default custom reports entity id."
  "okNLSZKdSxaoG58JSQY54")

(defn- audit-content-loaded?
  "Whether audit content was ever loaded, which the `last-analytics-checksum` setting records."
  []
  (some? (audit.settings/last-analytics-checksum)))

(defn audit-entity
  "The `:model/Collection` or `:model/Dashboard` of the audit content with `entity-id`, read in one query, or nil while
  no audit content was loaded."
  [model entity-id]
  (when (audit-content-loaded?)
    (case model
      :model/Collection (audit-app.db/collection-with-entity-id entity-id)
      :model/Dashboard  (audit-app.db/dashboard-with-entity-id entity-id))))

(defn default-custom-reports-collection
  "Default custom reports collection, read in one query."
  []
  (audit-entity :model/Collection default-custom-reports-entity-id))

(defn default-audit-collection
  "The default audit (instance analytics) Collection, read in one query."
  []
  (audit-entity :model/Collection default-audit-collection-entity-id))

(defn audit-collection-ids
  "The ids of the default audit Collection and of the custom reports Collection, read in one query, under
  `:audit-collection-id` and `:custom-reports-collection-id`, each nil while that Collection is missing or no audit
  content was loaded."
  []
  (let [entity-id->id (if (audit-content-loaded?)
                        (audit-app.db/collection-ids-by-entity-id [default-audit-collection-entity-id
                                                                   default-custom-reports-entity-id])
                        {})]
    {:audit-collection-id          (entity-id->id default-audit-collection-entity-id)
     :custom-reports-collection-id (entity-id->id default-custom-reports-entity-id)}))

(defn is-collection-id-audit?
  "Check if an id is one of `audit-collection-ids`, the value of [[audit-collection-ids]]."
  [audit-collection-ids id]
  (contains? (set [(:audit-collection-id audit-collection-ids) (:custom-reports-collection-id audit-collection-ids)]) id))
