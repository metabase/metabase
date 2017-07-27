(ns metabase.models.field-values
  (:require [clojure.tools.logging :as log]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [models :as models]]))

(def ^:const ^Integer low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be given a special type of `:type/Category`."
  300)

(def ^:private ^:const ^Integer entry-max-length
  "The maximum character length for a stored `FieldValues` entry."
  100)

(def ^:const ^Integer total-max-length
  "Maximum total length for a `FieldValues` entry (combined length of all values for the field)."
  (* low-cardinality-threshold entry-max-length))


;; ## Entity + DB Multimethods

(models/defmodel FieldValues :metabase_fieldvalues)

(u/strict-extend (class FieldValues)
  models/IModel
  (merge models/IModelDefaults
         {:properties  (constantly {:timestamped? true})
          :types       (constantly {:human_readable_values :json, :values :json})
          :post-select (u/rpartial update :human_readable_values #(or % {}))}))


;; ## `FieldValues` Helper Functions

(defn field-should-have-field-values?
  "Should this `Field` be backed by a corresponding `FieldValues` object?"
  {:arglists '([field])}
  [{:keys [base_type special_type visibility_type] :as field}]
  {:pre [visibility_type
         (contains? field :base_type)
         (contains? field :special_type)]}
  (and (not (contains? #{:retired :sensitive :hidden :details-only} (keyword visibility_type)))
       (not (isa? (keyword base_type) :type/DateTime))
       (or (isa? (keyword base_type) :type/Boolean)
           (isa? (keyword special_type) :type/Category)
           (isa? (keyword special_type) :type/Enum))))


(defn- values-less-than-total-max-length?
  "`true` if the combined length of all the values in DISTINCT-VALUES is below the
   threshold for what we'll allow in a FieldValues entry."
  [distinct-values]
  (let [total-length (reduce + (map (comp count str)
                                    distinct-values))]
    (<= total-length total-max-length)))


(defn- distinct-values
  "Fetch a sequence of distinct values for FIELD that are below the `total-max-length` threshold.
   If the values are past the threshold, this returns `nil`."
  [field]
  (let [values ((resolve 'metabase.db.metadata-queries/field-distinct-values) field)]
    (when (values-less-than-total-max-length? values)
      values)))


(defn create-or-update-field-values!
  "Create or update the FieldValues object for FIELD."
  [field & [human-readable-values]]
  (let [field-values (FieldValues :field_id (u/get-id field))
        values       (distinct-values field)
        field-name   (or (:name field) (:id field))]
    (cond
      ;; if the FieldValues object already exists then update values in it
      (and field-values values)
      (do
        (log/debug (format "Updating FieldValues for Field %s..." field-name))
        (db/update! FieldValues (u/get-id field-values)
          :values values))
      ;; if FieldValues object doesn't exist create one
      values
      (do
        (log/debug (format "Creating FieldValues for Field %s..." field-name))
        (db/insert! FieldValues
          :field_id              (u/get-id field)
          :values                values
          :human_readable_values human-readable-values))
      ;; otherwise this Field isn't eligible, so delete any FieldValues that might exist
      :else
      (do
        (log/debug (format "Values for field %s exceed the total max length threshold." field-name))
        (db/delete! FieldValues :field_id (u/get-id field))))))


(defn field-values->pairs
  "Returns a list of pairs (or single element vectors if there are no
  human_readable_values) for the given `FIELD-VALUES` instance"
  [{:keys [values human_readable_values] :as field-values}]
  (if (seq human_readable_values)
    (map vector values human_readable_values)
    (map vector values)))

(defn create-field-values-if-needed!
  "Create `FieldValues` for a `Field` if they *should* exist but don't already exist.
   Returns the existing or newly created `FieldValues` for `Field`."
  {:arglists '([field] [field human-readable-values])}
  [{field-id :id :as field} & [human-readable-values]]
  {:pre [(integer? field-id)]}
  (when (field-should-have-field-values? field)
    (or (FieldValues :field_id field-id)
        (create-or-update-field-values! field human-readable-values))))

(defn save-field-values!
  "Save the `FieldValues` for FIELD-ID, creating them if needed, otherwise updating them."
  [field-id values]
  {:pre [(integer? field-id) (coll? values)]}
  (if-let [field-values (FieldValues :field_id field-id)]
    (db/update! FieldValues (u/get-id field-values), :values values)
    (db/insert! FieldValues :field_id field-id, :values values)))

(defn clear-field-values!
  "Remove the `FieldValues` for FIELD-ID."
  [field-id]
  {:pre [(integer? field-id)]}
  (db/delete! FieldValues :field_id field-id))
