(ns metabase.settings.db
  "Application database queries for the settings module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.settings.schema :as settings.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn setting-value :- [:maybe :string]
  "The stored value of the Setting with `setting-key`, or nil."
  [setting-key :- [:or :keyword :string]]
  (t2/select-one-fn :value :model/Setting :key setting-key))

(mu/defn setting-values-by-key :- [:map-of :string [:maybe :string]]
  "A map of key to stored value for every Setting."
  []
  (t2/select-fn->fn :key :value :model/Setting))

(mu/defn insert-setting! :- [:sequential ::settings.schema/setting]
  "Insert a Setting row for `setting-key` holding `value` and return it."
  [setting-key :- [:or :keyword :string]
   value       :- :string]
  (first (t2/insert-returning-instances! :model/Setting :key setting-key :value value)))

(mu/defn update-setting-value! :- :int
  "Set the value of the Setting with `setting-key` to `value`, returning the number updated."
  [setting-key :- [:or :keyword :string]
   value       :- :string]
  (t2/update! :model/Setting :key setting-key {:value value}))

(mu/defn delete-setting! :- :int
  "Delete the Setting with `setting-key`, via a raw table delete that bypasses model hooks, returning the number
  deleted."
  [setting-key :- [:or :keyword :string]]
  (t2/delete! (t2/table-name :model/Setting) :key setting-key))

(mu/defn update-raw-setting-row! :- :int
  "Set the raw `value` and `value-with-aad` of the Setting row with `setting-key`, returning the number of rows
  updated."
  [setting-key    :- [:or :keyword :string]
   value          :- [:maybe :string]
   value-with-aad :- [:maybe :string]]
  (t2/update! :setting {:key setting-key} {:value value, :value_with_aad value-with-aad}))

(mu/defn insert-raw-setting-row! :- :int
  "Insert a raw Setting row for `setting-key` holding `value` and `value-with-aad`, returning the number inserted."
  [setting-key    :- [:or :keyword :string]
   value          :- [:maybe :string]
   value-with-aad :- [:maybe :string]]
  (t2/insert! (t2/table-name (t2/resolve-model :model/Setting))
              :key setting-key, :value value, :value_with_aad value-with-aad))

(mu/defn current-timestamp-string :- :string
  "The application DB's own current timestamp, as a string."
  []
  (mdb/current-timestamp-string (mdb/db-type)))

(mu/defn update-user-settings! :- :int
  "Store `settings-json` as the user-local settings of the User with `user-id`, returning the number updated."
  [user-id       :- ::lib.schema.id/user
   settings-json :- :string]
  (t2/update! :model/User user-id {:settings settings-json}))
