(ns metabase.models.field-values
  "FieldValues is used to store a cached list of values of Fields that has `has_field_values=:auto-list or :list`.
  Check the doc in [[metabase.models.field/has-field-values-options]] for more info about `has_field_values`.

  There are 2 main classes of FieldValues: Full and Advanced.
  - Full FieldValues store a list of distinct values of a Field without any constraints.
  - Whereas Advanced FieldValues has additional constraints:
    - sandbox: FieldValues of a field but is sandboxed for a specific user
    - linked-filter: FieldValues for a param that connects to a Field that is constrained by the values of other Field.
      It's currently being used on Dashboard or Embedding, but it could be used to power any parameters that connect to a Field.

  * Life cycle
  - Full FieldValues are created by the fingerprint or scanning process.
    Once it's created the values will be updated by the scanning process that runs daily.
  - Advanced FieldValues are created on demand: for example the Sandbox FieldValues are created when a user with
    sandboxed permission try to get values of a Field.
    Normally these FieldValues will be deleted after [[advanced-field-values-max-age]] days by the scanning process.
    But they will also be automatically deleted when the Full FieldValues of the same Field got updated."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(def ^Integer category-cardinality-threshold
  "Fields with less than this many distinct values should automatically be given a semantic type of `:type/Category`.
  This no longer has any meaning whatsoever as far as the backend code is concerned; it is used purely to inform
  frontend behavior such as widget choices."
  (int 30))

(def ^Integer auto-list-cardinality-threshold
  "Fields with less than this many distincy values should be given a `has_field_values` value of `list`, which means
  the Field should have FieldValues."
  (int 1000))

(def ^:private ^Integer entry-max-length
  "The maximum character length for a stored FieldValues entry."
  (int 100))

(def ^:dynamic *total-max-length*
  "Maximum total length for a FieldValues entry (combined length of all values for the field)."
  (int (* auto-list-cardinality-threshold entry-max-length)))

(def advanced-field-values-max-age
  "Age of an advanced FieldValues in days.
  After this time, these field values should be deleted by the `delete-expired-advanced-field-values` job."
  (t/days 30))

(def advanced-field-values-types
  "A class of fieldvalues that has additional constraints/filters."
  #{:sandbox         ;; are fieldvalues but filtered by sandbox permissions
    :linked-filter}) ;; are fieldvalues but has constraints from other linked parameters on dashboard/embedding

(def ^:private field-values-types
  "All FieldValues type."
  (into #{:full} ;; default type for fieldvalues where it contains values for a field without constraints
        advanced-field-values-types))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Entity & Lifecycle                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(models/defmodel FieldValues :metabase_fieldvalues)

(defn- assert-valid-human-readable-values [{human-readable-values :human_readable_values}]
  (when (s/check (s/maybe [(s/maybe su/NonBlankString)]) human-readable-values)
    (throw (ex-info (tru "Invalid human-readable-values: values must be a sequence; each item must be nil or a string")
                    {:human-readable-values human-readable-values
                     :status-code           400}))))

(defn- assert-valid-field-values-type
  [{:keys [type hash_key] :as _field-values}]
  (when type
    (when-not (contains? field-values-types type)
      (throw (ex-info (tru "Invalid field-values type.")
                      {:type        type
                       :stauts-code 400})))

    (when (and (= type :full)
               hash_key)
      (throw (ex-info (tru "Full FieldValues shouldn't have hash_key.")
                      {:type        type
                       :hash_key    hash_key
                       :status-code 400})))

    (when (and (advanced-field-values-types type)
               (empty? hash_key))
      (throw (ex-info (tru "Advanced FieldValues requires a hash_key.")
                      {:type        type
                       :status-code 400})))))

(defn clear-advanced-field-values-for-field!
  "Remove all advanced FieldValues for a `field-or-id`."
  [field-or-id]
  (db/delete! FieldValues :field_id (u/the-id field-or-id)
                          :type     [:in advanced-field-values-types]))

(defn clear-field-values-for-field!
  "Remove all FieldValues for a `field-or-id`, including the advanced fieldvalues."
  [field-or-id]
  (db/delete! FieldValues :field_id (u/the-id field-or-id)))

