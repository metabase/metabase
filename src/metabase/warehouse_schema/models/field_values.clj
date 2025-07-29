(ns metabase.warehouse-schema.models.field-values
  "FieldValues is used to store a cached list of values of Fields that has `has_field_values=:auto-list` or `:list`.
  Check the doc in [[metabase.lib.schema.metadata/column-has-field-values-options]] for more info about
  `has_field_values`.

  There are 2 main classes of FieldValues: Full and Advanced.
  - Full FieldValues store a list of distinct values of a Field without any constraints.
  - Whereas Advanced FieldValues has additional constraints:
    - sandbox: FieldValues of a field but is sandboxed for a specific user
    - linked-filter: FieldValues for a param that connects to a Field that is constrained by the values of other Field.
      It's currently being used on Dashboard or Embedding, but it could be used to power any parameters that connect to a Field.

  * Life cycle
  - Full FieldValues are created by the fingerprint or scanning process.
    Once it's created the values will be updated by the scanning process that runs daily.
    Only active FieldValues that have a last_used_at within [[active-field-values-cutoff]] will be updated on sync.
    FieldValues get a new last_used_at when going through [[get-or-create-full-field-values!]].
  - Advanced FieldValues are created on demand: for example the Sandbox FieldValues are created when a user with
    sandboxed permission try to get values of a Field.
    Normally these FieldValues will be deleted after [[advanced-field-values-max-age]] days by the scanning process.
    But they will also be automatically deleted when the Full FieldValues of the same Field got updated.

  There is also more written about how these are used for remapping in the docstrings
  for [[metabase.parameters.chain-filter]] and [[metabase.query-processor.middleware.add-remaps]]."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def ^:private ^Long entry-max-length
  "The maximum character length for a stored FieldValues entry."
  100)

(def ^:dynamic ^Long *total-max-length*
  "Maximum total length for a FieldValues entry (combined length of all values for the field)."
  (long (* analyze/auto-list-cardinality-threshold entry-max-length)))

(def ^:dynamic ^Integer *absolute-max-distinct-values-limit*
  "The absolute maximum number of results to return for a `field-distinct-values` query. Normally Fields with 100 or
  less values (at the time of this writing) get marked as `auto-list` Fields, meaning we save all their distinct
  values in a FieldValues object, which powers a list widget in the FE when using the Field for filtering in the QB.
  Admins can however manually mark any Field as `list`, which is effectively ordering Metabase to keep FieldValues for
  the Field regardless of its cardinality.

  Of course, if a User does something crazy, like mark a million-arity Field as List, we don't want Metabase to
  explode trying to make their dreams a reality; we need some sort of hard limit to prevent catastrophes. So this
  limit is effectively a safety to prevent Users from nuking their own instance for Fields that really shouldn't be
  List Fields at all. For these very-high-cardinality Fields, we're effectively capping the number of
  FieldValues that get could saved.

  This number should be a balance of:

  * Not being too low, which would definitely result in GitHub issues along the lines of 'My 500-distinct-value Field
    that I marked as List is not showing all values in the List Widget'
  * Not being too high, which would result in Metabase running out of memory dealing with too many values"
  (int 1000))

(def ^java.time.Period advanced-field-values-max-age
  "Age of an advanced FieldValues in days.
  After this time, these field values should be deleted by the `delete-expired-advanced-field-values` job."
  (t/days 30))

(def ^:private ^java.time.Period active-field-values-cutoff
  "How many days until a FieldValues is considered inactive. Inactive FieldValues will not be synced until
   they are used again."
  (t/days 14))

(def advanced-field-values-types
  "A class of fieldvalues that has additional constraints/filters."
  #{:sandbox         ;; field values filtered by sandbox permissions
    :impersonation   ;; field values with connection impersonation enforced (db-level roles)
    :linked-filter
    :advanced}) ;; field values with constraints from other linked parameters on dashboard/embedding

(def ^:private field-values-types
  "All FieldValues type."
  (into #{:full} ;; default type for fieldvalues where it contains values for a field without constraints
        advanced-field-values-types))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Entity & Lifecycle                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(methodical/defmethod t2/table-name :model/FieldValues [_model] :metabase_fieldvalues)

(doto :model/FieldValues
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/FieldValues
  {:human_readable_values mi/transform-json-no-keywordization
   :values                mi/transform-json
   :type                  mi/transform-keyword})

(defn- assert-valid-human-readable-values [{human-readable-values :human_readable_values}]
  (when-not (mr/validate [:maybe [:sequential [:maybe ms/NonBlankString]]] human-readable-values)
    (throw (ex-info (tru "Invalid human-readable-values: values must be a sequence; each item must be nil or a string")
                    {:human-readable-values human-readable-values
                     :status-code           400}))))

