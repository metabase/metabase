(ns metabase.models.data-permissions.graph
  "Code involving reading and writing the API-style data permission graph. This is the graph which we use to represent
  permissions when communicating with the frontend, which has different keys and a slightly different structure
  from the one returned by `metabase.models.data-permissions/data-permissions-graph`, which is based directly on the
  keys and values stored in the `data_permissions` table.

  Essentially, this is a translation layer between the graph used by the v1 permissions schema and the v2 permissions
  schema."
  (:require
   [clojure.data :as data]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.permission-graph :as api.permission-graph]
   [metabase.config :as config]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.permissions-revision :as perms-revision]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;; See also: [[data-perms/Permissions]]
(def ^:private ->api-keys
  {:perms/data-access           :data
   :perms/download-results      :download
   :perms/manage-table-metadata :data-model

   :perms/native-query-editing  :native
   :perms/manage-database       :details})

(def ^:private ->api-vals
  {:perms/data-access           {:unrestricted    :all
                                 :no-self-service nil
                                 :block           :block}
   :perms/download-results      {:one-million-rows  :full
                                 :ten-thousand-rows :limited
                                 :no                nil}
   :perms/manage-table-metadata {:yes :all :no nil}
   :perms/native-query-editing  {:yes :write :no nil}
   :perms/manage-database       {:yes :yes :no :no}})

(defenterprise add-impersonations-to-permissions-graph
  "Augment the permissions graph with active connection impersonation policies. OSS implementation returns graph as-is."
  metabase-enterprise.advanced-permissions.models.connection-impersonation
  [graph & [_opts]]
  graph)

(defenterprise add-sandboxes-to-permissions-graph
  "Augment the permissions graph with active connection impersonation policies. OSS implementation returns graph as-is."
  metabase-enterprise.sandbox.models.group-table-access-policy
  [graph & [_opts]]
  graph)

(defn get-dbs-and-groups
  "Given an api permission graph, this returns the groups and db-ids"
  [graph]
  {:group-ids (->> graph :groups keys set)
   :db-ids (->> graph :groups vals (mapcat keys) set)})

(mu/defn ellide? :- :boolean
  "If a table has the least permissive value for a perm type, leave it out,
   Unless it's :data perms, in which case, leave it out only if it's no-self-service"
  [type :- data-perms/PermissionType
   value :- data-perms/PermissionValue]
  (if (= type :perms/data-access)
    ;; for `:perms/data-access`, `:no-self-service` is the default (block  is a 'negative' permission),  so we should ellide
    (= value :no-self-service)
    (= (data-perms/least-permissive-value type) value)))

(defn- rename-or-ellide-kv
  "Renames a kv pair from the data-permissions-graph to an API-style data permissions graph (which we send to the client)."
  [[type value]]
  (when-not (ellide? type value)
    [(->api-keys type) ((->api-vals type) value)]))

(mu/defn ^:private api-table-perms
  "Helper to transform 'leaf' values with table-level schemas in the data permissions graph into an API-style data permissions value.
   Coalesces permissions at the schema level if all table-level permissions within a schema are identical."
  [type :- data-perms/PermissionType
   schema->table-id->api-val]
  (let [transform-val         (fn [perm-val] ((->api-vals type) perm-val))
        coalesce-or-transform (fn [table-id->perm]
                                (let [unique-perms (set (vals table-id->perm))]
                                  (if (= 1 (count unique-perms))
                                    ;; Coalesce to schema-level permission if all table perms are identical
                                    (transform-val (first unique-perms))
                                    ;; Otherwise, transform each table-level permission individually
                                    (into {} (map (fn [[table-id perm-val]]
                                                    [table-id (transform-val perm-val)])
                                                  (filter (fn [[_ perm-val]] (not (ellide? type perm-val)))
                                                          table-id->perm))))))]
    (->> (update-vals schema->table-id->api-val coalesce-or-transform)
         (filter second)
         (into {}))))

(defn- granular-perm-rename [perms perm-key legacy-path]
  (let [perm-value (get perms perm-key)]
    (when perm-value
      (cond
        (map? perm-value)
        (assoc-in {} legacy-path (api-table-perms perm-key perm-value))

        (not (ellide? perm-key perm-value))
        (assoc-in {} legacy-path ((->api-vals perm-key) perm-value))))))

