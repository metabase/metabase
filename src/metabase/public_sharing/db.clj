(ns metabase.public-sharing.db
  "Application database queries for the public sharing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn unarchived-card-ids-and-public-uuids-by-prefix :- [:sequential (ms/InstanceOf :model/Card)]
  "The `:id` and `:public_uuid` of the unarchived Cards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Card :id :public_uuid] :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-dashboard-ids-and-public-uuids-by-prefix :- [:sequential (ms/InstanceOf :model/Dashboard)]
  "The `:id` and `:public_uuid` of the unarchived Dashboards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Dashboard :id :public_uuid] :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-action-ids-and-public-uuids-by-prefix :- [:sequential (ms/InstanceOf :model/Action)]
  "The `:id` and `:public_uuid` of the unarchived Actions whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Action :id :public_uuid] :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-document-ids-and-public-uuids-by-prefix :- [:sequential (ms/InstanceOf :model/Document)]
  "The `:id` and `:public_uuid` of the unarchived Documents whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Document :id :public_uuid] :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-cards-by-public-uuid-prefix :- [:sequential (ms/InstanceOf :model/Card)]
  "The unarchived Cards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Card :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-dashboards-by-public-uuid-prefix :- [:sequential (ms/InstanceOf :model/Dashboard)]
  "The unarchived Dashboards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Dashboard :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-actions-by-public-uuid-prefix :- [:sequential (ms/InstanceOf :model/Action)]
  "The unarchived Actions whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Action :public_uuid_prefix prefix :archived false))

(mu/defn unarchived-documents-by-public-uuid-prefix :- [:sequential (ms/InstanceOf :model/Document)]
  "The unarchived Documents whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Document :public_uuid_prefix prefix :archived false))
