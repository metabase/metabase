(ns metabase.public-sharing.db
  "Application database queries for the public sharing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn unarchived-card-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Cards whose public uuid prefix is `prefix`."
  [prefix]
  (t2/select [:model/Card :id :public_uuid] :public_uuid_prefix prefix :archived false))

(defn unarchived-dashboard-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Dashboards whose public uuid prefix is `prefix`."
  [prefix]
  (t2/select [:model/Dashboard :id :public_uuid] :public_uuid_prefix prefix :archived false))

(defn unarchived-action-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Actions whose public uuid prefix is `prefix`."
  [prefix]
  (t2/select [:model/Action :id :public_uuid] :public_uuid_prefix prefix :archived false))

(defn unarchived-document-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Documents whose public uuid prefix is `prefix`."
  [prefix]
  (t2/select [:model/Document :id :public_uuid] :public_uuid_prefix prefix :archived false))

(defn unarchived-cards-by-public-uuid-prefix
  "The unarchived Cards whose public uuid prefix is `prefix`."
  [prefix]
  (t2/select :model/Card :public_uuid_prefix prefix :archived false))

(defn unarchived-dashboards-by-public-uuid-prefix
  "The unarchived Dashboards whose public uuid prefix is `prefix`."
  [prefix]
  (t2/select :model/Dashboard :public_uuid_prefix prefix :archived false))

(defn unarchived-actions-by-public-uuid-prefix
  "The unarchived Actions whose public uuid prefix is `prefix`."
  [prefix]
  (t2/select :model/Action :public_uuid_prefix prefix :archived false))

(defn unarchived-documents-by-public-uuid-prefix
  "The unarchived Documents whose public uuid prefix is `prefix`."
  [prefix]
  (t2/select :model/Document :public_uuid_prefix prefix :archived false))
