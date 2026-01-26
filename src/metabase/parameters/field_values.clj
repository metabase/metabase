(ns metabase.parameters.field-values
  "Code related to fetching FieldValues for Fields to populate parameter widgets. Always used by the field
  values (`GET /api/field/:id/values`) endpoint; used by the chain filter endpoints under certain circumstances."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.classloader.core :as classloader]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(declare get-or-create-field-values!)

(defn get-or-create-field-values-for-current-user!*
  "Fetch cached FieldValues for a `field`, creating them if needed if the Field should have FieldValues."
  [field]
  (get-or-create-field-values! field))

(defn current-user-can-fetch-field-values?
  "Whether the current User has permissions to fetch FieldValues for a `field`."
  [field]
  ;; read permissions for a Field = partial permissions for its parent Table (including EE segmented permissions)
  (mi/can-read? field))

(defn- postprocess-field-values
  "Format a FieldValues to use by params functions.
  ;; (postprocess-field-values (t2/select-one FieldValues :id 1) (Field 1))
  ;; => {:values          [[1] [2] [3] [4]]
         :field_id        1
         :has_more_values boolean}"
  [field-values field]
  (if field-values
    (-> field-values
        (assoc :values (field-values/field-values->pairs field-values))
        (select-keys [:values :field_id :has_more_values]))
    {:values [], :field_id (u/the-id field), :has_more_values false}))

(defn default-field-id->field-values-for-current-user
  "OSS implementation; used as a fallback for the EE implementation for any fields that aren't subject to sandboxing."
  [field-ids]
  (when (seq field-ids)
    (let [field-ids (->> (t2/select :model/Field :id [:in (set field-ids)])
                         field/readable-fields-only
                         (map :id))]
      (when (seq field-ids)
        (update-vals (field-values/batched-get-latest-full-field-values field-ids)
                     #(select-keys % [:field_id :human_readable_values :values]))))))

(defn hash-input-for-field-values
  "Generate a hash input map for a given field, used to determine cache keys for FieldValues.

  The returned map combines various pieces of information that affect whether cached FieldValues
  can be reused across different requests. This includes:

    - the field's unique ID.
    - sandboxing context.
    - impersonation context.
    - linked-filter constraints (optionally provided).
    - database routing context

  This ensures that any difference in these elements results in a distinct cache key.

  Returns a map suitable for hashing into a cache key."
  [field & [constraints]]
  (merge
   {:field-id (u/the-id field)}
   (field-values/hash-input-for-sandbox field)
   (field-values/hash-input-for-impersonation field)
   (field-values/hash-input-for-linked-filters field constraints)
   (field-values/hash-input-for-database-routing field)))

(defn- requires-advanced-field-value?
  "Given a field, returns falsey if this field should use the normal batched implementation to get field values."
  [field]
  (not= (hash-input-for-field-values field)
        {:field-id (u/the-id field)}))

(defn field-id->field-values-for-current-user
  "Fetch *existing* FieldValues for a sequence of `field-ids` for the current User. Values are returned as a map of
    {field-id FieldValues-instance}
  Returns `nil` if `field-ids` is empty of no matching FieldValues exist."
  [field-ids]
  (let [fields                 (when (seq field-ids)
                                 (t2/hydrate (t2/select :model/Field :id [:in (set field-ids)]) :table))
        {normal-fields   false
         advanced-fields true} (group-by requires-advanced-field-value? fields)]
    (merge
     ;; use the normal OSS batched implementation for any Fields that aren't subject to sandboxing.
     (when (seq normal-fields)
       (default-field-id->field-values-for-current-user
        (map u/the-id normal-fields)))
     ;; for sandboxed (or otherwise advanced) fields, fetch the sandboxed values individually.
     (into {} (for [{field-id :id, :as field} advanced-fields]
                [field-id (select-keys (get-or-create-field-values! field)
                                       [:values :human_readable_values :field_id])])))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Advanced FieldValues                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- fetch-advanced-field-values
  [field constraints]
  (if (seq constraints)
    (do
      (classloader/require 'metabase.parameters.chain-filter)
      (let [{:keys [values has_more_values]} ((resolve 'metabase.parameters.chain-filter/unremapped-chain-filter)
                                              (:id field) constraints {})
            ;; we have a hard limit for how many values we want to store in FieldValues,
            ;; let's make sure we respect that limit here.
            ;; For a more detailed docs on this limit check out [[field-values/distinct-values]]
            limited-values                   (field-values/take-by-length field-values/*total-max-length* values)]
        {:values          limited-values
         :has_more_values (or (> (count values)
                                 (count limited-values))
                              has_more_values)}))
    (field-values/distinct-values field)))

(defn prepare-advanced-field-values
  "Fetch and construct the FieldValues for `field` with type `fv-type`. This does not do any insertion.
   The human_readable_values of Advanced FieldValues will be automatically fixed up based on the
   list of values and human_readable_values of the full FieldValues of the same field."
  [field hash-key constraints]
  (when-let [{wrapped-values :values :keys [has_more_values]}
             (fetch-advanced-field-values field constraints)]
    (let [;; each value in `wrapped-values` is a 1-tuple, so unwrap the raw values for storage
          values                (map first wrapped-values)
          ;; If the full FieldValues of this field have human-readable-values, ensure that we reuse them
          full-field-values     (field-values/get-latest-full-field-values (:id field))
          human-readable-values (field-values/fixup-human-readable-values full-field-values values)]
      {:field_id              (:id field)
       :type                  :advanced
       :hash_key              hash-key
       :has_more_values       has_more_values
       :human_readable_values human-readable-values
       :values                values})))

(defn get-or-create-field-values!
  "Gets or creates field values."
  ([field] (get-or-create-field-values! field nil))
  ([field constraints]
   (let [hash-input (hash-input-for-field-values field constraints)
         advanced-field-value? (not= hash-input {:field-id (u/the-id field)})]
     (if advanced-field-value?
       (let [hash-key (str (hash hash-input))
             select-kvs {:field_id (:id field) :type :advanced :hash_key hash-key}
             fv (app-db/select-or-insert! :model/FieldValues select-kvs
                                          #(prepare-advanced-field-values field hash-key constraints))]
         ;; If it's expired, delete then try to re-create it
         (if (some-> fv field-values/advanced-field-values-expired?)
           (do
             ;; It's possible another process has already recalculated this, but spurious recalculations are OK.
             (t2/delete! :model/FieldValues :id (:id fv))
             (recur field constraints))
           fv))
       (field-values/get-or-create-full-field-values! field)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Public functions                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn get-or-create-field-values-for-current-user!
  "Fetch FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These are
  filtered as appropriate for the current User, depending on MB version (e.g. EE sandboxing will filter these values).
  If the Field has a human-readable values remapping (see documentation at the top of
  [[metabase.parameters.chain-filter]] for an explanation of what this means), values are returned in the format
    {:values           [[original-value human-readable-value]]
     :field_id         field-id
     :has_field_values boolean}
  If the Field does *not* have human-readable values remapping, values are returned in the format
    {:values           [[value]]
     :field_id         field-id
     :has_field_values boolean}"
  [field]
  (-> (get-or-create-field-values-for-current-user!* field)
      (postprocess-field-values field)))

(defn get-or-create-linked-filter-field-values!
  "Fetch linked-filter FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These are
  filtered as appropriate for the current User, depending on MB version (e.g. EE sandboxing will filter these values).
  If the Field has a human-readable values remapping (see documentation at the top of
  [[metabase.parameters.chain-filter]] for an explanation of what this means), values are returned in the format
    {:values           [[original-value human-readable-value]]
     :field_id         field-id
     :has_field_values boolean}
  If the Field does *not* have human-readable values remapping, values are returned in the format
    {:values           [[value]]
     :field_id         field-id
     :has_field_values boolean}"
  [field constraints]
  (-> (get-or-create-field-values! field constraints)
      (postprocess-field-values field)))