(defn- pre-insert [{:keys [field_id] :as field-values}]
  (u/prog1 (merge {:type :full}
                  field-values)
    (assert-valid-human-readable-values field-values)
    (assert-valid-field-values-type field-values)
    ;; if inserting a new full fieldvalues, make sure all the advanced field-values of this field is deleted
    (when (= (:type <>) :full)
      (clear-advanced-field-values-for-field! field_id))))

(defn- pre-update [{:keys [id type field_id values hash_key] :as field-values}]
  (u/prog1 field-values
    (assert-valid-human-readable-values field-values)
    (when (or type hash_key)
      (throw (ex-info (tru "Can't update type or hash_key for a FieldValues.")
                      {:type        type
                       :hash_key    hash_key
                       :status-code 400})))
    ;; if we're updating the values of a Full FieldValues, delete all Advanced FieldValues of this field
    (when (and values
           (= (or type (db/select-one-field :type FieldValues :id id))
              :full))
     (clear-advanced-field-values-for-field! (or field_id
                                                 (db/select-one-field :field_id FieldValues :id id))))))

(defn- post-select [field-values]
  (cond-> field-values
    (contains? field-values :human_readable_values)
    (update :human_readable_values (fn [human-readable-values]
                                     (cond
                                       (sequential? human-readable-values)
                                       human-readable-values

                                       ;; in some places human readable values were incorrectly saved as a map. If
                                       ;; that's the case, convert them back to a sequence
                                       (map? human-readable-values)
                                       (do
                                         (assert (:values field-values)
                                                 (tru ":values must be present to fetch :human_readable_values"))
                                         (mapv human-readable-values (:values field-values)))

                                       ;; if the `:human_readable_values` key is present (i.e., if we are fetching the
                                       ;; whole row), but `nil`, then replace the `nil` value with an empty vector. The
                                       ;; client likes this better.
                                       :else
                                       [])))))