(defn- rename-perm
  "Transforms a 'leaf' value with db-level or table-level perms in the data permissions graph into an API-style data permissions value.
  There's some tricks in here that ellide table-level and table-level permissions values that are the most-permissive setting."
  [perm-map]
  (let [granular-keys [:perms/native-query-editing :perms/data-access
                       :perms/download-results :perms/manage-table-metadata]]
    (m/deep-merge
     (into {} (keep rename-or-ellide-kv (apply dissoc perm-map granular-keys)))
     (granular-perm-rename perm-map :perms/data-access [:data :schemas])
     (granular-perm-rename perm-map :perms/native-query-editing [:data :native])
     (granular-perm-rename perm-map :perms/download-results [:download :schemas])
     (granular-perm-rename perm-map :perms/manage-table-metadata [:data-model :schemas]))))

(defn- rename-perms [graph]
  (update-vals graph
               (fn [db-id->perms]
                 (update-vals db-id->perms rename-perm))))

(def ^:private legacy-admin-perms
   {:data {:native :write, :schemas :all},
    :download {:schemas :full},
    :data-model {:schemas :all},
    :details :yes})

(defn- add-admin-perms-to-permissions-graph
  "These are not stored in the data-permissions table, but the API expects them to be there (for legacy reasons), so here we populate it.
  For every db in the incoming graph, adds on admin permissions."
  [api-graph {:keys [db-id group-id audit?]}]
  (let [admin-group-id (u/the-id (perms-group/admin))
        db-ids         (if db-id [db-id] (t2/select-pks-vec :model/Database
                                                            {:where [:and
                                                                     (when-not audit? [:not= :id config/audit-db-id])]}))]
    (if (and group-id (not= group-id admin-group-id))
      ;; Don't add admin perms when we're fetching the perms for a specific non-admin group
      api-graph
      (reduce (fn [api-graph db-id]
                (assoc-in api-graph [admin-group-id db-id] legacy-admin-perms))
              api-graph
              db-ids))))

(defn remove-empty-vals
  "Recursively walks a nested map from bottom-up, removing keys with nil or empty map values."
  [m]
  (if (map? m)
    (->> m
         (map (fn [[k v]] [k (remove-empty-vals v)]))
         (filter (fn [[_ v]] (not (or (nil? v) (and (map? v) (empty? v))))))
         (into {}))
    m))

(mu/defn api-graph :- api.permission-graph/StrictData
  "Converts the backend representation of the data permissions graph to the representation we send over the API. Mainly
  renames permission types and values from the names stored in the database to the ones expected by the frontend.
  - Converts DB key names to API key names
  - Converts DB value names to API value names
  - Nesting: see [[rename-perms]] to see which keys in `graph` affect which paths in the api permission-graph
  - Adds sandboxed entries, and impersonations to graph"
  ([]
   (api-graph {}))

  ([& {:as opts}
    :- [:map
        [:group-id {:optional true} [:maybe pos-int?]]
        [:db-id {:optional true} [:maybe pos-int?]]
        [:audit? {:optional true} [:maybe :boolean]]
        [:perm-type {:optional true} [:maybe data-perms/PermissionType]]]]
   (let [graph (data-perms/data-permissions-graph opts)]
     {:revision (perms-revision/latest-id)
      :groups (-> graph
                  rename-perms
                  remove-empty-vals
                  (add-sandboxes-to-permissions-graph opts)
                  (add-impersonations-to-permissions-graph opts)
                  (add-admin-perms-to-permissions-graph opts))})))


;;; ---------------------------------------- Updating permissions -----------------------------------------------------

(defenterprise delete-gtaps-if-needed-after-permissions-change!
  "Delete GTAPs (sandboxes) that are no longer needed after the permissions graph is updated. This is EE-specific --
  OSS impl is a no-op, since sandboxes are an EE-only feature."
  metabase-enterprise.sandbox.models.permissions.delete-sandboxes
  [_])

(defenterprise delete-impersonations-if-needed-after-permissions-change!
  "Delete connection impersonation policies that are no longer needed after the permissions graph is updated. This is
  EE-specific -- OSS impl is a no-op, since connection impersonation is an EE-only feature."
  metabase-enterprise.advanced-permissions.models.connection-impersonation
  [_])

(defn ee-permissions-exception
  "Exception to throw when a permissions operation fails due to missing Enterprise Edition code, or missing a valid
   token with the advanced-permissions feature."
  [perm-type]
  (ex-info
    (tru "The {0} permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
         (str/replace (name perm-type) "-" " "))
    {:status-code 402}))

(defn- update-table-level-metadata-permissions!
  [group-id db-id schema new-table-perms]
  (let [new-table-perms
        (-> new-table-perms
            (update-vals (fn [table-perm]
                           (case table-perm
                             :all  :yes
                             :none :no)))
            (update-keys (fn [table-id] {:id table-id :db_id db-id :schema schema})))]
    (data-perms/set-table-permissions! group-id :perms/manage-table-metadata new-table-perms)))

