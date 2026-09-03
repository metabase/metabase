(ns metabase-enterprise.sandbox.models.sandbox
  "Model definition for sandboxes, aka Group Table Access Policies (old name). A sandbox is used to control access to a
  certain Table for a certain PermissionsGroup. Whenever a member of that group attempts to query the Table in question,
  a Saved Question specified by the GTAP is instead used as the source of the query.

  See documentation in [[metabase.permissions.models.permissions]] for more information about the Metabase permissions
  system."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.sandbox.db :as sandbox.db]
   [metabase-enterprise.sandbox.schema :as sandbox.schema]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.warehouses.models.database :as database]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Sandbox [_model] :sandboxes)

(doto :model/Sandbox
  (derive :metabase/model)
  ;;; only admins can work with sandboxes
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/Sandbox
  {:attribute_remappings sandbox.schema/attribute-remappings-transform})

(defn table-field-names->cols
  "Return a mapping of field names to corresponding cols for given table."
  [table-id]
  (into {} (for [col (request/as-admin
                       ((requiring-resolve 'metabase.query-processor.preprocess/query->expected-cols)
                        {:database (database/table-id->database-id table-id)
                         :type     :query
                         :query    {:source-table table-id}}))]
             [(:name col) col])))

(mu/defn check-column-types-match
  "Assert that the base type of `col`, returned by a GTAP source query, matches the base type of `table-col`, a column
  from the original Table being sandboxed."
  [col       :- [:or
                 ::lib.schema.metadata/column
                 ::qp.schema/result-metadata.column]
   table-col :- [:maybe [:or
                         ::lib.schema.metadata/column
                         ::qp.schema/result-metadata.column]]]
  ;; These errors might get triggered by API endpoints or by the QP (this code is used in the
  ;; `sandboxing` middleware). So include `:type` and `:status-code` information in the ExceptionInfo
  ;; data so it can be passed along if applicable.
  (when-let [table-col-base-type ((some-fn :base-type :base_type) table-col)]
    (let [col-base-type ((some-fn :base-type :base_type) col)]
      (when-not (isa? col-base-type table-col-base-type)
        (let [msg (tru "Sandbox Questions can''t return columns that have different types than the Table they are sandboxing.")]
          (throw (ex-info msg
                          {:type        qp.error-type/bad-configuration
                           :status-code 400
                           :message     msg
                           :new-col     col
                           :expected    table-col-base-type
                           :actual      (:base_type col)})))))))

(defn- merge-sandbox-into-graph
  "Merges a single sandboxing policy into the permissions graph. Adjusts permissions at the database or schema level,
  ensuring table-level permissions are set appropriately."
  [graph group-id table-id db-id schema perm-location sandbox-value]
  (let [db-path (concat [group-id db-id] perm-location)
        db-perm (get-in graph db-path)
        schema-perm (get db-perm schema)
        default-table-perm (cond
                             (keyword? db-perm)     db-perm
                             (keyword? schema-perm) schema-perm)
        ;; If perms were set at the database or schema-level before, we might need to add granular values for all tables
        ;; in the database or schema, so they show correctly in the UI.
        tables (when (or (keyword? db-perm) (keyword? schema-perm))
                 (sandbox.db/tables-of-database db-id (keyword? schema-perm) schema))
        ;; Remove the overarching database or schema permission so that we can add the granular table-level permissions
        graph (cond
                (and tables (keyword? db-perm))
                (m/dissoc-in graph db-path)

                (and tables (keyword? schema-perm))
                (m/dissoc-in graph (concat db-path [(or schema "")]))

                :else
                graph)
        ;; Apply granular permissions to each table
        granular-graph (if tables
                         (reduce (fn [g {:keys [id schema]}]
                                   (assoc-in g (concat db-path [(or schema "") id]) default-table-perm))
                                 graph
                                 tables)
                         graph)]
    ;; Set `:segmented` (aka sandboxed) permissions for the target table
    (assoc-in granular-graph
              (concat db-path [(or schema "") table-id])
              sandbox-value)))

(defenterprise add-sandboxes-to-permissions-graph
  "Augments a provided permissions graph with active sandboxing policies."
  :feature :sandboxes
  [graph & {:keys [group-ids group-id db-id audit?]}]
  (let [sandboxes (sandbox.db/sandboxes-with-table-info group-id group-ids db-id (when-not audit? audit/audit-db-id))]
    ;; Incorporate each sandbox policy into the permissions graph.
    (reduce (fn [acc {:keys [group_id table_id db_id schema]}]
              (merge-sandbox-into-graph acc group_id table_id db_id schema [:view-data] :sandboxed))
            graph
            sandboxes)))

(mu/defn check-columns-match-table
  "Make sure the result metadata data columns for the Card associated with a sandbox match up with the columns in the Table
  that's getting sandboxed The base types of the Card columns can derive from the respective base types of the columns in
  the Table itself, but you cannot return an entirely different type. Extra columns in the sandboxing Card are ignored."
  ([{card-id :card_id, table-id :table_id}]
   ;; not all sandboxes have Cards
   (when card-id
     ;; not all Cards have saved result metadata
     (when-let [result-metadata (not-empty (sandbox.db/card-result-metadata card-id))]
       (check-columns-match-table table-id result-metadata))))

  ([table-id :- ::lib.schema.id/table result-metadata-columns]
   (let [table-cols (table-field-names->cols table-id)]
     (doseq [col   result-metadata-columns
             :let  [table-col (get table-cols (:name col))]
             :when table-col]
       (check-column-types-match col table-col)))))

(defn- sandbox-dependency-set
  "The sandbox dependency set: every Card, snippet, Segment, and Measure some sandbox's policy reads at any depth, as a
  map of entity kind (`:card`, `:snippet`, `:segment`, `:measure`) to ids. The Cards sandboxes name directly are in
  `:card` alongside everything those Cards read."
  []
  (let [cards (sandbox.db/sandboxing-cards)]
    (-> (transduce (keep (fn [{:keys [dataset_query database_id]}]
                           (when (seq dataset_query)
                             (lib/all-referenced-entity-ids-recursive
                              (lib/query (lib-be/application-database-metadata-provider database_id) dataset_query)))))
                   (completing (partial merge-with set/union))
                   {:card (into #{} (map :id) cards), :snippet #{}, :segment #{}, :measure #{}}
                   cards)
        (select-keys [:card :snippet :segment :measure]))))

(defn- sandbox-dependency-error [entity-kind id]
  (case entity-kind
    :card    (ex-info
              (tru "You do not have permissions to modify a question that is used for row and column level security.")
              {:status-code 403, :card-id id})
    :snippet (ex-info
              (tru "You do not have permissions to modify a snippet that is used for row and column level security.")
              {:status-code 403, :snippet-id id})
    :segment (ex-info
              (tru "You do not have permissions to modify a segment that is used for row and column level security.")
              {:status-code 403, :segment-id id})
    :measure (ex-info
              (tru "You do not have permissions to modify a measure that is used for row and column level security.")
              {:status-code 403, :measure-id id})))

(defn- check-non-admin-cannot-affect-sandboxing!
  "Throws a 403 if the `entity-kind` (`:card`, `:snippet`, `:segment`, or `:measure`) entity with `id` is in the sandbox
  dependency set and the current user is not an admin. Server-side writes (sync, serdes and the like) run with no user
  bound, or as a superuser, and are not subject to the check."
  [entity-kind id]
  (when (and id api/*current-user-id* (not api/*is-superuser?*))
    (when (contains? (get (sandbox-dependency-set) entity-kind) id)
      (throw (sandbox-dependency-error entity-kind id)))))

(defn- check-result-metadata-still-matches-sandboxed-tables!
  "Throws if `new-result-metadata` would stop matching the Tables the sandboxes built out of this Card sandbox: the
  Card cannot add fields or change types vs. the original Table."
  [card-id new-result-metadata]
  (when-let [gtaps-using-this-card (not-empty (sandbox.db/sandboxes-using-card card-id))]
    (let [original-result-metadata (sandbox.db/card-result-metadata card-id)]
      (when-not (= original-result-metadata new-result-metadata)
        (doseq [{table-id :table_id} gtaps-using-this-card]
          (try
            (check-columns-match-table table-id new-result-metadata)
            (catch clojure.lang.ExceptionInfo e
              (throw (ex-info (str (tru "Cannot update Card: Card is used for Sandboxing, and updates would violate sandbox rules.")
                                   " "
                                   (.getMessage e))
                              (ex-data e)
                              e)))))))))

(defenterprise pre-update-check-sandbox-constraints
  "If a Card is updated, and its result metadata changes, check that these changes do not violate the constraints placed
  on sandboxes (the Card cannot add fields or change types vs. the original Table)."
  :feature :sandboxes
  [{new-result-metadata :result_metadata, card-id :id} changes]
  (when (some #(contains? changes %) [:dataset_query :archived])
    (check-non-admin-cannot-affect-sandboxing! :card card-id))
  (when (contains? changes :result_metadata)
    (check-result-metadata-still-matches-sandboxed-tables! card-id new-result-metadata)))

(defenterprise pre-delete-check-sandbox-constraints
  "Checks sandbox constraints when a Card a sandbox is built out of is deleted."
  :feature :sandboxes
  [{card-id :id}]
  (check-non-admin-cannot-affect-sandboxing! :card card-id))

(defenterprise pre-update-check-sandbox-constraints-for-snippet
  "Refuses a non-admin's update to a snippet in the sandbox dependency set when `changes` touches `:content`, `:name`,
  or `:archived`.

  `:name` is guarded here and not for Segments or Measures because snippet references resolve by name. A Card's
  `{{snippet: x}}` tags are re-pointed at whichever snippet is currently named `x` whenever its native text's template
  tags are re-extracted ([[metabase.lib.core/extract-template-tags]]), and a snippet's own tags whenever it is saved
  (`add-template-tags` in the snippet model); so renaming a policy snippet and creating an impostor under the old name
  would re-point the policy on its next legitimate save. `[:segment N]` and `[:measure N]` references are id-only.

  Snippet creation is deliberately unguarded: a non-admin can create a snippet under a name a policy tag references,
  which would re-point a dangling or admin-renamed policy tag on its next save; that is out of scope here.
  `:collection_id` moves are not guarded either: the guard is on the entity, not its container."
  :feature :sandboxes
  [{snippet-id :id} changes]
  (when (some #(contains? changes %) [:content :name :archived])
    (check-non-admin-cannot-affect-sandboxing! :snippet snippet-id)))

(defenterprise pre-delete-check-sandbox-constraints-for-snippet
  "Refuses a non-admin's deletion of a snippet in the sandbox dependency set."
  :feature :sandboxes
  [{snippet-id :id}]
  (check-non-admin-cannot-affect-sandboxing! :snippet snippet-id))

(defenterprise pre-update-check-sandbox-constraints-for-segment
  "Refuses a non-admin's update to a Segment in the sandbox dependency set when `changes` touches `:definition` or
  `:archived`."
  :feature :sandboxes
  [{segment-id :id} changes]
  (when (some #(contains? changes %) [:definition :archived])
    (check-non-admin-cannot-affect-sandboxing! :segment segment-id)))

(defenterprise pre-delete-check-sandbox-constraints-for-segment
  "Refuses a non-admin's deletion of a Segment in the sandbox dependency set."
  :feature :sandboxes
  [{segment-id :id}]
  (check-non-admin-cannot-affect-sandboxing! :segment segment-id))

(defenterprise pre-update-check-sandbox-constraints-for-measure
  "Refuses a non-admin's update to a Measure in the sandbox dependency set when `changes` touches `:definition` or
  `:archived`."
  :feature :sandboxes
  [{measure-id :id} changes]
  (when (some #(contains? changes %) [:definition :archived])
    (check-non-admin-cannot-affect-sandboxing! :measure measure-id)))

(defenterprise pre-delete-check-sandbox-constraints-for-measure
  "Refuses a non-admin's deletion of a Measure in the sandbox dependency set."
  :feature :sandboxes
  [{measure-id :id}]
  (check-non-admin-cannot-affect-sandboxing! :measure measure-id))

(defenterprise upsert-sandboxes!
  "Create new `sandboxes` or update existing ones. If a sandbox has an `:id` it will be updated, otherwise it will be
  created. New sandboxes must have a `:table_id` corresponding to a sandboxed query path in the `permissions` table;
  if this does not exist, the sandbox will not be created."
  :feature :sandboxes
  [sandboxes]
  (doall
   (for [sandbox sandboxes]
     (if-let [id (:id sandbox)]
       ;; Only update `card_id` and/or `attribute_remappings` if the values are present in the body of the request.
       ;; This allows existing values to be "cleared" by being set to nil
       (do
         (when (some #(contains? sandbox %) [:card_id :attribute_remappings])
           (sandbox.db/update-sandbox! id (u/select-keys-when sandbox :present #{:card_id :attribute_remappings})))
         (let [updated-sandbox (sandbox.db/sandbox id)]
           (events/publish-event! :event/sandbox-update
                                  {:object updated-sandbox
                                   :user-id api/*current-user-id*})
           updated-sandbox))
       (let [inserted-sandbox (sandbox.db/insert-sandbox! sandbox)]
         (events/publish-event! :event/sandbox-create
                                {:object inserted-sandbox
                                 :user-id api/*current-user-id*})
         inserted-sandbox)))))

(t2/define-before-insert :model/Sandbox
  [{:keys [table_id group_id], :as gtap}]
  (let [db-id (database/table-id->database-id table_id)]
    ;; Remove native query access to the DB when saving a sandbox
    (when (= (perms/table-permission-for-groups #{group_id} :perms/create-queries db-id table_id) :query-builder-and-native)
      (perms/set-database-permission! group_id db-id :perms/create-queries :query-builder)))
  (u/prog1 gtap
    (check-columns-match-table gtap)))

(t2/define-before-update :model/Sandbox
  [{:keys [id], :as updates}]
  (u/prog1 updates
    (let [original (t2/original updates)
          updated  (merge original updates)]
      (when-not (= (:table_id original) (:table_id updated))
        (throw (ex-info (tru "You cannot change the table ID of a sandbox once it has been created.")
                        {:id          id
                         :status-code 400})))
      (when (:card_id updates)
        (check-columns-match-table updated)))))
