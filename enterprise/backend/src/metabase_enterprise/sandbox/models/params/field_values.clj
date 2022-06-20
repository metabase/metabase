(ns metabase-enterprise.sandbox.models.params.field-values
  (:require [metabase-enterprise.sandbox.api.table :as table]
            [metabase.api.common :as api]
            [metabase.models.field :as field]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.models.params.field-values :as params.field-values]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [toucan.db :as db]))

(comment api/keep-me)

(defn- create-sandboxed-fieldvalues
  [field hash-key]
  (when-let [values (field-values/distinct-values field)]
    (let [;; If the full FieldValues of this field has a human-readable-values, fix it with the sandboxed values
          human-readable-values (field-values/fixup-human-readable-values
                                  (db/select-one FieldValues
                                                 :field_id (:id field)
                                                 :type :full)
                                  values)]
      (db/insert! FieldValues
                  :field_id (:id field)
                  :type :sandbox
                  :hash_key hash-key
                  :human_readable_values human-readable-values
                  :values values))))

(defn- get-or-create-sandboxed-field-values!
  "Returns a sandboxed FieldValues for a field if exists, otherwise try to create one."
  [field user-id user-permissions-set]
  (let [hash-key (field-values/hash-key-for-sandbox (:id field) user-id user-permissions-set)
        fv       (or (FieldValues :field_id (:id field)
                                  :type :sandbox
                                  :hash_key hash-key)
                     (create-sandboxed-fieldvalues field hash-key))]
    (cond
      (nil? fv) nil

      ;; If it's expired, delete then try to re-create it
      (field-values/advanced-fieldvalues-expired? fv) (do
                                                       (db/delete! FieldValues :id (:id fv))
                                                       (recur field user-id user-permissions-set))
      :else fv)))

(defn- field-is-sandboxed?
  [{:keys [table], :as field}]
  ;; slight optimization: for the `field-id->field-values` version we can batched hydrate `:table` to avoid having to
  ;; make a bunch of calls to fetch Table. For `get-or-create-field-values` we don't hydrate `:table` so we can fall
  ;; back to fetching it manually with `field/table`
  (table/only-segmented-perms? (or table (field/table field))))

(defenterprise get-or-create-field-values-for-current-user!*
  "Fetch cached FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These
  should be filtered as appropriate for the current User (currently this only applies to the EE impl)."
  :feature :sandboxes
  [field]
  (if (field-is-sandboxed? field)
    (get-or-create-sandboxed-field-values! field api/*current-user-id* @api/*current-user-permissions-set*)
    (params.field-values/default-get-or-create-field-values-for-current-user! field)))
