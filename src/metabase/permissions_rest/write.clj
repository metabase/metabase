(ns metabase.permissions-rest.write
  "Applying an API-style data permissions graph: the computation of the rows it sets, its checks, its statements, and
  the update a `PUT /api/permissions/graph` makes with its revision row."
  (:require
   [clojure.data :as data]
   [clojure.string :as str]
   [metabase.audit-app.core :as audit]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions-rest.db :as permissions-rest.db]
   [metabase.permissions-rest.schema :as permissions-rest.schema]
   [metabase.permissions.core :as perms]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise delete-gtaps-if-needed-after-permissions-change!
  "Delete GTAPs (sandboxes) that are no longer needed after the permissions graph is updated. This is EE-specific --
  OSS impl is a no-op, since sandboxes are an EE-only feature."
  metabase-enterprise.sandbox.models.permissions.delete-sandboxes
  [_])

(defenterprise delete-impersonations-if-needed-after-permissions-change!
  "Delete connection impersonation policies that are no longer needed after the permissions graph is updated. This is
  EE-specific -- OSS impl is a no-op, since connection impersonation is an EE-only feature."
  metabase-enterprise.impersonation.models
  [_])

(defn ee-permissions-exception
  "Exception to throw when a permissions operation fails due to missing Enterprise Edition code, or missing a valid
   token with the advanced-permissions feature."
  [perm-type]
  (ex-info
   (tru "The {0} permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
        (str/replace (name perm-type) "-" " "))
   {:status-code 402}))

;; Bulk update implementation ====================================================================================
;; Instead of iterating over groups x dbs x perm-types x schemas and making individual DB calls,
;; this implementation:
;; 1. Pre-fetches all tables and current permissions in bulk (2 queries)
;; 2. Uses pure functions to compute the desired state
;; 3. Diffs desired vs current to produce minimal inserts/deletes
;; 4. Applies changes in bulk (2 queries)

(def ^:private api-val->db-val
  {:view-data      {:unrestricted           :unrestricted
                    :impersonated           :unrestricted
                    :sandboxed              :unrestricted
                    :legacy-no-self-service :legacy-no-self-service
                    :blocked                :blocked}
   :create-queries {:query-builder-and-native :query-builder-and-native
                    :query-builder            :query-builder
                    :no                       :no}
   :download       {:full    :one-million-rows
                    :limited :ten-thousand-rows
                    :none    :no}
   :data-model     {:all  :yes
                    :none :no}
   :details        {:yes :yes :no :no}
   :transforms     {:yes :yes :no :no}})

(def ^:private api-key->perm-type
  {:view-data      :perms/view-data
   :create-queries :perms/create-queries
   :download       :perms/download-results
   :data-model     :perms/manage-table-metadata
   :details        :perms/manage-database
   :transforms     :perms/transforms})