(defn- update-schema-level-metadata-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-metadata-permissions! group-id db-id schema new-schema-perms)
    (let [tables (t2/select :model/Table :db_id db-id :schema (not-empty schema))]
      (when (seq tables)
        (case new-schema-perms
          :all
          (data-perms/set-table-permissions! group-id :perms/manage-table-metadata (zipmap tables (repeat :yes)))

          :none
          (data-perms/set-table-permissions! group-id :perms/manage-table-metadata (zipmap tables (repeat :no))))))))

(defn- update-db-level-metadata-permissions!
  [group-id db-id new-db-perms]
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-metadata-permissions! group-id db-id schema schema-changes))
      (case schemas
        :all
        (data-perms/set-database-permission! group-id db-id :perms/manage-table-metadata :yes)

        :none
        (data-perms/set-database-permission! group-id db-id :perms/manage-table-metadata :no)))))

(defn- update-table-level-download-permissions!
  [group-id db-id schema new-table-perms]
  (let [new-table-perms
        (-> new-table-perms
            (update-vals (fn [table-perm]
                           (case table-perm
                             :full    :one-million-rows
                             :limited :ten-thousand-rows
                             :none    :no)))
            (update-keys (fn [table-id] {:id table-id :db_id db-id :schema schema})))]
    (data-perms/set-table-permissions! group-id :perms/download-results new-table-perms)))

(defn- update-schema-level-download-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-download-permissions! group-id db-id schema new-schema-perms)
    (let [tables (t2/select :model/Table :db_id db-id :schema (not-empty schema))]
      (when (seq tables)
        (case new-schema-perms
          :full
          (data-perms/set-table-permissions! group-id :perms/download-results (zipmap tables (repeat :one-million-rows)))

          :limited
          (data-perms/set-table-permissions! group-id :perms/download-results (zipmap tables (repeat :ten-thousand-rows)))

          :none
          (data-perms/set-table-permissions! group-id :perms/download-results (zipmap tables (repeat :no))))))))

(defn- update-db-level-download-permissions!
  [group-id db-id new-db-perms]
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-download-permissions! group-id db-id schema schema-changes))
      (case schemas
        :full
        (data-perms/set-database-permission! group-id db-id :perms/download-results :one-million-rows)

        :limited
        (data-perms/set-database-permission! group-id db-id :perms/download-results :ten-thousand-rows)

        :none
        (data-perms/set-database-permission! group-id db-id :perms/download-results :no)))))

(defn- update-native-data-access-permissions!
  [group-id db-id new-native-perms]
  (data-perms/set-database-permission! group-id db-id :perms/native-query-editing (case new-native-perms
                                                                                    :write :yes
                                                                                    :none  :no)))

(defn- update-table-level-data-access-permissions!
  [group-id db-id schema new-table-perms]
  (let [new-table-perms
        (-> new-table-perms
            (update-vals (fn [table-perm]
                           (if (map? table-perm)
                             (if (#{:all :segmented} (table-perm :query))
                               ;; `:segmented` indicates that the table is sandboxed, but we should set :perms/data-access
                               ;; permissions to :unrestricted and rely on the `sandboxes` table as the source of truth
                               ;; for sandboxing.
                               :unrestricted
                               :no-self-service)
                             (case table-perm
                               :all  :unrestricted
                               :none :no-self-service))))
            (update-keys (fn [table-id] {:id table-id :db_id db-id :schema schema})))]
    (data-perms/set-table-permissions! group-id :perms/data-access new-table-perms)))

(defn- update-schema-level-data-access-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-data-access-permissions! group-id db-id schema new-schema-perms)
    (let [tables (t2/select :model/Table :db_id db-id :schema (not-empty schema))]
      (when (seq tables)
        (case new-schema-perms
          :all
          (data-perms/set-table-permissions! group-id :perms/data-access (zipmap tables (repeat :unrestricted)))

          :none
          (data-perms/set-table-permissions! group-id :perms/data-access (zipmap tables (repeat :no-self-service))))))))

(defn- update-db-level-data-access-permissions!
  [group-id db-id new-db-perms]
  (when-let [new-native-perms (:native new-db-perms)]
    (update-native-data-access-permissions! group-id db-id new-native-perms))
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-data-access-permissions! group-id db-id schema schema-changes))
      (case schemas
        (:all :impersonated)
        (data-perms/set-database-permission! group-id db-id :perms/data-access :unrestricted)

        :none
        (data-perms/set-database-permission! group-id db-id :perms/data-access :no-self-service)

        :block
        (do
          (when-not (premium-features/has-feature? :advanced-permissions)
            (throw (ee-permissions-exception :block)))
          (data-perms/set-database-permission! group-id db-id :perms/data-access :block))))))

