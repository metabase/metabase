(ns metabase.public-sharing.db
  "Application database queries for the public sharing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn unarchived-card-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Cards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Card :id :public_uuid] :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-dashboard-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Dashboards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Dashboard :id :public_uuid] :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-action-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Actions whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Action :id :public_uuid] :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-document-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Documents whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select [:model/Document :id :public_uuid] :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-cards-by-public-uuid-prefix
  "The unarchived Cards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Card :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-dashboards-by-public-uuid-prefix
  "The unarchived Dashboards whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Dashboard :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-actions-by-public-uuid-prefix
  "The unarchived Actions whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Action :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-documents-by-public-uuid-prefix
  "The unarchived Documents whose public uuid prefix is `prefix`."
  [prefix :- :string]
  (t2/select :model/Document :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn publicly-shared-card-ids :- [:maybe [:set ::lib.schema.id/card]]
  "The ids of the unarchived Cards carrying a public link, or nil when there are none."
  []
  (t2/select-fn-set :id [:model/Card :id] :public_uuid_prefix [:not= nil] :archived false))

(mu/defn guest-embedded-card-ids :- [:maybe [:set ::lib.schema.id/card]]
  "The ids of the unarchived Cards published as a guest embed, or nil when there are none."
  []
  (t2/select-fn-set :id [:model/Card :id] :enable_embedding true :archived false))

(mu/defn publicly-shared-dashboard-ids :- [:maybe [:set ::lib.schema.id/dashboard]]
  "The ids of the unarchived Dashboards carrying a public link, or nil when there are none."
  []
  (t2/select-fn-set :id [:model/Dashboard :id] :public_uuid_prefix [:not= nil] :archived false))

(mu/defn guest-embedded-dashboard-ids :- [:maybe [:set ::lib.schema.id/dashboard]]
  "The ids of the unarchived Dashboards published as a guest embed, or nil when there are none."
  []
  (t2/select-fn-set :id [:model/Dashboard :id] :enable_embedding true :archived false))

(mu/defn publicly-shared-document-ids :- [:maybe [:set ms/PositiveInt]]
  "The ids of the unarchived Documents carrying a public link, or nil when there are none."
  []
  (t2/select-fn-set :id [:model/Document :id] :public_uuid_prefix [:not= nil] :archived false))

(mu/defn unarchived-card-database-ids :- [:map-of ::lib.schema.id/card [:maybe ::lib.schema.id/database]]
  "The Database each unarchived Card among `card-ids` is saved against, as `{card-id database-id}`. `card-ids` must be
  non-empty."
  [card-ids :- [:sequential {:min 1} ::lib.schema.id/card]]
  (t2/select-fn->fn :id :database_id [:model/Card :id :database_id]
                    {:where [:and
                             [:in :id [:auto/param card-ids]]
                             [:= :archived false]]}))

(mu/defn card-names-and-types
  "The `:id`, `:name` and `:type` of the Cards with `card-ids`. `card-ids` must be non-empty."
  [card-ids :- [:sequential {:min 1} ::lib.schema.id/card]]
  (t2/select [:model/Card :id :name :type] {:where [:in :id [:auto/param card-ids]]}))

(mu/defn dashboard-names
  "The `:id` and `:name` of the Dashboards with `dashboard-ids`. `dashboard-ids` must be non-empty."
  [dashboard-ids :- [:sequential {:min 1} ::lib.schema.id/dashboard]]
  (t2/select [:model/Dashboard :id :name] {:where [:in :id [:auto/param dashboard-ids]]}))

(mu/defn document-names
  "The `:id` and `:name` of the Documents with `document-ids`. `document-ids` must be non-empty."
  [document-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/select [:model/Document :id :name] {:where [:in :id [:auto/param document-ids]]}))