(defn- resolve-api-value
  "Translates an API permission value for a single [group-id db-id api-key] into a map of
   {table-id-or-nil {:perm_value v :schema_name s}}. A nil key means db-level."
  [api-key api-value db-id tables-by-db-schema]
  (let [raw-value (if (#{:download :data-model} api-key)
                    (:schemas api-value)
                    api-value)]
    (if (keyword? raw-value)
      {nil {:perm_value  (get-in api-val->db-val [api-key raw-value])
            :schema_name nil}}
      (into {}
            (mapcat
             (fn [[schema-str schema-val]]
               (let [db-schema (not-empty schema-str)]
                 (if (keyword? schema-val)
                   (map (fn [{:keys [id schema]}]
                          [id {:perm_value  (get-in api-val->db-val [api-key schema-val])
                               :schema_name schema}])
                        (get tables-by-db-schema [db-id db-schema]))
                   (map (fn [[table-id table-val]]
                          [table-id {:perm_value  (get-in api-val->db-val [api-key table-val])
                                     :schema_name db-schema}])
                        schema-val)))))
            raw-value))))

(defn- add-implications:db-level
  [desired group-id db-id perm-type db-value]
  (reduce (fn [desired {:keys [applies? implied-type implied-value]}]
            (cond-> desired
              (applies? db-value)
              (update [group-id db-id implied-type]
                      #(merge % {nil {:perm_value implied-value :schema_name nil}}))))
          desired
          (perms/permission-implications perm-type false)))

(defn- add-implications:table-level
  [desired group-id db-id perm-type table-entries]
  (reduce (fn [desired {:keys [applies? implied-type implied-value database-wide?]}]
            (cond
              (not database-wide?)
              (update desired [group-id db-id implied-type]
                      #(merge %
                              (into {}
                                    (keep (fn [[tid {:keys [perm_value schema_name]}]]
                                            (when (applies? perm_value)
                                              [tid {:perm_value implied-value :schema_name schema_name}])))
                                    table-entries)))

              (some (comp applies? :perm_value) (vals table-entries))
              (update desired [group-id db-id implied-type]
                      #(merge % {nil {:perm_value implied-value :schema_name nil}}))

              :else
              desired))
          desired
          (perms/permission-implications perm-type true)))

(defn- add-implications
  "Given a desired-state map and entries just added for a perm-type, merges in implied permission changes.
   Implications from later-processed perm-types override earlier values."
  [desired group-id db-id perm-type entries]
  (let [has-db-level? (contains? entries nil)
        db-value      (get-in entries [nil :perm_value])
        table-entries (dissoc entries nil)]
    (cond
      has-db-level?          (add-implications:db-level desired group-id db-id perm-type db-value)
      (empty? table-entries) desired
      :else                  (add-implications:table-level desired group-id db-id perm-type table-entries))))

(defn- compute-desired-state
  "Process the API graph changes in dependency order, producing a desired-state map of
   {[group-id db-id perm-type] {table-id-or-nil {:perm_value v :schema_name s}}}."
  [graph tables-by-db-schema]
  (reduce
   (fn [desired [group-id db-id api-key api-value]]
     (let [perm-type (api-key->perm-type api-key)
           entries   (resolve-api-value api-key api-value db-id tables-by-db-schema)]
       (-> desired
           (update [group-id db-id perm-type] #(merge % entries))
           (add-implications group-id db-id perm-type entries))))
   {}
   (for [[group-id group-changes] graph
         [db-id db-changes] group-changes
         api-key [:details :data-model :download :transforms :create-queries :view-data]
         :let [api-value (get db-changes api-key)]
         :when api-value]
     [group-id db-id api-key api-value])))

(defn- expand-to-table-level
  "Expands a db-level permission value to table-level entries for all tables in the db.
   :query-builder-and-native becomes :query-builder per table since it can only be db-level."
  [perm-value all-tables]
  (let [table-value (perms/table-level-value perm-value)]
    (into {}
          (map (fn [{:keys [id schema]}]
                 [id {:perm_value table-value :schema_name schema}]))
          all-tables)))

(defn- table-permissions-map [current-rows]
  (into {}
        (keep (fn [{:keys [table_id perm_value schema_name] :as _row}]
                (when table_id
                  [table_id
                   {:perm_value  perm_value
                    :schema_name schema_name}])))
        current-rows))

(defn- perms->base-state [current-rows current-db-row all-tables]
  (if current-db-row
    (expand-to-table-level (:perm_value current-db-row) all-tables)
    (table-permissions-map current-rows)))

(defn- finalize-tuple
  "For a single [group-id db-id perm-type], compute the final desired DataPermissions rows.
   Merges desired entries with current state for unmentioned tables, then coalesces if possible.

   Coalescing rules (matching legacy behavior):
   - Explicit db-level desired (nil key, no table overrides) → always db-level
   - Mixed (db-level default + table overrides) where all values same → coalesce to db-level
   - Table-level desired, current was db-level, all values match current → keep db-level (no-op)
   - Otherwise → table-level rows"
  [group-id db-id perm-type desired-entries current-rows all-tables]
  (let [has-db-level?  (contains? desired-entries nil)
        table-entries  (dissoc desired-entries nil)]
    (if (and has-db-level? (empty? table-entries))
      [{:perm_type   perm-type
        :group_id    group-id
        :perm_value  (:perm_value (desired-entries nil))
        :db_id       db-id}]
      (let [current-db-row (first (filter #(nil? (:table_id %)) current-rows))
            base-state     (if has-db-level?
                             (expand-to-table-level (:perm_value (desired-entries nil)) all-tables)
                             (perms->base-state current-rows current-db-row all-tables))
            final-state    (merge base-state table-entries)
            values         (into #{} (map :perm_value) (vals final-state))
            all-same?      (and (= 1 (count values))
                                (seq all-tables)
                                (= (count final-state) (count all-tables)))
            coalesce?      (and all-same?
                                (or has-db-level?
                                    (and current-db-row
                                         (= (first values) (:perm_value current-db-row)))))]
        (if coalesce?
          [{:perm_type   perm-type
            :group_id    group-id
            :perm_value  (first values)
            :db_id       db-id}]
          (mapv (fn [[table-id {:keys [perm_value schema_name]}]]
                  {:perm_type   perm-type
                   :group_id    group-id
                   :perm_value  perm_value
                   :db_id       db-id
                   :table_id    table-id
                   :schema_name schema_name})
                final-state))))))

(def ^:private row-signature
  (juxt :perm_type :perm_value :table_id :schema_name))

(defn- rows-match?
  "Check if the current rows already represent the desired state (no changes needed)."
  [current-rows desired-rows]
  (= (into #{} (map row-signature) current-rows)
     (into #{} (map row-signature) desired-rows)))

(defn- compute-diff
  "Given the desired state, current permissions index, and tables-by-db,
   returns {:to-delete [id ...] :to-insert [row-map ...]}."
  [desired-state current-perms-index tables-by-db]
  (reduce-kv
   (fn [acc [group-id db-id perm-type] desired-entries]
     (let [current-rows (get current-perms-index [group-id db-id perm-type] [])
           all-tables   (get tables-by-db db-id [])
           desired-rows (finalize-tuple group-id db-id perm-type desired-entries current-rows all-tables)]
       (if (rows-match? current-rows desired-rows)
         acc
         (-> acc
             (update :to-delete into (keep :id) current-rows)
             (update :to-insert into desired-rows)))))
   {:to-delete [] :to-insert []}
   desired-state))

(defn- validate-blocked-permissions!
  [graph]
  (doseq [[_group-id group-changes] graph
          [_db-id db-changes] group-changes]
    (when (= (:view-data db-changes) :blocked)
      (when-not (premium-features/has-feature? :advanced-permissions)
        (throw (ee-permissions-exception :blocked))))))

(defn- check-data-analyst-locked-permissions
  "Check that we're not modifying data-model permission for the Data Analysts group.
   Data Analysts always have full data-model (manage-table-metadata) permissions."
  [group-updates]
  (let [data-analyst-group-id (u/the-id (perms/data-analyst-group))]
    (when-let [da-updates (get group-updates data-analyst-group-id)]
      (doseq [[_db-id db-changes] da-updates]
        (when (and (contains? db-changes :data-model)
                   (not= (:data-model db-changes) (:data-model data-perms.graph/data-analyst-perms)))
          (throw (ex-info (tru "You cannot modify the data model permission for the ''{0}'' group."
                               (:name (perms/data-analyst-group)))
                          {:status-code 400})))))))

(defn- check-transforms-permissions!
  [graph current-perms]
  (doseq [[group-id db-updates] graph
          [db-id db-changes] db-updates
          :when (= (:transforms db-changes) :yes)]
    (let [create-queries (if (contains? db-changes :create-queries)
                           (:create-queries db-changes)
                           (some (fn [{:keys [table_id perm_value]}]
                                   (when (nil? table_id) perm_value))
                                 (get current-perms [group-id db-id :perms/create-queries])))]
      (when (not= create-queries :query-builder-and-native)
        (throw (ex-info (tru "Transforms permission requires \"Query builder and native\" data access for the database.")
                        {:status-code 400}))))))

(defenterprise check-native-access-without-sandboxes!
  "Throw a 400 if a group in `native-group-db-ids`, a set of `[group-id db-id]` pairs being granted native query
  access, would also have a sandbox on that database once `graph` is applied. OSS impl is a no-op, since sandboxes are
  an EE-only feature."
  metabase-enterprise.sandbox.models.permissions.delete-sandboxes
  [_graph _native-group-db-ids])

(defn- check-native-access-compatible-with-sandboxes!
  "Native queries bypass sandboxing, so a group can't be granted native access to a database it has a sandbox on.
  Sandboxing a Table for a group that already has native access is fine: creating the sandbox revokes it."
  [graph]
  (check-native-access-without-sandboxes!
   graph
   (into #{}
         (for [[group-id db-updates] graph
               [db-id db-changes]    db-updates
               :when                 (= :query-builder-and-native (:create-queries db-changes))]
           [group-id db-id]))))

(defn check-audit-db-permissions
  "Check that the changes coming in does not attempt to change audit database permission. Admins should
  change these permissions implicitly via collection permissions."
  [group-updates]
  (let [changes-ids (->> group-updates
                         vals
                         (map keys)
                         (apply concat))]
    (when (some #{audit/audit-db-id} changes-ids)
      (throw (ex-info (tru "Audit database permissions can only be changed by updating audit collection permissions.")
                      {:status-code 400})))))

(mu/defn update-data-perms-graph!*
  "Takes an API-style perms graph and sets the permissions in the database accordingly.
   Uses bulk operations to minimize database round-trips."
  ([graph :- [:map-of
              ::permissions-rest.schema/group-id
              [:maybe [:map-of ::permissions-rest.schema/id ::permissions-rest.schema/db-perms]]]]
   (let [affected-group-ids  (keys graph)
         affected-db-ids     (into #{} (mapcat keys) (vals graph))
         all-tables          (when (seq affected-db-ids)
                               (permissions-rest.db/tables-for-databases affected-db-ids))
         tables-by-db-schema (group-by (juxt :db_id :schema) all-tables)
         tables-by-db        (group-by :db_id all-tables)
         current-perms       (or (perms/index-database-permissions affected-group-ids affected-db-ids) {})
         desired-state       (compute-desired-state graph tables-by-db-schema)
         {:keys [to-delete to-insert]} (compute-diff desired-state current-perms tables-by-db)]
     (validate-blocked-permissions! graph)
     (check-transforms-permissions! graph current-perms)
     (check-native-access-compatible-with-sandboxes! graph)
     (when (seq to-delete)
       (perms/batch-delete-permissions! to-delete))
     (when (seq to-insert)
       (perms/batch-insert-permissions! to-insert))))

  ;; The following arity is provided solely for convenience for tests/REPL usage
  ([ks        :- [:vector [:or :int :string :keyword]]
    new-value :- [:or
                  ::permissions.schema/data-permission-value
                  [:map-of ::permissions.schema/data-permission-type ::permissions.schema/data-permission-value]
                  [:ref ::permissions-rest.schema/schemas]
                  [:ref ::permissions-rest.schema/db-perms]]]
   (-> (data-perms.graph/api-graph)
       :groups
       (assoc-in ks new-value)
       update-data-perms-graph!*)))

(mu/defn update-data-perms-graph!
  "Takes an API-style perms graph and sets the permissions in the database accordingly. Additionally ensures
  impersonations and sandboxes are consistent if necessary."
  ([graph-updates :- ::permissions-rest.schema/data-permissions-graph]
   (when (seq graph-updates)
     (perms/with-global-permissions-lock
       (let [group-updates (:groups graph-updates)]
         (check-data-analyst-locked-permissions group-updates)
         (check-audit-db-permissions group-updates)
         (update-data-perms-graph!* group-updates)
         (delete-impersonations-if-needed-after-permissions-change! group-updates)
         (delete-gtaps-if-needed-after-permissions-change! group-updates)))))

  ;; The following arity is provided solely for convenience for tests/REPL usage
  ([ks        :- [:vector [:or :int :string :keyword]]
    new-value :- [:or
                  ::permissions.schema/data-permission-value
                  [:map-of ::permissions.schema/data-permission-type ::permissions.schema/data-permission-value]
                  [:ref ::permissions-rest.schema/schemas]
                  [:ref ::permissions-rest.schema/db-perms]]]
   (-> (data-perms.graph/api-graph)
       (assoc-in (cons :groups ks) new-value)
       update-data-perms-graph!)))

(defenterprise upsert-sandboxes!
  "OSS implementation of `upsert-sandboxes!`. Errors since this is an enterprise feature."
  metabase-enterprise.sandbox.models.sandbox
  [_sandboxes]
  (throw (premium-features/ee-feature-error (tru "Sandboxes"))))

(defenterprise insert-impersonations!
  "OSS implementation of `insert-impersonations!`. Errors since this is an enterprise feature."
  metabase-enterprise.impersonation.models
  [_impersonations]
  (throw (premium-features/ee-feature-error (tru "Connection impersonation"))))

(mu/defn update-graph! :- [:map {:closed true}
                           [:sandboxes      [:maybe [:sequential [:maybe :map]]]]
                           [:impersonations [:maybe [:sequential [:maybe :map]]]]]
  "Apply `new-graph`, a graph update request, and the sandboxes and impersonations it carries, in one transaction with
  its PermissionsRevision row, checking its revision number unless `force?`; returns the sandboxes and impersonations
  written."
  [new-graph :- ::permissions-rest.schema/graph-update-request
   force?    :- [:maybe :boolean]]
  (t2/with-transaction [_conn]
    (let [group-ids (-> new-graph :groups keys)
          old-graph (data-perms.graph/api-graph {:group-ids group-ids})
          [old new] (data/diff (:groups old-graph)
                               (:groups new-graph))
          old       (or old {})
          new       (or new {})]
      (perms/log-permissions-changes old new)
      (when-not force? (perms/check-revision-numbers old-graph new-graph))
      (update-data-perms-graph! {:groups new})
      (perms/save-perms-revision! :model/PermissionsRevision (:revision old-graph) old new)
      (let [sandbox-updates       (:sandboxes new-graph)
            sandboxes             (when sandbox-updates
                                    (upsert-sandboxes! sandbox-updates))
            impersonation-updates (:impersonations new-graph)
            impersonations        (when impersonation-updates
                                    (insert-impersonations! impersonation-updates))]
        {:sandboxes      sandboxes
         :impersonations impersonations}))))