(defn- update-details-perms!
  [group-id db-id value]
  (data-perms/set-database-permission! group-id db-id :perms/manage-database value))

(defn check-audit-db-permissions
  "Check that the changes coming in does not attempt to change audit database permission. Admins should
  change these permissions in application monitoring permissions."
  [changes]
  (let [changes-ids (->> changes
                         vals
                         (map keys)
                         (apply concat))]
    (when (some #{config/audit-db-id} changes-ids)
      (throw (ex-info (tru
                       (str "Audit database permissions can only be changed by updating audit collection permissions."))
                      {:status-code 400})))))

(defn log-permissions-changes
  "Log changes to the permissions graph."
  [old new]
  (log/debug
   (trs "Changing permissions")
   "\n" (trs "FROM:") (u/pprint-to-str 'magenta old)
   "\n" (trs "TO:")   (u/pprint-to-str 'blue    new)))

(defn check-revision-numbers
  "Check that the revision number coming in as part of `new-graph` matches the one from `old-graph`. This way we can
  make sure people don't submit a new graph based on something out of date, which would otherwise stomp over changes
  made in the interim. Return a 409 (Conflict) if the numbers don't match up."
  [old-graph new-graph]
  (when (not= (:revision old-graph) (:revision new-graph))
    (throw (ex-info (tru
                      (str "Looks like someone else edited the permissions and your data is out of date. "
                           "Please fetch new data and try again."))
                    {:status-code 409}))))

(defn save-perms-revision!
  "Save changes made to permission graph for logging/auditing purposes.
  This doesn't do anything if `*current-user-id*` is unset (e.g. for testing or REPL usage).
  *  `model`   -- revision model, should be one of
                  [PermissionsRevision, CollectionPermissionGraphRevision, ApplicationPermissionsRevision]
  *  `before`  -- the graph before the changes
  *  `changes` -- set of changes applied in this revision."
  [model current-revision before changes]
  (when api/*current-user-id*
    (first (t2/insert-returning-instances! model
                                           ;; manually specify ID here so if one was somehow inserted in the meantime in the fraction of a second since we
                                           ;; called `check-revision-numbers` the PK constraint will fail and the transaction will abort
                                           :id      (inc current-revision)
                                           :before  before
                                           :after   changes
                                           :user_id api/*current-user-id*))))

(mu/defn update-data-perms-graph!*
  "Takes an API-style perms graph and sets the permissions in the database accordingly."
  ([graph]
   (doseq [[group-id group-changes] graph]
     (doseq [[db-id db-changes] group-changes
             [perm-type new-perms] db-changes]
       (case perm-type
         :data       (update-db-level-data-access-permissions! group-id db-id new-perms)
         :download   (update-db-level-download-permissions! group-id db-id new-perms)
         :data-model (update-db-level-metadata-permissions! group-id db-id new-perms)
         :details    (update-details-perms! group-id db-id new-perms)))))

  ;; The following arity is provided soley for convenience for tests/REPL usage
  ([ks :- [:vector :any] new-value]
   (update-data-perms-graph!* (assoc-in (-> api-graph :groups) ks new-value))))

(mu/defn update-data-perms-graph!
  "Takes an API-style perms graph and sets the permissions in the database accordingly. Additionally validates the revision number,
   logs the changes, and ensures impersonations and sandboxes are consistent."
  ([new-graph :- api.permission-graph/StrictData]
   (let [old-graph (api-graph)
         [old new] (data/diff (:groups old-graph) (:groups new-graph))
         old       (or old {})
         new       (or new {})]
     (when (or (seq old) (seq new))
       (log-permissions-changes old new)
       (check-revision-numbers old-graph new-graph)
       (check-audit-db-permissions new)
       (t2/with-transaction [_conn]
         (update-data-perms-graph!* new)
         (save-perms-revision! :model/PermissionsRevision (:revision old-graph) old new)
         (delete-impersonations-if-needed-after-permissions-change! new)
         (delete-gtaps-if-needed-after-permissions-change! new)))))

  ;; The following arity is provided soley for convenience for tests/REPL usage
  ([ks :- [:vector :any] new-value]
   (update-data-perms-graph! (assoc-in (api-graph) (cons :groups ks) new-value))))
