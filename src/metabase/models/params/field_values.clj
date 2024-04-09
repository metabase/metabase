(ns metabase.models.params.field-values
  "Code related to fetching FieldValues for Fields to populate parameter widgets. Always used by the field
  values (`GET /api/field/:id/values`) endpoint; used by the chain filter endpoints under certain circumstances."
  (:require
   [medley.core :as m]
   [metabase.db.query :as mdb.query]
   [metabase.models.field :as field]
   [metabase.models.field-values :as field-values :refer [FieldValues]]
   [metabase.models.interface :as mi]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn default-get-or-create-field-values-for-current-user!
  "OSS implementation; used as a fallback for the EE implementation if the field isn't sandboxed."
  [field]
  (field-values/get-or-create-full-field-values! field))

(defenterprise get-or-create-field-values-for-current-user!*
  "Fetch cached FieldValues for a `field`, creating them if needed if the Field should have FieldValues."
  metabase-enterprise.sandbox.models.params.field-values
  [field]
  (default-get-or-create-field-values-for-current-user! field))

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
    (not-empty
     (let [fields       (-> (t2/select :model/Field :id [:in (set field-ids)])
                            (field/readable-fields-only)
                            (t2/hydrate :values))
           field-values (->> (map #(select-keys (field-values/get-latest-full-field-values (:id %))
                                    [:field_id :human_readable_values :values])
                                  fields)
                             (keep not-empty))]
       (m/index-by :field_id field-values)))))

(defenterprise field-id->field-values-for-current-user
  "Fetch *existing* FieldValues for a sequence of `field-ids` for the current User. Values are returned as a map of
    {field-id FieldValues-instance}
  Returns `nil` if `field-ids` is empty of no matching FieldValues exist."
  metabase-enterprise.sandbox.models.params.field-values
  [field-ids]
  (default-field-id->field-values-for-current-user field-ids))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Advanced FieldValues                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- fetch-advanced-field-values
  [fv-type field constraints]
  {:pre [(field-values/advanced-field-values-types fv-type)]}
  (case fv-type
    :linked-filter
    (do
      (classloader/require 'metabase.models.params.chain-filter)
      (let [{:keys [values has_more_values]} ((resolve 'metabase.models.params.chain-filter/unremapped-chain-filter)
                                              (:id field) constraints {})
            ;; we have a hard limit for how many values we want to store in FieldValues,
            ;; let's make sure we respect that limit here.
            ;; For a more detailed docs on this limt check out [[field-values/distinct-values]]
            limited-values                   (field-values/take-by-length field-values/*total-max-length* values)]
        {:values          limited-values
         :has_more_values (or (> (count values)
                                 (count limited-values))
                              has_more_values)}))

    (field-values/distinct-values field)))

(defn hash-key-for-advanced-field-values
  "Returns hash-key for Advanced FieldValues by types."
  [fv-type field-id constraints]
  (case fv-type
    :linked-filter
    (field-values/hash-key-for-linked-filters field-id constraints)

    :sandbox
    (field-values/hash-key-for-sandbox field-id)

    :impersonation
    (field-values/hash-key-for-impersonation field-id)))

(defn prepare-advanced-field-values
  "Fetch and construct the FieldValues for `field` with type `fv-type`. This does not do any insertion.
   The human_readable_values of Advanced FieldValues will be automatically fixed up based on the
   list of values and human_readable_values of the full FieldValues of the same field."
  [fv-type field hash-key constraints]
  (when-let [{wrapped-values :values :keys [has_more_values]}
             (fetch-advanced-field-values fv-type field constraints)]
    (let [;; each value in `wrapped-values` is a 1-tuple, so unwrap the raw values for storage
          values                (map first wrapped-values)
          ;; If the full FieldValues of this field have human-readable-values, ensure that we reuse them
          full-field-values     (field-values/get-latest-full-field-values (:id field))
          human-readable-values (field-values/fixup-human-readable-values full-field-values values)]
      {:field_id              (:id field)
       :type                  fv-type
       :hash_key              hash-key
       :has_more_values       has_more_values
       :human_readable_values human-readable-values
       :values                values})))

(defn get-or-create-advanced-field-values!
  "Fetch an Advanced FieldValues with type `fv-type` for a `field`, creating them if needed.
  If the fetched FieldValues is expired, we delete them then try to create it."
  ([fv-type field]
   (get-or-create-advanced-field-values! fv-type field nil))

  ([fv-type field constraints]
   (let [hash-key   (hash-key-for-advanced-field-values fv-type (:id field) constraints)
         select-kvs {:field_id (:id field) :type fv-type :hash_key hash-key}
         fv         (mdb.query/select-or-insert! :model/FieldValues select-kvs
                      #(prepare-advanced-field-values fv-type field hash-key constraints))]
     (cond
       (nil? fv) nil

       ;; If it's expired, delete then try to re-create it
       (field-values/advanced-field-values-expired? fv)
       (do
         ;; It's possible another process has already recalculated this, but spurious recalculations are OK.
         (t2/delete! FieldValues :id (:id fv))
         (recur fv-type field constraints))

       :else fv))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Public functions                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn get-or-create-field-values-for-current-user!
  "Fetch FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These are
  filtered as appropriate for the current User, depending on MB version (e.g. EE sandboxing will filter these values).
  If the Field has a human-readable values remapping (see documentation at the top of
  [[metabase.models.params.chain-filter]] for an explanation of what this means), values are returned in the format
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
  [[metabase.models.params.chain-filter]] for an explanation of what this means), values are returned in the format
    {:values           [[original-value human-readable-value]]
     :field_id         field-id
     :has_field_values boolean}
  If the Field does *not* have human-readable values remapping, values are returned in the format
    {:values           [[value]]
     :field_id         field-id
     :has_field_values boolean}"
  [field constraints]
  (-> (get-or-create-advanced-field-values! :linked-filter field constraints)
      (postprocess-field-values field)))
