(ns metabase.public-sharing.db
  "Application database queries for the public sharing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.actions.schema :as actions.schema]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.documents.schema :as documents.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def ^:private UnarchivedCardIdsAndPublicUuidsByPrefix
  "Rows returned by [[unarchived-card-ids-and-public-uuids-by-prefix]]."
  (mut/select-keys ::queries.schema/card.row [:id :public_uuid]))

(mu/defn unarchived-card-ids-and-public-uuids-by-prefix :- [:sequential UnarchivedCardIdsAndPublicUuidsByPrefix]
  "The `:id` and `:public_uuid` of the unarchived Cards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Card :id :public_uuid] :public_uuid_prefix prefix :archived false))

(def ^:private UnarchivedDashboardIdsAndPublicUuidsByPrefix
  "Rows returned by [[unarchived-dashboard-ids-and-public-uuids-by-prefix]]."
  (mut/select-keys ::dashboards.schema/dashboard.row [:id :public_uuid]))

(mu/defn unarchived-dashboard-ids-and-public-uuids-by-prefix :- [:sequential UnarchivedDashboardIdsAndPublicUuidsByPrefix]
  "The `:id` and `:public_uuid` of the unarchived Dashboards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Dashboard :id :public_uuid] :public_uuid_prefix prefix :archived false))

(def ^:private UnarchivedActionIdsAndPublicUuidsByPrefix
  "Rows returned by [[unarchived-action-ids-and-public-uuids-by-prefix]]."
  (mut/select-keys ::actions.schema/action [:id :public_uuid]))

(mu/defn unarchived-action-ids-and-public-uuids-by-prefix :- [:sequential UnarchivedActionIdsAndPublicUuidsByPrefix]
  "The `:id` and `:public_uuid` of the unarchived Actions whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Action :id :public_uuid] :public_uuid_prefix prefix :archived false))

(def ^:private UnarchivedDocumentIdsAndPublicUuidsByPrefix
  "Rows returned by [[unarchived-document-ids-and-public-uuids-by-prefix]]."
  (mut/select-keys ::documents.schema/document.row [:id :public_uuid]))

(mu/defn unarchived-document-ids-and-public-uuids-by-prefix :- [:sequential UnarchivedDocumentIdsAndPublicUuidsByPrefix]
  "The `:id` and `:public_uuid` of the unarchived Documents whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Document :id :public_uuid] :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-cards-by-public-uuid-prefix :- [:sequential ::queries.schema/card.row]
  "The unarchived Cards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Card :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-dashboards-by-public-uuid-prefix :- [:sequential ::dashboards.schema/dashboard.row]
  "The unarchived Dashboards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Dashboard :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-actions-by-public-uuid-prefix :- [:sequential ::actions.schema/action]
  "The unarchived Actions whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Action :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-documents-by-public-uuid-prefix :- [:sequential ::documents.schema/document.row]
  "The unarchived Documents whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Document :public_uuid_prefix prefix :archived false))
