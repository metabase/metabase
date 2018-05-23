(ns metabase.models.field-values
  (:require [clojure.tools.logging :as log]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [puppetlabs.i18n.core :refer [trs]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]]))

(def ^Integer category-cardinality-threshold
  "Fields with less than this many distinct values should automatically be given a special type of `:type/Category`.
  This no longer has any meaning whatsoever as far as the backend code is concerned; it is used purely to inform
  frontend behavior such as widget choices."
  (int 30))

(def ^Integer auto-list-cardinality-threshold
  "Fields with less than this many distincy values should be given a `has_field_values` value of `list`, which means
  the Field should have FieldValues."
  (int 100))

(def ^:private ^Integer entry-max-length
  "The maximum character length for a stored `FieldValues` entry."
  (int 100))

(def ^:private ^Integer total-max-length
  "Maximum total length for a `FieldValues` entry (combined length of all values for the field)."
  (int (* auto-list-cardinality-threshold entry-max-length)))


;; ## Entity + DB Multimethods

(models/defmodel FieldValues :metabase_fieldvalues)

(u/strict-extend (class FieldValues)
  models/IModel
  (merge models/IModelDefaults
         {:properties  (constantly {:timestamped? true})
          :types       (constantly {:human_readable_values :json, :values :json})
          :post-select (u/rpartial update :human_readable_values #(or % {}))}))


;; ## `FieldValues` Helper Functions

(s/defn field-should-have-field-values? :- s/Bool
  "Should this `field` be backed by a corresponding `FieldValues` object?"
  {:arglists '([field])}
  [{base-type :base_type, visibility-type :visibility_type, has-field-values :has_field_values, :as field}
   :- {:visibility_type  su/KeywordOrString
       :base_type        (s/maybe su/KeywordOrString)
       :has_field_values (s/maybe su/KeywordOrString)
       s/Keyword         s/Any}]
  (boolean
   (and (not (contains? #{:retired :sensitive :hidden :details-only} (keyword visibility-type)))
        (not (isa? (keyword base-type) :type/DateTime))
        (#{:list :auto-list} (keyword has-field-values)))))


(defn- values-less-than-total-max-length?
  "`true` if the combined length of all the values in DISTINCT-VALUES is below the threshold for what we'll allow in a
  FieldValues entry. Does some logging as well."
  [distinct-values]
  (let [total-length (reduce + (map (comp count str)
                                    distinct-values))]
    (u/prog1 (<= total-length total-max-length)
      (log/debug (format "Field values total length is %d (max %d)." total-length total-max-length)
                 (if <>
                   "FieldValues are allowed for this Field."
                   "FieldValues are NOT allowed for this Field.")))))


(defn- distinct-values
  "Fetch a sequence of distinct values for `field` that are below the `total-max-length` threshold. If the values are
  past the threshold, this returns `nil`."
  [field]
  (require 'metabase.db.metadata-queries)
  (let [values ((resolve 'metabase.db.metadata-queries/field-distinct-values) field)]
    (when (values-less-than-total-max-length? values)
      values)))

(defn- fixup-human-readable-values
  "Field values and human readable values are lists that are zipped together. If the field values have changes, the
  human readable values will need to change too. This function reconstructs the `human_readable_values` to reflect
  `NEW-VALUES`. If a new field value is found, a string version of that is used"
  [{old-values :values, old-hrv :human_readable_values} new-values]
  (when (seq old-hrv)
    (let [orig-remappings (zipmap old-values old-hrv)]
      (map #(get orig-remappings % (str %)) new-values))))

(defn create-or-update-field-values!
  "Create or update the FieldValues object for 'field`. If the FieldValues object already exists, then update values for
   it; otherwise create a new FieldValues object with the newly fetched values. Returns whether the field values were
   created/updated/deleted as a result of this call."
  [field & [human-readable-values]]
  (let [field-values (FieldValues :field_id (u/get-id field))
        values       (distinct-values field)
        field-name   (or (:name field) (:id field))]
    (cond
      ;; If this Field is marked `auto-list`, and the number of values in now over the list threshold, we need to
      ;; unmark it as `auto-list`. Switch it to `has_field_values` = `nil` and delete the FieldValues; this will
      ;; result in it getting a Search Widget in the UI when `has_field_values` is automatically inferred by the
      ;; `metabase.models.field/infer-has-field-values` hydration function (see that namespace for more detailed
      ;; discussion)
      ;;
      ;; It would be nicer if we could do this in analysis where it gets marked `:auto-list` in the first place, but
      ;; Fingerprints don't get updated regularly enough that we could detect the sudden increase in cardinality in a
      ;; way that could make this work. Thus, we are stuck doing it here :(
      (and (> (count values) auto-list-cardinality-threshold)
           (= :auto-list (keyword (:has_field_values field))))
      (do
        (log/info (trs "Field {0} was previously automatically set to show a list widget, but now has {1} values."
                       field-name (count values))
                  (trs "Switching Field to use a search widget instead."))
        (db/update! 'Field (u/get-id field) :has_field_values nil)
        (db/delete! FieldValues :field_id (u/get-id field)))
      ;; if the FieldValues object already exists then update values in it
      (and field-values values)
      (do
        (log/debug (trs "Storing updated FieldValues for Field {0}..." field-name))
        (db/update-non-nil-keys! FieldValues (u/get-id field-values)
          :values                values
          :human_readable_values (fixup-human-readable-values field-values values))
        ::fv-updated)
      ;; if FieldValues object doesn't exist create one
      values
      (do
        (log/debug (trs "Storing FieldValues for Field {0}..." field-name))
        (db/insert! FieldValues
          :field_id              (u/get-id field)
          :values                values
          :human_readable_values human-readable-values)
        ::fv-created)
      ;; otherwise this Field isn't eligible, so delete any FieldValues that might exist
      :else
      (do
        (db/delete! FieldValues :field_id (u/get-id field))
        ::fv-deleted))))


(defn field-values->pairs
  "Returns a list of pairs (or single element vectors if there are no human_readable_values) for the given
  `FIELD-VALUES` instance."
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
        (when (contains? #{::fv-created ::fv-updated} (create-or-update-field-values! field human-readable-values))
          (FieldValues :field_id field-id)))))

(defn save-field-values!
  "Save the `FieldValues` for FIELD-ID, creating them if needed, otherwise updating them."
  [field-id values]
  {:pre [(integer? field-id) (coll? values)]}
  (if-let [field-values (FieldValues :field_id field-id)]
    (db/update! FieldValues (u/get-id field-values), :values values)
    (db/insert! FieldValues :field_id field-id, :values values)))

(defn clear-field-values!
  "Remove the `FieldValues` for FIELD-OR-ID."
  [field-or-id]
  (db/delete! FieldValues :field_id (u/get-id field-or-id)))


(defn- table-ids->table-id->is-on-demand?
  "Given a collection of TABLE-IDS return a map of Table ID to whether or not its Database is subject to 'On Demand'
  FieldValues updating. This means the FieldValues for any Fields belonging to the Database should be updated only
  when they are used in new Dashboard or Card parameters."
  [table-ids]
  (let [table-ids            (set table-ids)
        table-id->db-id      (when (seq table-ids)
                               (db/select-id->field :db_id 'Table :id [:in table-ids]))
        db-id->is-on-demand? (when (seq table-id->db-id)
                               (db/select-id->field :is_on_demand 'Database
                                 :id [:in (set (vals table-id->db-id))]))]
    (into {} (for [table-id table-ids]
               [table-id (-> table-id table-id->db-id db-id->is-on-demand?)]))))

(defn update-field-values-for-on-demand-dbs!
  "Update the FieldValues for any Fields with FIELD-IDS if the Field should have FieldValues and it belongs to a
  Database that is set to do 'On-Demand' syncing."
  [field-ids]
  (let [fields (when (seq field-ids)
                 (filter field-should-have-field-values?
                         (db/select ['Field :name :id :base_type :special_type :visibility_type :table_id
                                     :has_field_values]
                           :id [:in field-ids])))
        table-id->is-on-demand? (table-ids->table-id->is-on-demand? (map :table_id fields))]
    (doseq [{table-id :table_id, :as field} fields]
      (when (table-id->is-on-demand? table-id)
        (log/debug
         (format "Field %d '%s' should have FieldValues and belongs to a Database with On-Demand FieldValues updating."
                 (u/get-id field) (:name field)))
        (create-or-update-field-values! field)))))