(defn- assert-valid-type-hash-combo
  "Ensure that type is present, valid, and that a hash_key is provided iff this is an advanced field type."
  [{:keys [type hash_key] :as _field-values}]
  (when-not (contains? field-values-types type)
    (throw (ex-info (tru "Invalid field-values type.")
                    {:type        type
                     :status-code 400})))

  (when (and (= type :full) hash_key)
    (throw (ex-info (tru "Full FieldValues shouldn''t have hash_key.")
                    {:type        type
                     :hash_key    hash_key
                     :status-code 400})))

  (when (and (advanced-field-values-types type) (str/blank? hash_key))
    (throw (ex-info (tru "Advanced FieldValues require a hash_key.")
                    {:type        type
                     :status-code 400}))))

(defn- assert-no-identity-changes [id changes]
  (when (some #(contains? changes %) [:field_id :type :hash_key])
    (throw (ex-info (tru "Can''t update field_id, type, or hash_key for a FieldValues.")
                    {:id          id
                     :field_id    (:field_id changes)
                     :type        (:type changes)
                     :hash_key    (:hash_key changes)
                     :status-code 400}))))

(defn clear-advanced-field-values-for-field!
  "Remove all advanced FieldValues for a `field-or-id`."
  [field-or-id]
  (t2/delete! :model/FieldValues :field_id (u/the-id field-or-id)
              :type     [:in advanced-field-values-types]))

(defn clear-field-values-for-field!
  "Remove all FieldValues for a `field-or-id`, including the advanced fieldvalues."
  [field-or-id]
  (t2/delete! :model/FieldValues :field_id (u/the-id field-or-id)))

(t2/define-before-insert :model/FieldValues
  [{:keys [field_id] :as field-values}]
  (u/prog1 (update field-values :type #(keyword (or % :full)))
    (assert-valid-human-readable-values field-values)
    (assert-valid-type-hash-combo <>)
    ;; if inserting a new full fieldvalues, make sure all the advanced field-values of this field are deleted
    (when (= :full (:type <>))
      (clear-advanced-field-values-for-field! field_id))))

(t2/define-before-update :model/FieldValues
  [field-values]
  (let [changes (t2/changes field-values)]
    (u/prog1 (update field-values :type #(keyword (or % :full)))
      (assert-no-identity-changes (:id field-values) changes)
      (assert-valid-human-readable-values field-values)
      ;; if we're updating the values of a Full FieldValues, delete all Advanced FieldValues of this field
      (when (and (contains? changes :values) (= :full (:type <>)))
        (clear-advanced-field-values-for-field! (:field_id field-values))))))

(defn- assert-coherent-query [{:keys [type hash_key] :as field-values}]
  (cond
    (nil? type)
    (when (some? hash_key)
      (throw (ex-info "Invalid query - cannot specify a hash_key without specifying the type"
                      {:field-values field-values})))

    (= :full (keyword type))
    (when (some? hash_key)
      (throw (ex-info "Invalid query - :full FieldValues cannot have a hash_key"
                      {:field-values field-values})))

    (and (contains? field-values :hash_key) (nil? hash_key))
    (throw (ex-info "Invalid query - Advanced FieldValues can only specify a non-empty hash_key"
                    {:field-values field-values}))))

(defn- add-mismatched-hash-filter [{:keys [type] :as field-values}]
  (cond
    (= :full (keyword type)) (assoc field-values :hash_key nil)
    (some? type)             (update field-values :hash_key #(or % [:not= nil]))
    :else                    field-values))

(t2/define-before-select :model/FieldValues
  [{:keys [kv-args] :as query}]
  (assert-coherent-query kv-args)
  (update query :kv-args add-mismatched-hash-filter))

(t2/define-after-select :model/FieldValues
  [field-values]
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

(defmethod serdes/hash-fields :model/FieldValues
  [_field-values]
  [(serdes/hydrated-hash :field)])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Utils fns                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn inactive?
  "If FieldValues have not been accessed recently they are considered inactive."
  [field-values]
  (and field-values (t/before? (:last_used_at field-values)
                               (t/minus (t/offset-date-time) active-field-values-cutoff))))

(defn field-should-have-field-values?
  "Should this `field` be backed by a corresponding FieldValues object?"
  [field-or-field-id]
  (if-not (map? field-or-field-id)
    (let [field-id (u/the-id field-or-field-id)]
      (recur (or (t2/select-one ['Field :base_type :visibility_type :has_field_values] :id field-id)
                 (throw (ex-info (tru "Field {0} does not exist." field-id)
                                 {:field-id field-id, :status-code 404})))))
    (let [{base-type        :base_type
           visibility-type  :visibility_type
           has-field-values :has_field_values} field-or-field-id]
      (boolean
       (and
        (not (contains? #{:retired :sensitive :hidden :details-only} (keyword visibility-type)))
        (not (isa? (keyword base-type) :type/field-values-unsupported))
        (not (= (keyword base-type) :type/*))
        (#{:list :auto-list} (keyword has-field-values)))))))

(defn take-by-length
  "Like `take` but condition by the total length of elements.
   Assumes the elements are 1-tuples of values with a .toString() method.
   Returns a stateful transducer when no collection is provided.

    ;; (take-by-length 6 [[\"Dog\"] [\"Cat\"] [\"Duck\"]])
    ;; => [[\"Dog\"] [\"Cat\"]]"
  ([max-length]
   (fn [rf]
     (let [current-length (volatile! 0)]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result input]
          (vswap! current-length + (count (str (first input))))
          (if (< @current-length max-length)
            (rf result input)
            (reduced result)))))))

  ([max-length coll]
   (lazy-seq
    (when-let [s (seq coll)]
      (let [f          (first s)
            new-length (- max-length (count (str (first f))))]
        (when-not (neg? new-length)
          (cons f (take-by-length new-length
                                  (rest s)))))))))

(defn fixup-human-readable-values
  "Field values and human readable values are lists that are zipped together. If the field values have changed, the
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

(defenterprise hash-input-for-sandbox
  "Return a hash-key that will be used for sandboxed fieldvalues."
  metabase-enterprise.sandbox.models.params.field-values
  [_field]
  nil)

(defenterprise hash-input-for-impersonation
  "Return a hash-key that will be used for impersonated fieldvalues."
  metabase-enterprise.impersonation.driver
  [_field]
  nil)

(defenterprise hash-input-for-database-routing
  "Returns a hash input that will be used for fields subject to database routing"
  metabase-enterprise.database-routing.model
  [_field]
  nil)

(defn hash-input-for-linked-filters
  "Return a hash-key that will be used for linked-filters fieldvalues."
  [_field constraints]
  (when (seq constraints)
    {:constraints constraints}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    CRUD fns                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- limit-max-char-len-rff :- ::qp.schema/rff
  "Returns a rff that will stop when the total character length of the values exceeds `max-char-len`."
  [rff max-char-len]
  (fn [metadata]
    (let [rf         (rff metadata)
          total-char (volatile! 0)]
      (fn
        ([]
         (rf))
        ([result]
         (rf result))
        ([result row]
         (assert (= 1 (count row)))
         (vswap! total-char + (count (str (first row))))
         (if (> @total-char max-char-len)
           (reduced (assoc result ::reached-char-len-limit true))
           (rf result row)))))))

;;; TODO -- move into [[metabase.warehouse-schema.metadata-from-qp]] ??
(defn distinct-values
  "Fetch a sequence of distinct values for `field` that are below the [[*total-max-length*]] threshold. If the values
  are past the threshold, this returns a subset of possible values values where the total length of all items is less
  than [[*total-max-length*]]. It also returns a `has_more_values` flag, `has_more_values` = `true` when the returned
  values list is a subset of all possible values.

  ;; (distinct-values (Field 1))
  ;; ->  {:values          [[1], [2], [3]]
          :has_more_values false}

  (This function provides the values that normally get saved as a Field's FieldValues. You most likely should not be
  using this directly in code outside of this namespace, unless it's for a very specific reason, such as certain cases
  where we fetch ad-hoc FieldValues for GTAP-filtered Fields.)"
  [field]
  (try
    (let [result          ((requiring-resolve 'metabase.warehouse-schema.metadata-from-qp/table-query)
                           (:table_id field)
                           {:breakout [[:field (u/the-id field) nil]]
                            :limit    *absolute-max-distinct-values-limit*}
                           (limit-max-char-len-rff qp.reducible/default-rff *total-max-length*))
          distinct-values (-> result :data :rows)]
      {:values          distinct-values
       ;; has_more_values=true means the list of values we return is a subset of all possible values.
       :has_more_values (or (true? (::reached-char-len-limit result))
                            ;; `distinct-values` is from a query
                            ;; with limit = [[*absolute-max-distinct-values-limit*]].
                            ;; So, if the returned `distinct-values` has length equal to that exact limit,
                            ;; we assume the returned values is just a subset of what we have in DB.
                            (= (count distinct-values)
                               *absolute-max-distinct-values-limit*))})
    (catch Throwable e
      (log/error e "Error fetching field values")
      nil)))

(defn- delete-duplicates-and-return-latest!
  "Takes a list of field values, return a map of field-id -> latest FieldValues.

  If a field has more than one Field Values, delete the old ones. This is a workaround for the issue of stale
  FieldValues rows (metabase#668) In order to mitigate the impact of duplicates, we return the most recently updated
  row, and delete the older rows.

  It assumes that all rows are of the same type. Rows could be from multiple field-ids."
  [fvs]
  (let [fvs-grouped-by-field-id (update-vals (group-by :field_id fvs)
                                             #(sort-by :updated_at u/reverse-compare %))
        to-delete-fv-ids        (->> (vals fvs-grouped-by-field-id)
                                     (mapcat rest)
                                     (map :id))]
    (when (seq to-delete-fv-ids)
      (t2/delete! :model/FieldValues :id [:in to-delete-fv-ids]))
    (update-vals fvs-grouped-by-field-id first)))

(defn- get-latest-field-values
  "This returns the FieldValues with the given :type and :hash_key for the given Field.
  This may implicitly delete shadowed entries in the database, see [[delete-duplicates-and-return-latest!]]"
  [field-id type hash]
  (assert (= (nil? hash) (= type :full)) ":hash_key must be nil iff :type is :full")
  (-> (t2/select :model/FieldValues :field_id field-id :type type :hash_key hash)
      delete-duplicates-and-return-latest!
      (get field-id)))

(defn get-latest-full-field-values
  "This returns the full FieldValues for the given Field.
   This may implicitly delete shadowed entries in the database, see [[delete-duplicates-and-return-latest!]]"
  [field-id]
  (get-latest-field-values field-id :full nil))

(defn batched-get-latest-full-field-values
  "Batched version of [[get-latest-full-field-values]] .
  Takes a list of field-ids and returns a map of field-id -> full FieldValues.
  This may implicitly delete shadowed entries in the database, see [[delete-duplicates-and-return-latest!]]"
  [field-ids]
  (delete-duplicates-and-return-latest!
   (t2/select :model/FieldValues :field_id [:in field-ids] :type :full :hash_key nil)))

(defn create-or-update-full-field-values!
  "Create or update the full FieldValues object for `field`. If the FieldValues object already exists, then update values for
   it; otherwise create a new FieldValues object with the newly fetched values. Returns whether the field values were
   created/updated/deleted as a result of this call.

  Note that if the full FieldValues are create/updated/deleted, it'll delete all the Advanced FieldValues of the same `field`."
  [field & {:keys [field-values human-readable-values]}]
  (if (field-should-have-field-values? field)
    (let [field-values              (or field-values (get-latest-full-field-values (u/the-id field)))
          {unwrapped-values :values
           :keys [has_more_values]} (distinct-values field)
          ;; unwrapped-values are 1-tuples, so we need to unwrap their values for storage
          values                    (seq (map first unwrapped-values))
          field-name                (or (:name field) (:id field))]
      (cond
        (and values
             (= (:values field-values) values)
             (= (:has_more_values field-values) has_more_values))
        (do
          (log/debugf "FieldValues for Field %s remain unchanged. Skipping..." field-name)
          ::fv-skipped)

        ;; if the FieldValues object already exists then update values in it
        (and field-values values)
        (do
          (log/debugf "Storing updated FieldValues for Field %s..." field-name)
          (t2/update! :model/FieldValues (u/the-id field-values)
                      (m/remove-vals nil?
                                     {:has_more_values       has_more_values
                                      :values                values
                                      :human_readable_values (fixup-human-readable-values field-values values)}))
          ::fv-updated)

        ;; if FieldValues object doesn't exist create one
        values
        (do
          (log/debugf "Storing FieldValues for Field %s..." field-name)
          (app-db/select-or-insert! :model/FieldValues {:field_id (u/the-id field), :type :full}
                                    (constantly {:has_more_values       has_more_values
                                                 :values                values
                                                 :human_readable_values human-readable-values}))
          ::fv-created)

        ;; otherwise this Field isn't eligible, so delete any FieldValues that might exist
        :else
        (do
          (clear-field-values-for-field! field)
          ::fv-deleted)))
    (do
      (clear-field-values-for-field! field)
      ::fv-deleted)))

(defn get-or-create-full-field-values!
  "Create FieldValues for a `Field` if they *should* exist but don't already exist. Returns the existing or newly
  created FieldValues for `Field`. Updates :last_used_at so sync will know this is active."
  {:arglists '([field] [field human-readable-values])}
  [{field-id :id field-values :values :as field} & [human-readable-values]]
  {:pre [(integer? field-id)]}
  (when (field-should-have-field-values? field)
    (let [existing (or (not-empty field-values) (get-latest-full-field-values field-id))]
      (if (or (not existing) (inactive? existing))
        (case (create-or-update-full-field-values! field :human-readable-values human-readable-values)
          ::fv-deleted
          nil

          ::fv-created
          (get-latest-full-field-values field-id)

          (do
            (when existing
              (t2/update! :model/FieldValues (:id existing) {:last_used_at :%now}))
            (get-latest-full-field-values field-id)))
        (do
          (t2/update! :model/FieldValues (:id existing) {:last_used_at :%now})
          existing)))))

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
                               (t2/select-pk->fn :db_id 'Table :id [:in table-ids]))
        db-id->is-on-demand? (when (seq table-id->db-id)
                               (t2/select-pk->fn :is_on_demand 'Database
                                                 :id [:in (set (vals table-id->db-id))]))]
    (into {} (for [table-id table-ids]
               [table-id (-> table-id table-id->db-id db-id->is-on-demand?)]))))

(defn update-field-values-for-on-demand-dbs!
  "Update the FieldValues for any Fields with `field-ids` if the Field should have FieldValues and it belongs to a
  Database that is set to do 'On-Demand' syncing."
  [field-ids]
  (let [fields (when (seq field-ids)
                 (filter field-should-have-field-values?
                         (t2/select ['Field :name :id :base_type :effective_type :coercion_strategy
                                     :semantic_type :visibility_type :table_id :has_field_values]
                                    :id [:in field-ids])))
        table-id->is-on-demand? (table-ids->table-id->is-on-demand? (map :table_id fields))]
    (doseq [{table-id :table_id, :as field} fields]
      (when (table-id->is-on-demand? table-id)
        (log/debugf "Field %s '%s' should have FieldValues and belongs to a Database with On-Demand FieldValues updating."
                    (u/the-id field) (:name field))
        (create-or-update-full-field-values! field)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Serialization                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod serdes/entity-id "FieldValues" [_ _] nil)

(defmethod serdes/generate-path "FieldValues" [_ {:keys [field_id]}]
  (let [field (t2/select-one 'Field :id field_id)]
    (conj (serdes/generate-path "Field" field)
          {:model "FieldValues" :id "0"})))

(defmethod serdes/dependencies "FieldValues" [fv]
  ;; Take the path, but drop the FieldValues section at the end, to get the parent Field's path instead.
  [(pop (serdes/path fv))])

(defmethod serdes/load-find-local "FieldValues" [path]
  ;; Delegate to finding the parent Field, then look up its corresponding FieldValues.
  (let [field (serdes/load-find-local (pop path))]
    ;; We only serialize the full values, see [[metabase.warehouse-schema.models.field/with-values]]
    (get-latest-full-field-values (:id field))))

(defn- field-path->field-ref [field-values-path]
  (let [[db schema table field :as field-ref] (map :id (pop field-values-path))]
    (if field
      field-ref
      ;; It's too short, so no schema. Shift them over and add a nil schema.
      [db nil schema table])))

(defmethod serdes/make-spec "FieldValues" [_model-name _opts]
  {:copy      [:values :human_readable_values :has_more_values :hash_key]
   :transform {:created_at   (serdes/date)
               :last_used_at (serdes/date)
               :type         (serdes/kw)
               :field_id     {::serdes/fk true
                              :export     (constantly ::serdes/skip)
                              :import-with-context (fn [current _ _]
                                                     (let [field-ref (field-path->field-ref (serdes/path current))]
                                                       (serdes/*import-field-fk* field-ref)))}}})

(defmethod serdes/load-update! "FieldValues" [_ ingested local]
  ;; It's illegal to change the :type and :hash_key fields, and there's a pre-update check for this.
  ;; This drops those keys from the incoming FieldValues iff they match the local one. If they are actually different,
  ;; this preserves the new value so the normal error is produced.
  (let [ingested (cond-> ingested
                   (= (:type ingested)     (:type local))     (dissoc :type)
                   (= (:hash_key ingested) (:hash_key local)) (dissoc :hash_key))]
    ((get-method serdes/load-update! "") "FieldValues" ingested local)))

(def ^:private field-values-slug "___fieldvalues")

(defmethod serdes/storage-path "FieldValues" [fv _]
  ;; [path to table "fields" "field-name___fieldvalues"] since there's zero or one FieldValues per Field, and Fields
  ;; don't have their own directories.
  (let [hierarchy    (serdes/path fv)
        field-path   (serdes/storage-path-prefixes (drop-last hierarchy))]
    (update field-path (dec (count field-path)) str field-values-slug)))
