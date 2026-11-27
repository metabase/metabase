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
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.sql-errors :as sql-errors]
   [metabase.database-routing.core :as database-routing]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.metadata-from-qp :as metadata-from-qp]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^Long entry-max-length
  "The maximum character length for a stored FieldValues entry."
  100)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^Long *total-max-length*
  "Maximum total length for a FieldValues entry (combined length of all values for the field)."
  (long (* analyze/auto-list-cardinality-threshold entry-max-length)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^Integer *distinct-limit*
  "Per-column row cap for warehouse-side distinct-value fetches. Used by the UNION ALL per-arm
  `LIMIT`, by the per-field MBQL `lib/limit` in `distinct-values`, and by `persist-field-values!`
  to detect whether the warehouse hit that cap.

  Fields with fewer distinct values than this get marked as `auto-list`, meaning we save all
  their distinct values in a FieldValues object that powers the list widget in the FE. Admins
  can also manually mark any Field as `list`, which keeps FieldValues regardless of cardinality.

  If a user does something crazy like marking a million-arity Field as List, this limit
  prevents Metabase from exploding trying to fetch all values. The trade-off:

  * Too low → GitHub issues like 'My 500-distinct-value Field that I marked as List is not
    showing all values in the List Widget'
  * Too high → Metabase runs out of memory materialising the result set"
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

(methodical/defmethod t2/table-name :model/FieldValues [_model] :metabase_fieldvalues)

(doto :model/FieldValues
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/FieldValues
  {:human_readable_values mi/transform-json-no-keywordization
   :values                mi/transform-json
   :type                  mi/transform-keyword})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-human-readable-values-cover-values
  "Throws a 400 unless `field-values`, as an update leaves it with its stored columns, has no human-readable values or
  one for each of its values."
  [{values :values, human-readable-values :human_readable_values}]
  (when (and (seq human-readable-values) (not= (count human-readable-values) (count values)))
    (throw (ex-info (tru "If remapped values are specified, they must be specified for all field values")
                    {:status-code 400}))))

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

(defn- check-display-values-not-in-worktree
  "Throws a 400 when display values are `written?` in a remote sync worktree other than the main app, since every
  worktree shares the FieldValues."
  [written?]
  (when (and written? (mdb/worktree-id))
    (throw (ex-info (tru "Display values can only be changed in the main app, not in a worktree.") {:status-code 400}))))

