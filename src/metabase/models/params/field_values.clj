(ns metabase.models.params.field-values
  "Code related to fetching *cached* FieldValues for Fields to populate parameter widgets. Always used by the field
  values (`GET /api/field/:id/values`) endpoint; used by the chain filter endpoints under certain circumstances."
  (:require [metabase.models.field :as field :refer [Field]]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.models.interface :as mi]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn default-get-or-create-field-values-for-current-user!
  "OSS implementation; used as a fallback for the EE implementation if the field isn't sandboxed."
  [field]
  (when (field-values/field-should-have-field-values? field)
    (field-values/get-or-create-full-field-values! field)))

(defenterprise get-or-create-field-values-for-current-user!*
  "Fetch cached FieldValues for a `field`, creating them if needed if the Field should have FieldValues."
  metabase-enterprise.sandbox.models.params.field-values
  [field]
  (default-get-or-create-field-values-for-current-user! field))

(defn default-field-id->field-values-for-current-user
  "OSS implementation; used as a fallback for the EE implementation for any fields that aren't subject to sandboxing."
  [field-ids]
  (when (seq field-ids)
    (not-empty
     (let [field-values       (db/select [FieldValues :values :human_readable_values :field_id]
                                :field_id [:in (set field-ids)]
                                :type :full)
           readable-fields    (when (seq field-values)
                                (field/readable-fields-only (db/select [Field :id :table_id]
                                                              :id [:in (set (map :field_id field-values))])))
           readable-field-ids (set (map :id readable-fields))]
       (->> field-values
            (filter #(contains? readable-field-ids (:field_id %)))
            (u/key-by :field_id))))))

(defn current-user-can-fetch-field-values?
  "Whether the current User has permissions to fetch FieldValues for a `field`."
  [field]
  ;; read permissions for a Field = partial permissions for its parent Table (including EE segmented permissions)
  (mi/can-read? field))

(defn get-or-create-field-values-for-current-user!
  "Fetch FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These are
  filtered as appropriate for the current User, depending on MB version (e.g. EE sandboxing will filter these values).
  If the Field has a human-readable values remapping (see documentation at the top of
  `metabase.models.params.chain-filter` for an explanation of what this means), values are returned in the format

    {:values           [[original-value human-readable-value]]
     :field_id         field-id
     :has_field_values boolean}

  If the Field does *not* have human-readable values remapping, values are returned in the format

    {:values           [[value]]
     :field_id         field-id
     :has_field_values boolean}"
  [field]
  (if-let [field-values (get-or-create-field-values-for-current-user!* field)]
    (-> field-values
        (assoc :values (field-values/field-values->pairs field-values))
        (select-keys [:values :field_id :has_more_values]))
    {:values [], :field_id (u/the-id field), :has_more_values false}))
