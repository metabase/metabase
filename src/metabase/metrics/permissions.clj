(ns metabase.metrics.permissions
  "Filters dimensions and dimension-mappings by user permissions at the API boundary.
   Dimensions are persisted system-wide by `sync-dimensions!`, but returned to individual
   users filtered by:
   1. Field visibility_type (hidden/sensitive excluded)
   2. Table-level view-data permissions
   3. Column-level sandbox restrictions (EE, via defenterprise)"
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Batch Lookups -------------------------------------------------

(defn- batch-field-info
  "Batch-fetch field metadata needed for dimension hydration and permission checks.
   Returns {field-id -> {:visibility_type keyword, :table_id int, :dimension_interestingness double?}}."
  [field-ids]
  (when (seq field-ids)
    (into {}
          (map (fn [f] [(:id f) (select-keys f [:visibility_type :table_id :dimension_interestingness])]))
          (t2/select [:model/Field :id :visibility_type :table_id :dimension_interestingness]
                     :id [:in field-ids]))))

(defn- batch-table-db-ids
  "Batch-fetch db_id for a set of table IDs.
   Returns {table-id -> db-id}."
  [table-ids]
  (when (seq table-ids)
    (into {}
          (map (fn [t] [(:id t) (:db_id t)]))
          (t2/select [:model/Table :id :db_id]
                     :id [:in table-ids]))))

;;; ------------------------------------------------- Permission Predicates -------------------------------------------------

(defn- hidden-field?
  "Returns true if the field's visibility_type should be excluded from metric dimensions."
  [visibility-type]
  (contains? #{:hidden :sensitive :retired} visibility-type))

(defn- user-can-access-table?
  "Returns true if the current user has :unrestricted :perms/view-data for the given table."
  [user-id database-id table-id]
  (perms/user-has-permission-for-table? user-id :perms/view-data :unrestricted database-id table-id))

;;; ------------------------------------------------- Sandbox Extension -------------------------------------------------

(defenterprise sandbox-restricted-fields
  "For sandboxed tables, returns {table-id -> #{allowed-field-ids}}.
   Tables not in the returned map have no column restriction. nil means no sandboxes apply.
   OSS stub returns nil (fail open — :model/Sandbox not available in OSS).
   EE override uses :feature :none to fail closed when MetaStore is down."
  metabase-enterprise.sandbox.api.metric
  [_table-ids]
  nil)

;;; ------------------------------------------------- Core Filter -------------------------------------------------

(defn- target->field-id
  "Extract the integer field ID from a dimension mapping target ref.
   Returns nil if the target is not a field ref or uses a name instead of ID."
  [target]
  (when (and (vector? target)
             (= :field (first target))
             (>= (count target) 3))
    (let [id-or-name (nth target 2)]
      (when (pos-int? id-or-name)
        id-or-name))))

(defn- build-dim->field-id
  "Build a map of {dimension-id -> field-id} from dimensions and their mappings."
  [dimensions dimension-mappings]
  (let [mappings-by-dim-id (into {} (map (juxt :dimension-id identity)) dimension-mappings)]
    (into {}
          (keep (fn [dim]
                  (let [field-id (or (some-> dim :sources first :field-id)
                                     (some-> (get mappings-by-dim-id (:id dim))
                                             :target
                                             target->field-id))]
                    (when field-id
                      [(:id dim) field-id]))))
          dimensions)))

(defn- hydrate-dimension-interestingness
  "Attach persisted `:dimension_interestingness` from the source Field when available."
  [dimensions dim->field-id field-info]
  (mapv (fn [dim]
          (if-some [score (get-in field-info [(get dim->field-id (:id dim)) :dimension_interestingness])]
            (assoc dim :dimension_interestingness score)
            dim))
        dimensions))

(defn filter-dimensions-for-user
  "Filter dimensions and dimension_mappings on a metric, removing those the
  current user shouldn't see due to:
   1. Field visibility_type (:hidden or :sensitive)
   2. Table-level view-data permissions
   3. Sandbox column restrictions (EE)

   Superusers bypass all checks. Dimensions without resolvable field IDs are
   kept (conservative fallback)."
  [{:keys [dimensions dimension_mappings] :as metric}]
  (if (empty? dimensions)
    metric
    (let [dim->field-id  (build-dim->field-id dimensions dimension_mappings)
          all-field-ids  (set (vals dim->field-id))
          field-info     (batch-field-info all-field-ids)
          table-ids      (into #{} (keep :table_id) (vals field-info))
          table->db      (batch-table-db-ids table-ids)
          sandbox-map    (sandbox-restricted-fields table-ids)
          allowed?       (fn [dim]
                           (let [fid (get dim->field-id (:id dim))]
                             (if-not fid
                               true ;; can't resolve field -> keep (conservative)
                               (let [{:keys [visibility_type table_id]} (get field-info fid)
                                     db-id (get table->db table_id)]
                                 (and
                                  ;; not hidden/sensitive
                                  (not (hidden-field? visibility_type))
                                  ;; user has table access
                                  (or (nil? db-id)
                                      (user-can-access-table? api/*current-user-id* db-id table_id))
                                  ;; sandbox allows this field
                                  (or (nil? sandbox-map)
                                      (nil? (get sandbox-map table_id))
                                      (contains? (get sandbox-map table_id) fid)))))))
          visible-dimensions (if api/*is-superuser?*
                               dimensions
                               (filterv allowed? dimensions))
          kept-ids           (into #{} (map :id) visible-dimensions)]
      (assoc metric
             :dimensions         (hydrate-dimension-interestingness visible-dimensions dim->field-id field-info)
             :dimension_mappings (filterv #(contains? kept-ids (:dimension-id %)) dimension_mappings)))))
