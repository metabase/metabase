(ns metabase.settings.db
  "Application database queries for the settings module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [toucan2.core :as t2]))

(defn setting-value
  "The stored value of the Setting with `setting-key`, or nil."
  [setting-key]
  (t2/select-one-fn :value :model/Setting :key setting-key))

(defn setting-values-by-key
  "A map of key to stored value for every Setting."
  []
  (t2/select-fn->fn :key :value :model/Setting))

(defn insert-setting!
  "Insert a Setting row for `setting-key` holding `value` and return it."
  [setting-key value]
  (first (t2/insert-returning-instances! :model/Setting :key setting-key :value value)))

(defn update-setting-value!
  "Set the value of the Setting with `setting-key` to `value`."
  [setting-key value]
  (t2/update! :model/Setting :key setting-key {:value value}))

(defn delete-setting!
  "Delete the Setting with `setting-key`, via a raw table delete that bypasses model hooks."
  [setting-key]
  (t2/delete! (t2/table-name :model/Setting) :key setting-key))

(defn update-raw-setting-row!
  "Set the raw `value` and `value-with-aad` of the Setting row with `setting-key`, returning the number of rows
  updated."
  [setting-key value value-with-aad]
  (t2/update! :setting {:key setting-key} {:value value, :value_with_aad value-with-aad}))

(defn insert-raw-setting-row!
  "Insert a raw Setting row for `setting-key` holding `value` and `value-with-aad`."
  [setting-key value value-with-aad]
  (t2/insert! (t2/table-name (t2/resolve-model :model/Setting))
              :key setting-key, :value value, :value_with_aad value-with-aad))

(defn update-user-settings!
  "Store `settings-json` as the user-local settings of the User with `user-id`."
  [user-id settings-json]
  (t2/update! :model/User user-id {:settings settings-json}))

;;; sysadmin-only settings: `setting.value_sysadmin`

(defn sysadmin-setting-value
  "The stored `value_sysadmin` of the Setting with `setting-key`, or nil."
  [setting-key]
  (t2/select-one-fn :value_sysadmin :model/Setting :key setting-key))

(defn sysadmin-setting-values-by-key
  "A map of key to stored `value_sysadmin` for every Setting that has one."
  []
  (t2/select-fn->fn :key :value_sysadmin :model/Setting :value_sysadmin [:not= nil]))

(defn upsert-sysadmin-setting-value!
  "Store `value` as both the `value` and the `value_sysadmin` of the Setting with `setting-key`, inserting the row if
  there is none."
  [setting-key value]
  (if (t2/exists? :model/Setting :key setting-key)
    (t2/update! :model/Setting :key setting-key {:value value, :value_sysadmin value})
    (t2/insert! :model/Setting {:key setting-key, :value value, :value_sysadmin value})))

(defn raw-setting-row
  "The raw Setting row with `setting-key` -- every column as stored, no model hooks -- or nil."
  [setting-key]
  (t2/select-one :setting :key setting-key))

(defn update-raw-value-sysadmin!
  "Set the raw `value_sysadmin` of the Setting row with `setting-key`."
  [setting-key value-sysadmin]
  (t2/query {:update :setting, :set {:value_sysadmin value-sysadmin}, :where [:= :key setting-key]}))

(defn insert-raw-setting-row-with-sysadmin!
  "Insert a raw Setting row for `setting-key` holding `value` and `value-sysadmin`."
  [setting-key value value-sysadmin]
  (t2/query {:insert-into :setting, :values [{:key setting-key, :value value, :value_sysadmin value-sysadmin}]}))