(u/strict-extend (class FieldValues)
  models/IModel
  (merge models/IModelDefaults
         {:properties  (constantly {:timestamped? true})
          :types       (constantly {:human_readable_values :json-no-keywordization
                                    :values                :json
                                    :type                  :keyword})
          :pre-insert  pre-insert
          :pre-update  pre-update
          :post-select post-select})

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [(serdes.hash/hydrated-hash :field)])})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Utils fns                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn field-should-have-field-values?
  "Should this `field` be backed by a corresponding FieldValues object?"
  [field-or-field-id]
  (if-not (map? field-or-field-id)
    (let [field-id (u/the-id field-or-field-id)]
      (recur (or (db/select-one ['Field :base_type :visibility_type :has_field_values] :id field-id)
                 (throw (ex-info (tru "Field {0} does not exist." field-id)
                                 {:field-id field-id, :status-code 404})))))
    (let [{base-type        :base_type
           visibility-type  :visibility_type
           has-field-values :has_field_values
           :as              field} field-or-field-id]
      (s/check {:visibility_type  su/KeywordOrString
                :base_type        (s/maybe su/KeywordOrString)
                :has_field_values (s/maybe su/KeywordOrString)
                s/Keyword         s/Any}
               field)
      (boolean
       (and (not (contains? #{:retired :sensitive :hidden :details-only} (keyword visibility-type)))
            (not (isa? (keyword base-type) :type/Temporal))
            (#{:list :auto-list} (keyword has-field-values)))))))

(defn take-by-length
  "Like `take` but condition by the total length of elements.
  Returns a stateful transducer when no collection is provided.

    ;; (take-by-length 6 [\"Dog\" \"Cat\" \"Crocodile\"])
    ;; => [\"Dog\" \"Cat\"]"
  ([max-length]
   (fn [rf]
     (let [current-length (volatile! 0)]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result input]
          (vswap! current-length + (count (str input)))
          (if (< @current-length max-length)
            (rf result input)
            (reduced result)))))))

  ([max-length coll]
   (lazy-seq
     (when-let [s (seq coll)]
       (let [f          (first s)
             new-length (- max-length (count (str f)))]
         (when-not (neg? new-length)
           (cons f (take-by-length new-length
                                   (rest s)))))))))

(defn fixup-human-readable-values
  "Field values and human readable values are lists that are zipped together. If the field values have changes, the
  human readable values will need to change too. This function reconstructs the `human_readable_values` to reflect
  `new-values`. If a new field value is found, a string version of that is used"
  [{old-values :values, old-hrv :human_readable_values} new-values]
  (when (seq old-hrv)
    (let [orig-remappings (zipmap old-values old-hrv)]
      (map #(get orig-remappings % (str %)) new-values))))

(defn field-values->pairs
  "Returns a list of pairs (or single element vectors if there are no human_readable_values) for the given
  `field-values` instance."
  [{:keys [values human_readable_values]}]
  (if (seq human_readable_values)
    (map vector values human_readable_values)
    (map vector values)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Advanced FieldValues                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn advanced-field-values-expired?
  "Checks if an advanced FieldValues expired."
  [fv]
  {:pre [(advanced-field-values-types (:type fv))]}
  (u.date/older-than? (:created_at fv) advanced-field-values-max-age))

(defenterprise hash-key-for-sandbox
  "Return a hash-key that will be used for sandboxed fieldvalues."
  metabase-enterprise.sandbox.models.params.field-values
  [field-id]
  nil)

(defn default-hash-key-for-linked-filters
  "OSS impl of [[hash-key-for-linked-filters]]."
  [field-id constraints]
  (str (hash [field-id
              constraints])))

(defenterprise hash-key-for-linked-filters
  "Return a hash-key that will be used for linked-filters fieldvalues."
  metabase-enterprise.sandbox.models.params.field-values
  [field-id constraints]
  (default-hash-key-for-linked-filters field-id constraints))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    CRUD fns                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn distinct-values
  "Fetch a sequence of distinct values for `field` that are below the [[*total-max-length*]] threshold. If the values are
  past the threshold, this returns a subset of possible values values where the total length of all items is less than [[*total-max-length*]].
  It also returns a `has_more_values` flag, `has_more_values` = `true` when the returned values list is a subset of all possible values.

  ;; (distinct-values (Field 1))
  ;; ->  {:values          [1, 2, 3]
          :has_more_values false}

  (This function provides the values that normally get saved as a Field's
  FieldValues. You most likely should not be using this directly in code outside of this namespace, unless it's for a
  very specific reason, such as certain cases where we fetch ad-hoc FieldValues for GTAP-filtered Fields.)"
  [field]
  (classloader/require 'metabase.db.metadata-queries)
  (try
    (let [distinct-values         ((resolve 'metabase.db.metadata-queries/field-distinct-values) field)
          limited-distinct-values (take-by-length *total-max-length* distinct-values)]
      {:values          limited-distinct-values
       ;; has_more_values=true means the list of values we return is a subset of all possible values.
       :has_more_values (or
                          ;; If the `distinct-values` has more elements than `limited-distinct-values`
                          ;; it means the the `distinct-values` has exceeded our [[*total-max-length*]] limits.
                          (> (count distinct-values)
                             (count limited-distinct-values))
                          ;; [[metabase.db.metadata-queries/field-distinct-values]] runs a query
                          ;; with limit = [[metabase.db.metadata-queries/absolute-max-distinct-values-limit]].
                          ;; So, if the returned `distinct-values` has length equal to that exact limit,
                          ;; we assume the returned values is just a subset of what we have in DB.
                          (= (count distinct-values)
                             @(resolve 'metabase.db.metadata-queries/absolute-max-distinct-values-limit)))})
    (catch Throwable e
      (log/error e (trs "Error fetching field values"))
      nil)))

(defn create-or-update-full-field-values!
  "Create or update the full FieldValues object for `field`. If the FieldValues object already exists, then update values for
   it; otherwise create a new FieldValues object with the newly fetched values. Returns whether the field values were
   created/updated/deleted as a result of this call.

  Note that if the full FieldValues are create/updated/deleted, it'll delete all the Advanced FieldValues of the same `field`."
  [field & [human-readable-values]]
  (let [field-values                     (FieldValues :field_id (u/the-id field) :type :full)
        {:keys [values has_more_values]} (distinct-values field)
        field-name                       (or (:name field) (:id field))]
    (cond
      ;; If this Field is marked `auto-list`, and the number of values in now over the [[auto-list-cardinality-threshold]] or
      ;; the accumulated length of all values exceeded the [[*total-max-length*]] threshold
      ;; we need to unmark it as `auto-list`. Switch it to `has_field_values` = `nil` and delete the FieldValues;
      ;; this will result in it getting a Search Widget in the UI when `has_field_values` is automatically inferred
      ;; by the [[metabase.models.field/infer-has-field-values]] hydration function (see that namespace for more detailed
      ;; discussion)
      ;;
      ;; It would be nicer if we could do this in analysis where it gets marked `:auto-list` in the first place, but
      ;; Fingerprints don't get updated regularly enough that we could detect the sudden increase in cardinality in a
      ;; way that could make this work. Thus, we are stuck doing it here :(
      (and (= :auto-list (keyword (:has_field_values field)))
           (or has_more_values
               (> (count values) auto-list-cardinality-threshold)))
      (do
        (log/info (trs "Field {0} was previously automatically set to show a list widget, but now has {1} values."
                       field-name (count values))
                  (trs "Switching Field to use a search widget instead."))
        (db/update! 'Field (u/the-id field) :has_field_values nil)
        (clear-field-values-for-field! field)
        ::fv-deleted)

      (and (= (:values field-values) values)
           (= (:has_more_values field-values) has_more_values))
      (log/debug (trs "FieldValues for Field {0} remain unchanged. Skipping..." field-name))

      ;; if the FieldValues object already exists then update values in it
      (and field-values values)
      (do
        (log/debug (trs "Storing updated FieldValues for Field {0}..." field-name))
        (db/update-non-nil-keys! FieldValues (u/the-id field-values)
          :has_more_values       has_more_values
          :values                values
          :human_readable_values (fixup-human-readable-values field-values values))
        ::fv-updated)

      ;; if FieldValues object doesn't exist create one
      values
      (do
        (log/debug (trs "Storing FieldValues for Field {0}..." field-name))
        (db/insert! FieldValues
          :type :full
          :field_id              (u/the-id field)
          :has_more_values       has_more_values
          :values                values
          :human_readable_values human-readable-values)
        ::fv-created)

      ;; otherwise this Field isn't eligible, so delete any FieldValues that might exist
      :else
      (do
        (clear-field-values-for-field! field)
        ::fv-deleted))))

(defn get-or-create-full-field-values!
  "Create FieldValues for a `Field` if they *should* exist but don't already exist. Returns the existing or newly
  created FieldValues for `Field`."
  {:arglists '([field] [field human-readable-values])}
  [{field-id :id :as field} & [human-readable-values]]
  {:pre [(integer? field-id)]}
  (when (field-should-have-field-values? field)
    (or (FieldValues :field_id field-id :type :full)
        (when (#{::fv-created ::fv-updated} (create-or-update-full-field-values! field human-readable-values))
          (FieldValues :field_id field-id :type :full)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  On Demand                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- table-ids->table-id->is-on-demand?
  "Given a collection of `table-ids` return a map of Table ID to whether or not its Database is subject to 'On Demand'
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
  "Update the FieldValues for any Fields with `field-ids` if the Field should have FieldValues and it belongs to a
  Database that is set to do 'On-Demand' syncing."
  [field-ids]
  (let [fields (when (seq field-ids)
                 (filter field-should-have-field-values?
                         (db/select ['Field :name :id :base_type :effective_type :coercion_strategy
                                     :semantic_type :visibility_type :table_id :has_field_values]
                           :id [:in field-ids])))
        table-id->is-on-demand? (table-ids->table-id->is-on-demand? (map :table_id fields))]
    (doseq [{table-id :table_id, :as field} fields]
      (when (table-id->is-on-demand? table-id)
        (log/debug
         (trs "Field {0} ''{1}'' should have FieldValues and belongs to a Database with On-Demand FieldValues updating."
                 (u/the-id field) (:name field)))
        (create-or-update-full-field-values! field)))))