(t2/define-before-insert :model/FieldValues
  [field-values]
  (check-display-values-not-in-worktree (seq (:human_readable_values field-values)))
  (u/prog1 (update field-values :type #(keyword (or % :full)))
    (assert-valid-type-hash-combo <>)))

(t2/define-before-update :model/FieldValues
  [field-values]
  (let [changes (t2/changes field-values)]
    (check-display-values-not-in-worktree (contains? changes :human_readable_values))
    (u/prog1 (update field-values :type #(keyword (or % :full)))
      (assert-no-identity-changes (:id field-values) changes)
      (when (some #(contains? changes %) [:values :human_readable_values])
        (check-human-readable-values-cover-values field-values)))))

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

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- hydrate-field-permission
  "Sets on each of `field-values` the answer its Field gives for `k`, `:can_read` or `:can_write`, the Fields answered
  together."
  [k field-values]
  (let [field-ids (into #{} (keep :field_id) field-values)
        fields    (when (seq field-ids) (warehouse-schema.db/fields field-ids))
        answers   (into {} (map (juxt :id (if (= k :can_read) mi/can-read? mi/can-write?))) (t2/hydrate fields k))]
    (for [fv field-values]
      (when fv
        (let [answer (boolean (get answers (:field_id fv)))]
          (if (= k :can_read)
            (vary-meta fv assoc k answer)
            (assoc fv k answer)))))))

(methodical/defmethod t2/batched-hydrate [:model/FieldValues :can_read]
  "Whether the current user can read each of `field-values`, which they can when they read its Field."
  [_model k field-values]
  (hydrate-field-permission k field-values))

(methodical/defmethod t2/batched-hydrate [:model/FieldValues :can_write]
  "Whether the current user can write each of `field-values`, which they can when they write its Field."
  [_model k field-values]
  (hydrate-field-permission k field-values))

;;; ----------------------------------------------------- Utils ------------------------------------------------------

(defn- used-recently?
  "Whether `last-used-at` falls within [[active-field-values-cutoff]]."
  [last-used-at]
  (boolean (some-> last-used-at (t/after? (t/minus (t/offset-date-time) active-field-values-cutoff)))))

(defn inactive?
  "Whether neither `field-values` nor any other FieldValues of their Field, the latest `last_used_at` of which is
  `field-last-used-at`, read when not given, were used within [[active-field-values-cutoff]]."
  ([field-values]
   (and field-values
        (not (used-recently? (:last_used_at field-values)))
        (inactive? field-values (warehouse-schema.db/field-values-last-used-at (:field_id field-values)))))
  ([field-values field-last-used-at]
   (and field-values
        (not (used-recently? (:last_used_at field-values)))
        (not (used-recently? field-last-used-at)))))

(defn field-should-have-field-values?
  "Should this `field` be backed by a corresponding FieldValues object?"
  [field-or-field-id]
  (if-not (map? field-or-field-id)
    (let [field-id (u/the-id field-or-field-id)]
      (recur (or (warehouse-schema.db/field-values-eligibility field-id)
                 (throw (ex-info (tru "Field {0} does not exist." field-id)
                                 {:field-id field-id, :status-code 404})))))
    (let [{base-type        :base_type
           visibility-type  :visibility_type
           has-field-values :has_field_values
           preview-display  :preview_display} field-or-field-id]
      (boolean
       (and
        (not (contains? #{:retired :sensitive :hidden} (keyword visibility-type)))
        ;; preview_display is set to false by sync for fields that shouldn't have FieldValues
        ;; (e.g. long text fields, JSON columns, auto-cruft columns). Defaults to true if not provided.
        (not (false? preview-display))
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

;;; ---------------------------------------------- Advanced FieldValues ----------------------------------------------

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
  "Return a hash-key that will be used for impersonated fieldvalues of a Field of the Database with `_database-id`."
  metabase-enterprise.impersonation.driver
  [_database-id]
  nil)

(defenterprise hash-input-for-database-routing
  "Returns a hash input that will be used for fields of the Database with `_database-id` subject to database routing."
  metabase-enterprise.database-routing.models
  [_database-id]
  nil)

(defn hash-input-for-linked-filters
  "Return a hash-key that will be used for linked-filters fieldvalues."
  [_field constraints]
  (when (seq constraints)
    {:constraints constraints}))

;;; ------------------------------------------------------ CRUD ------------------------------------------------------

(declare create-field-values! delete-field-values! ids-of-fields find-or-create-full-field-values! touch-field-values!
         update-field-values!)

(defn limit-values
  "Dedup, sort, and apply the `*total-max-length*` character cap to a sequence of scalar `values`.
  Returns `{:values sorted-vec, :has_more_values bool}` where `:has_more_values` reflects only
  the char-length cap (i.e. there are more distinct values beyond what fit in the byte budget).

  NULL values are kept as a valid distinct value — they're meaningful in parameter widgets
  (\"no value set\") and match the per-field MBQL path's storage behavior.

  Used by the bulk / UNION distinct-fetching paths to finalize per-field value sets in memory."
  [values]
  (loop [str-length 0
         acc        (sorted-set)
         values     values]
    (cond
      (empty? values)
      {:values (vec acc) :has_more_values false}

      (contains? acc (first values))
      (recur str-length acc (rest values))

      :else
      (let [new-str-length (+ str-length (count (str (first values))))]
        (if (> new-str-length *total-max-length*)
          {:values (vec acc) :has_more_values true}
          (recur new-str-length (conj acc (first values)) (rest values)))))))

;;; TODO -- move into [[metabase.warehouse-schema.metadata-from-qp]] ??
(mu/defn distinct-values
  "Fetch raw distinct values for `field` from the warehouse, row-capped at
  `*distinct-limit*`. Returns `{:values rows-as-1-tuples}`.

  Callers that persist these values via `persist-field-values!` get the char-length cap +
  `:has_more_values` computation for free. Callers that need to surface values directly
  (e.g. parameter widgets) should apply `take-by-length` + their own `:has_more_values`
  derivation, as `parameters/field-values` does."
  [field :- [:or
             (ms/InstanceOf :model/Field)
             ::lib.schema.metadata/column]]
  (try
    (let [field  (cond-> field
                   ;; a caller may hand us a Field hydrated with its Table, which is not part of column metadata
                   (t2/model field) (-> (dissoc :table) (lib-be/instance->metadata :metadata/column)))
          result (metadata-from-qp/table-query
                  (:table-id field)
                  (fn [query]
                    (-> query
                        (lib/breakout field)
                        (lib/limit *distinct-limit*)))
                  qp.reducible/default-rff)]
      {:values (-> result :data :rows)})
    (catch Throwable e
      (log/errorf "Error fetching field values: %s" (ex-message e))
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
      (delete-field-values! to-delete-fv-ids))
    (update-vals fvs-grouped-by-field-id first)))

(defn- get-latest-field-values
  "This returns the FieldValues with the given :type and :hash_key for the given Field.
  This may implicitly delete shadowed entries in the database, see [[delete-duplicates-and-return-latest!]]"
  [field-id type hash]
  (assert (= (nil? hash) (= type :full)) ":hash_key must be nil iff :type is :full")
  (-> (warehouse-schema.db/field-values-of-type field-id type hash)
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
  (delete-duplicates-and-return-latest! (warehouse-schema.db/full-field-values-for-fields (vec field-ids))))

(mu/defn fields-last-used-at :- [:map-of ::lib.schema.id/field ms/TemporalInstant]
  "The latest `last_used_at` of any FieldValues of the Field of each of `field-values` not used within
  [[active-field-values-cutoff]], by Field id, for [[inactive?]]."
  [field-values :- [:sequential [:map [:field_id ::lib.schema.id/field]]]]
  (warehouse-schema.db/field-values-last-used-at-by-field
   (into [] (comp (remove (comp used-recently? :last_used_at)) (map :field_id)) field-values)))

(defn field-values-change
  "What persisting `raw-values`, the raw distinct values of one Field from the warehouse, changes against
  `existing-fv`, its full FieldValues or nil: `{:result r}` with `r` one of `::fv-skipped`, `::fv-updated`,
  `::fv-created` or `::fv-deleted`, and the `:delete` Field id, `:create` row or `:update` row that
  [[save-field-values-changes!]] writes."
  [field existing-fv raw-values]
  (let [field-name      (or (:name field) (:id field))
        row-cap-hit?    (>= (count raw-values) *distinct-limit*)
        {values        :values
         char-cap-hit? :has_more_values} (limit-values raw-values)
        has-more-values (boolean (or row-cap-hit? char-cap-hit?))]
    (cond
      (empty? values)
      {:result ::fv-deleted
       :delete (u/the-id field)}

      (nil? existing-fv)
      (do
        (log/debugf "Storing FieldValues for Field %s..." field-name)
        {:result ::fv-created
         :create {:field_id              (u/the-id field)
                  :type                  :full
                  :has_more_values       has-more-values
                  :values                values
                  :human_readable_values nil}})

      (and (= (:values existing-fv) values)
           (= (:has_more_values existing-fv) has-more-values))
      (do
        (log/debugf "FieldValues for Field %s remain unchanged. Skipping..." field-name)
        {:result ::fv-skipped})

      :else
      (do
        (log/debugf "Storing updated FieldValues for Field %s..." field-name)
        {:result ::fv-updated
         :update (assoc (m/remove-vals nil?
                                       {:has_more_values       has-more-values
                                        :values                values
                                        :human_readable_values (fixup-human-readable-values existing-fv values)})
                        :id (u/the-id existing-fv))}))))

(defn- create-full-field-values!
  "Insert the full FieldValues `rows` of Fields that have none by now in one transaction, or one Field at a time with
  [[find-or-create-full-field-values!]] when a concurrent insert stored some first."
  [rows]
  (let [stored (into #{}
                     (map :field_id)
                     (warehouse-schema.db/full-field-values-by-field [:model/FieldValues :field_id]
                                                                     (into #{} (map :field_id) rows)))
        rows   (into [] (remove (comp stored :field_id)) rows)]
    (when (seq rows)
      (try
        (create-field-values! rows)
        (catch Exception e
          (when-not (sql-errors/duplicate-key? e)
            (throw e))
          (doseq [{:keys [field_id has_more_values values]} rows]
            (find-or-create-full-field-values! field_id has_more_values values)))))))

(defn save-field-values-changes!
  "Write `changes`, each what [[field-values-change]] returns for a Field, with one delete call, one insert call and
  one update call."
  [changes]
  (let [deletes (into [] (keep :delete) changes)
        creates (into [] (keep :create) changes)
        updates (into [] (keep :update) changes)]
    (when (seq deletes)
      (delete-field-values! (ids-of-fields deletes)))
    (when (seq creates)
      (create-full-field-values! creates))
    (when (seq updates)
      (update-field-values! updates))
    nil))

(defn persist-field-values!
  "Write what [[field-values-change]] returns for `field`, `existing-fv` and `raw-values`, and return its `:result`."
  [field existing-fv raw-values]
  (let [change (field-values-change field existing-fv raw-values)]
    (save-field-values-changes! [change])
    (:result change)))

(defn create-or-update-full-field-values!
  "Create or update the full FieldValues object for `field`. If the FieldValues object already
  exists, then update values for it; otherwise create a new FieldValues object with the newly
  fetched values. Returns whether the field values were created / updated / deleted as a result
  of this call, or `::fv-fetch-failed` if the warehouse scan failed and nothing was changed.

  Note that if the full FieldValues are create / updated / deleted, it'll delete all the
  Advanced FieldValues of the same `field`."
  [field & {:keys [field-values]}]
  (if (field-should-have-field-values? field)
    (let [existing-fv (or field-values (get-latest-full-field-values (u/the-id field)))]
      ;; `distinct-values` returns nil when the warehouse scan failed, which is not the same as a
      ;; field that genuinely has no values: persisting it would read as "empty" and delete the
      ;; values we already have. Leave whatever is cached in place instead.
      (if-let [{rows :values} (database-routing/with-anonymous-router-access (distinct-values field))]
        ;; rows are 1-tuples — unwrap for storage.
        (persist-field-values! field existing-fv (seq (map first rows)))
        ::fv-fetch-failed))
    (do
      (delete-field-values! (ids-of-fields [(u/the-id field)]))
      ::fv-deleted)))

(def ^:private in-flight-fetches
  "`cache-key` -> `{:promise :future-ref :timer}` for the fetch currently running for that key.
  See [[detached-fetch!]]."
  (atom {}))

(def ^:private fetch-max-age-ms
  "How long a detached fetch may run before it is canceled, and how long a caller will wait on one.

  Only a fetch wedged outside the query processor can reach this: the warehouse query itself is
  already capped by `*query-timeout-ms*` (`MB_DB_QUERY_TIMEOUT_MINUTES`, 20 minutes in prod), so
  this is a backstop for work blocked somewhere the QP cannot cancel — acquiring a connection, or a
  driver that ignores cancellation.

  It bounds the wait as well as the work because [[sweep-stalled-fetches!]] only runs when a request
  arrives, and the case this guards against is precisely the one where none can: callers parked on a
  wedged fetch are request threads, so enough of them stop the server from serving anything at all.

  Deliberately a backstop rather than a request-latency bound. A value nearer a sensible HTTP
  timeout would hand the thread back far sooner, but returning before the values are ready changes
  what this endpoint promises its callers, and that is a decision of its own."
  (* 60 60 1000))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *max-in-flight-fetches*
  "Ceiling on the registry, independent of whatever else happens to bound it.

  Callers park on their fetch, so the number in flight is today limited by the request thread pool
  — but that is an accident of how these endpoints are served, not a guarantee this namespace can
  make. Past this many, [[detached-fetch!]] refuses the fetch with a 503 rather than letting the
  registry grow: reaching this means something is wrong, and failing loudly beats absorbing it.

  Sized well clear of the request thread pool (50 by default), so an instance has to have raised
  `MB_JETTY_MAXTHREADS` well past its default before this can be reached at all."
  200)

(defn- complete-fetch!
  "Drop `entry` from the registry and hand `result` to everyone waiting on it.

  Dropping the entry before delivering means a caller that wakes up and immediately asks again
  starts a fresh fetch rather than re-attaching to this finished one. The entry is removed only if
  it is still the registered one, so a fetch that was already swept can't evict its replacement."
  [cache-key entry result]
  (swap! in-flight-fetches (fn [m]
                             (cond-> m
                               (identical? entry (get m cache-key)) (dissoc cache-key))))
  (deliver (:promise entry) result))

(defn- sweep-stalled-fetches!
  "Cancel every fetch that has outlived [[fetch-max-age-ms]] and fail whoever is waiting on it.

  A fetch clears its own registry entry, so this fires only when that failed or when the work is
  genuinely wedged. It completes the entries rather than merely forgetting them: callers park on the
  promise, so an entry dropped without delivery leaves them blocked forever, each holding a request
  thread. Deliberately logs no cache keys — printing one is a way this could throw, and a backstop
  that throws is not a backstop."
  []
  (let [swept (atom 0)]
    (doseq [[cache-key {:keys [timer future-ref] :as entry}] @in-flight-fetches
            :when (> (u/since-ms timer) fetch-max-age-ms)]
      (some-> @future-ref future-cancel)
      (complete-fetch! cache-key entry
                       {:error (ex-info (tru "Timed out fetching field values.") {:cache-key cache-key})})
      (swap! swept inc))
    (when (pos? @swept)
      (log/warnf "Canceled %d FieldValues fetch(es) still running after %d ms" @swept fetch-max-age-ms))))

(defn- claim-fetch!
  "Register `entry` for `cache-key` and return whichever entry is registered once we are done, or
  nil when the registry is already full.

  The `contains?` check comes first deliberately: joining a fetch already in flight adds no entry,
  so a full registry must not turn those callers away. Only a new key can be refused. Checking
  capacity inside the swap keeps the ceiling exact under concurrent claims."
  [cache-key entry]
  (-> (swap! in-flight-fetches (fn [m]
                                 (if (or (contains? m cache-key)
                                         (>= (count m) *max-in-flight-fetches*))
                                   m
                                   (assoc m cache-key entry))))
      (get cache-key)))

(defn detached-fetch!
  "Run `thunk` on a background thread and return its result, rethrowing anything it throws.

  Calls sharing a `cache-key` while a fetch is in flight all wait on that one run instead of
  starting their own. Because the work is detached from the calling thread, it runs to completion
  — and persists whatever it fetched — even when the caller stops waiting, e.g. when the HTTP
  request that asked for the values is canceled."
  [cache-key thunk]
  ;; sweep here rather than on a timer: the registry only grows when something is inserted, so this
  ;; runs exactly when it needs to. Guarded because a failure to sweep must not fail this caller.
  (try
    (sweep-stalled-fetches!)
    (catch Throwable e
      (log/warn e "Error sweeping stalled FieldValues fetches")))
  (let [entry {:promise (promise), :future-ref (atom nil), :timer (u/start-timer)}
        this  (or (claim-fetch! cache-key entry)
                  (throw (ex-info (tru "Too many field values fetches are already running. Please try again shortly.")
                                  {:status-code   503
                                   :max-in-flight *max-in-flight-fetches*})))]
    (when (identical? this entry)
      ;; Every path from here must reach `complete-fetch!`. An entry left in the registry with its
      ;; promise undelivered is worse than a leak: every later caller for that key parks on it
      ;; forever, holding a request thread each.
      (try
        (reset! (:future-ref entry)
                (future
                  (try
                    (complete-fetch! cache-key entry {:value (thunk)})
                    (catch Throwable e
                      (complete-fetch! cache-key entry {:error e})
                      ;; log only once everyone waiting has been served: an appender that throws here
                      ;; would otherwise strand them. Log at all because when every caller has walked
                      ;; away there is nobody left to deref the promise, so this is the only record.
                      (log/warnf e "Error fetching FieldValues for %s" (pr-str cache-key))))))
        ;; submitting can fail on its own — `future`'s pool rejects new work once the JVM starts
        ;; shutting down, and the registry entry is already in place by then
        (catch Throwable e
          (complete-fetch! cache-key entry {:error e}))))
    (let [{:keys [value error] :as result} (deref (:promise this) fetch-max-age-ms ::timed-out)]
      (cond
        (= result ::timed-out)
        (throw (ex-info (tru "Timed out waiting for field values.")
                        {:status-code 503
                         :timeout-ms  fetch-max-age-ms}))

        error
        (throw error)

        :else
        value))))

(defn get-or-create-full-field-values!
  "Create FieldValues for a `Field` if they *should* exist but don't already exist. Returns the existing or newly
  created FieldValues for `Field`. Updates :last_used_at so sync will know this is active."
  [{field-id :id field-values :values :as field}]
  {:pre [(integer? field-id)]}
  (when (field-should-have-field-values? field)
    (let [existing (or (not-empty field-values) (get-latest-full-field-values field-id))]
      (if (or (not existing) (inactive? existing))
        (detached-fetch!
         [:full field-id]
         (fn []
           (case (create-or-update-full-field-values! field)
             ::fv-deleted
             nil

             ::fv-created
             (get-latest-full-field-values field-id)

             (do
               (when existing
                 (touch-field-values! existing))
               (get-latest-full-field-values field-id)))))
        (do
          (touch-field-values! existing)
          existing)))))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(mu/defn delete-field-values! :- :nil
  "Delete the FieldValues with `ids` in one transaction, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/FieldValues ids
                       {:before-delete #(events/publish-event! :event/field-values-delete (events/delete-event %))}))

(mu/defn ids-of-fields :- [:sequential ms/PositiveInt]
  "The ids of every FieldValues of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (warehouse-schema.db/field-values-ids-of-fields field-ids))

(mu/defn ids-of-tables :- [:sequential ms/PositiveInt]
  "The ids of the FieldValues of the Fields of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (warehouse-schema.db/field-values-ids-of-tables table-ids))

(mu/defn ids-of-database :- [:sequential ms/PositiveInt]
  "The ids of the FieldValues of every Field of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (warehouse-schema.db/field-values-ids-of-database database-id))

(mu/defn advanced-ids-of-fields :- [:sequential ms/PositiveInt]
  "The ids of the advanced FieldValues of the Fields with `field-ids`, which their full FieldValues replace."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (warehouse-schema.db/field-values-ids-of-types field-ids advanced-field-values-types))

(mu/defn ids-by-field :- [:map-of ::lib.schema.id/field [:sequential ms/PositiveInt]]
  "The ids of the FieldValues of each of the Fields with `field-ids` that has any, by Field id."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (-> (group-by :field_id (when (seq field-ids)
                            (warehouse-schema.db/field-values-ids-and-field-ids field-ids)))
      (update-vals #(mapv :id %))))

(mu/defn expired-advanced-ids-of-database :- [:sequential ms/PositiveInt]
  "The ids of the advanced FieldValues older than [[advanced-field-values-max-age]] of the active, normal-visibility
  Fields of the synced Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (warehouse-schema.db/expired-field-values-ids-of-database database-id
                                                            advanced-field-values-types
                                                            (t/as advanced-field-values-max-age :days)))

(defn- clear-advanced-field-values-for-fields!
  "Delete the advanced FieldValues of the Fields with `field-ids`, which their full FieldValues replace."
  [field-ids]
  (delete-field-values! (advanced-ids-of-fields (vec field-ids))))

(defn- clear-replaced-advanced-values!
  "Delete the advanced FieldValues of the Fields that the new FieldValues `rows` give full values, which those replace,
  and return `rows`."
  [rows]
  (clear-advanced-field-values-for-fields!
   (into #{} (comp (filter #(= :full (keyword (or (:type %) :full)))) (map :field_id)) rows))
  rows)

(mu/defn create-field-values! :- [:sequential ::warehouse-schema.schema/field-values]
  "Insert the FieldValues `rows` in one transaction, publishing their create event, and return the inserted FieldValues,
  deleting first the advanced FieldValues of the Fields that get full ones."
  [rows :- [:sequential ::warehouse-schema.schema/field-values.create]]
  (mdb/create-batched! :model/FieldValues rows
                       {:before-create clear-replaced-advanced-values!
                        :after-create  #(events/publish-event! :event/field-values-create (events/create-event %))}))

(defn- without-unchanged-identity
  "`row` without the `type` and `hash_key` that `stored`, the row it updates, already holds."
  [row stored]
  (cond-> row
    (= (some-> (:type row) keyword) (:type stored)) (dissoc :type)
    (= (:hash_key row) (:hash_key stored))         (dissoc :hash_key)))

(defn- changed-full-values-field-ids
  "The ids of the Fields whose full FieldValues, among the `id->stored` ones, `updates` give other values."
  [updates id->stored]
  (into #{}
        (keep (fn [{:keys [id] :as row}]
                (let [{:keys [type values field_id]} (id->stored id)]
                  (when (and (= :full type) (contains? row :values) (not= values (:values row)))
                    field_id))))
        updates))

(defn- prepare-field-values-updates!
  "The `updates` of the `id->stored` FieldValues that exist, with a keyword `:type`, after deleting the advanced
  FieldValues of the Fields whose full values they change."
  [updates id->stored]
  (let [updates (into []
                      (comp (filter #(contains? id->stored (:id %)))
                            (map #(cond-> % (:type %) (update :type keyword))))
                      updates)]
    (clear-advanced-field-values-for-fields! (changed-full-values-field-ids updates id->stored))
    updates))

(defn- publish-field-values-updates!
  "Publish the update event of `updates` over the `id->stored` FieldValues, without the `type` and `hash_key` their
  stored rows already hold, when there are any."
  [updates id->stored _id->updated]
  (when (seq updates)
    (events/publish-event! :event/field-values-update
                           (events/update-event id->stored
                                                (mapv #(without-unchanged-identity % (id->stored (:id %))) updates)))))

(mu/defn update-field-values! :- :nil
  "Apply `updates`, each the `:id` of a FieldValues and the columns to change, in one transaction, publishing their
  update event, deleting first the advanced FieldValues of the Fields whose full values change."
  [updates :- [:sequential ::warehouse-schema.schema/field-values.update]]
  (mdb/update-batched! :model/FieldValues updates
                       {:before-update prepare-field-values-updates!
                        :after-update  publish-field-values-updates!}))

(defn- insert-unless-concurrent!
  "Insert the FieldValues `row` and return the inserted instance, or nil when a concurrent insert stored it first."
  [row]
  (try
    (warehouse-schema.db/insert-field-values-row! row)
    (catch Exception e
      (when-not (sql-errors/duplicate-key? e)
        (throw e)))))

(mu/defn find-or-create-full-field-values! :- ::warehouse-schema.schema/field-values
  "The full FieldValues of the Field with `field-id`, creating one with `has-more-values`, `values` and no
  human-readable values, which deletes its advanced FieldValues, when it has none."
  [field-id        :- ::lib.schema.id/field
   has-more-values :- :boolean
   values          :- [:maybe ms/FieldValues]]
  (t2/with-transaction [_conn]
    (or (warehouse-schema.db/full-field-values field-id)
        (let [row {:field_id              field-id
                   :type                  :full
                   :has_more_values       has-more-values
                   :values                values
                   :human_readable_values nil}]
          (clear-advanced-field-values-for-fields! [field-id])
          (u/prog1 (or (insert-unless-concurrent! row)
                       (warehouse-schema.db/full-field-values field-id)
                       (warehouse-schema.db/insert-field-values-row! row))
            (events/publish-event! :event/field-values-create (events/create-event [<>])))))))

(defn- update-or-insert-full-field-values!
  "Apply `changes` to the `stored` full FieldValues of the Field with `field-id`, or insert them when there are none,
  deleting its advanced FieldValues first when its values change, returning `{:stored s}` or `{:inserted s}`; a lost
  race re-reads and goes once more, `retried?` then letting a failure through."
  [field-id stored changes retried?]
  (when (or (nil? stored) (not= (:values stored) (:values changes)))
    (clear-advanced-field-values-for-fields! [field-id]))
  (if stored
    (do (warehouse-schema.db/update-field-values! [(assoc changes :id (:id stored))])
        {:stored stored})
    (let [row (assoc changes :field_id field-id :type :full)]
      (if retried?
        {:inserted (warehouse-schema.db/insert-field-values-row! row)}
        (if-let [inserted (insert-unless-concurrent! row)]
          {:inserted inserted}
          (update-or-insert-full-field-values! field-id (warehouse-schema.db/full-field-values field-id) changes true))))))

(mu/defn update-or-create-full-field-values! :- :int
  "Set the values and human-readable values of the full FieldValues of the Field with `field-id`, creating it when it
  has none, and return its id; new values delete the advanced FieldValues of the Field."
  [field-id              :- ::lib.schema.id/field
   values                :- [:maybe ms/FieldValues]
   human-readable-values :- [:maybe ms/FieldValues]]
  (t2/with-transaction [_conn]
    (let [changes                   {:values                values
                                     :human_readable_values human-readable-values}
          {:keys [stored inserted]} (update-or-insert-full-field-values!
                                     field-id (warehouse-schema.db/full-field-values field-id) changes false)]
      (if stored
        (events/publish-event! :event/field-values-update
                               (events/update-event {(:id stored) stored} [(assoc changes :id (:id stored))]))
        (events/publish-event! :event/field-values-create (events/create-event [inserted])))
      (:id (or stored inserted)))))

(mu/defn create-advanced-field-values! :- [:maybe ::warehouse-schema.schema/field-values]
  "Create the advanced FieldValues `row` of a Field and `:hash_key`, which the caller computed after finding none, and
  return it, or the one another thread created meanwhile."
  [{:keys [field_id hash_key] :as row} :- ::warehouse-schema.schema/field-values.create]
  (t2/with-transaction [_conn]
    (or (warehouse-schema.db/advanced-field-values field_id hash_key)
        (let [row (assoc row :type :advanced)]
          (u/prog1 (or (insert-unless-concurrent! row)
                       (warehouse-schema.db/advanced-field-values field_id hash_key)
                       (warehouse-schema.db/insert-field-values-row! row))
            (events/publish-event! :event/field-values-create (events/create-event [<>])))))))

(mu/defn touch-field-values!
  "Stamp `last_used_at` on `field-values`, the FieldValues as the caller read them, so sync keeps them up to date, in
  one statement."
  [field-values :- [:map [:id ms/PositiveInt]]]
  (t2/with-transaction [_conn]
    (u/prog1 (warehouse-schema.db/touch-field-values! (:id field-values))
      (when (pos? <>)
        (events/publish-event! :event/field-values-update
                               (events/update-event {(:id field-values) (t2/instance :model/FieldValues field-values)}
                                                    [{:id (:id field-values) :last_used_at :%now}]))))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/FieldValues [_model]
  {:skip? false})

(defmethod serialization/spec :model/FieldValues [_]
  {:schema        ::warehouse-schema.schema/external-field-values
   :identity      [:field_id :type]
   :copy          [:type :values :human_readable_values :has_more_values :hash_key]
   :skip          [:last_used_at]
   :transform     {:field_id serialization/field-transform}
   :defaults      {:has_more_values false}
   :storage-paths warehouse-schema.serialization/field-values-storage-paths
   :insert!       create-field-values!
   :update!       #(do (update-field-values! %) %)
   :delete!       delete-field-values!
   :rows-by-refs  serialization/field-values-rows-by-refs})
