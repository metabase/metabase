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
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouses.models.database :as database]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Model setup ---------------------------------------------------

(methodical/defmethod t2/table-name :model/Sandbox [_model] :sandboxes)

(doto :model/Sandbox
  (derive :metabase/model)
  ;;; only admins can work with sandboxes
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive :hook/dependencies))

(t2/deftransforms :model/Sandbox
  {:attribute_remappings sandbox.schema/attribute-remappings-transform})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn table-field-names->cols
  "Return a mapping of field names to corresponding cols for given table."
  [table-id]
  (into {} (for [col (request/as-admin
                       (qp.preprocess/query->expected-cols
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
                          {:type          qp.error-type/bad-configuration
                           :status-code   400
                           :message       msg
                           :new-col       col
                           :expected      table-col-base-type
                           :actual        (:base_type col)
                           :response/keys #{:expected :actual}})))))))

(mu/defn check-columns-match-table
  "Make sure the result metadata data columns for the Card associated with a sandbox match up with the columns in the Table
  that's getting sandboxed The base types of the Card columns can derive from the respective base types of the columns in
  the Table itself, but you cannot return an entirely different type. Extra columns in the sandboxing Card are ignored."
  ([{card-id :card_id, table-id :table_id} :- [:or ::sandbox.schema/sandbox ::sandbox.schema/sandbox.update]]
   ;; not all sandboxes have Cards
   (when card-id
     ;; not all Cards have saved result metadata
     (when-let [result-metadata (not-empty (sandbox.db/card-result-metadata card-id))]
       (check-columns-match-table table-id result-metadata))))

  ([table-id :- ::lib.schema.id/table
    result-metadata-columns :- [:maybe ::queries.schema/card.result-metadata]]
   (let [table-cols (table-field-names->cols table-id)]
     (doseq [col   result-metadata-columns
             :let  [table-col (get table-cols (:name col))]
             :when table-col]
       (check-column-types-match col table-col)))))

(defn- normalize-sandbox-attribute-remappings
  "Normalize `:attribute_remappings` on a Sandbox map, if present. `before-insert`/`before-update` hooks see this
  column in whatever raw, not-yet-normalized shape the caller supplied it in."
  [sandbox-like]
  (cond-> sandbox-like
    (contains? sandbox-like :attribute_remappings)
    (update :attribute_remappings sandbox.schema/normalize-attribute-remappings)))

(defn- check-attribute-remappings
  "Throws a 400 unless the `:attribute_remappings` of `sandbox` map user attribute names to field names, field ids, or
  parameter targets."
  [sandbox]
  (when-not (mr/validate ::sandbox.schema/attribute-remappings
                         (:attribute_remappings (normalize-sandbox-attribute-remappings sandbox)))
    (throw (ex-info (tru "Invalid attribute remappings: each user attribute name must map to a field name, a field id, or a parameter target.")
                    {:status-code 400}))))

(defn- card-id->result-metadata
  "The saved result metadata of the Cards of `sandboxes`, by Card id, loaded together."
  [sandboxes]
  (if-let [card-ids (not-empty (into #{} (keep :card_id) sandboxes))]
    (sandbox.db/card-id->result-metadata card-ids)
    {}))

(defn- check-card-columns
  "Throws a 400 unless the saved result columns of the Card of `sandbox`, from `card-id->metadata`, match the columns
  of its Table."
  [{:keys [card_id table_id]} card-id->metadata]
  (when-let [result-metadata (not-empty (get card-id->metadata card_id))]
    (check-columns-match-table table_id result-metadata)))

(defn- remove-native-access!
  "Downgrades the native query access of the group of each of `sandboxes` to the query builder on the Database of its
  Table, where the group has native access to that Table."
  [sandboxes]
  (let [table-id->db-id (sandbox.db/table-id->database-id (into #{} (map :table_id) sandboxes))]
    (doseq [[group-id group-sandboxes] (group-by :group_id sandboxes)
            :let  [tables (select-keys table-id->db-id (map :table_id group-sandboxes))]
            db-id (distinct (for [[table-id value] (perms/table-permissions-for-groups #{group-id} :perms/create-queries tables)
                                  :when (= value :query-builder-and-native)]
                              (get tables table-id)))]
      (perms/set-database-permission! group-id db-id :perms/create-queries :query-builder))))

(mi/define-before-insert :model/Sandbox
  [sandboxes]
  (let [card-id->metadata (card-id->result-metadata sandboxes)]
    (doseq [sandbox sandboxes]
      (check-attribute-remappings sandbox)
      (check-card-columns sandbox card-id->metadata))
    (remove-native-access! sandboxes)
    sandboxes))

(mi/define-before-update :model/Sandbox
  [sandboxes]
  (let [card-id->metadata (card-id->result-metadata (filter (comp seq t2/changes) sandboxes))]
    (doseq [sandbox sandboxes
            :let    [changes (t2/changes sandbox)]]
      (when (contains? changes :table_id)
        (throw (ex-info (tru "You cannot change the table ID of a sandbox once it has been created.")
                        {:id (:id sandbox), :status-code 400})))
      (when (contains? changes :group_id)
        (throw (ex-info (tru "You cannot change the group ID of a sandbox once it has been created.")
                        {:id (:id sandbox), :status-code 400})))
      (when (contains? changes :attribute_remappings)
        (check-attribute-remappings sandbox))
      (when (seq changes)
        (check-card-columns sandbox card-id->metadata)))
    sandboxes))

;;; --------------------------------------------- Sandbox dependency set ---------------------------------------------

(defn- sandbox-dependency-set
  "The sandbox dependency set: every Card, snippet, Segment, and Measure some sandbox's policy reads at any depth, as a
  map of entity kind (`:card`, `:snippet`, `:segment`, `:measure`) to ids. The Cards sandboxes name directly are in
  `:card` alongside everything those Cards read."
  []
  ;; Each Card gets its own walk because the metadata provider is scoped to a single Database, and sandboxing Cards span
  ;; Databases. A possible future optimization: Cards, Segments, and Measures belong to one Database, so a check on one
  ;; of those could walk only the sandboxing Cards on the same Database. Snippets are not tied to a Database, so a
  ;; snippet check would still need every sandboxing Card.
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
              {:status-code 403, :snippet-id id})))

(defn- non-admin-affects-sandboxing?
  "Whether the current user is a non-admin and the `entity-kind` (`:card`, `:snippet`, `:segment`, or `:measure`)
  entity with `id` is in the sandbox dependency set."
  [entity-kind id]
  (boolean (and id
                api/*current-user-id*
                (not api/*is-superuser?*)
                (contains? (get (sandbox-dependency-set) entity-kind) id))))

(defn- check-non-admin-cannot-affect-sandboxing!
  "Throws a 403 if the `entity-kind` (`:card` or `:snippet`) entity with `id` is in the sandbox dependency set and
  the current user is not an admin. Server-side writes (sync, serdes and the like) run with no user
  bound, or as a superuser, and are not subject to the check."
  [entity-kind id]
  (when (non-admin-affects-sandboxing? entity-kind id)
    (throw (sandbox-dependency-error entity-kind id))))

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
  "Refuses a non-admin's update to a Card in the sandbox dependency set when `changes` touches `:dataset_query`,
  `:archived`, or `:result_metadata` (for a Card-backed sandbox, the column allow-list). If the result metadata
  changes, also checks that it does not violate the constraints placed on sandboxes (the Card cannot add fields or
  change types vs. the original Table)."
  :feature :sandboxes
  [{new-result-metadata :result_metadata, card-id :id} changes]
  (when (some #(contains? changes %) [:dataset_query :archived :result_metadata])
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
  or `:archived`."
  :feature :sandboxes
  [{snippet-id :id} changes]
  (when (some #(contains? changes %) [:content :name :archived])
    (check-non-admin-cannot-affect-sandboxing! :snippet snippet-id)))

(defenterprise sandboxes-allow-snippet-update?
  "Whether sandboxing lets the current user apply `changes` to a snippet: only an admin may change the `:content`,
  `:name` or `:archived` of one in the sandbox dependency set."
  :feature :sandboxes
  [{snippet-id :id} changes]
  (not (and (some #(contains? changes %) [:content :name :archived])
            (non-admin-affects-sandboxing? :snippet snippet-id))))

(defenterprise sandboxes-allow-segment-update?
  "Whether sandboxing lets the current user apply `changes` to a Segment: only an admin may change the `:definition`
  or `:archived` of one in the sandbox dependency set."
  :feature :sandboxes
  [{segment-id :id} changes]
  (not (and (some #(contains? changes %) [:definition :archived])
            (non-admin-affects-sandboxing? :segment segment-id))))

(defenterprise sandboxes-allow-measure-update?
  "Whether sandboxing lets the current user apply `changes` to a Measure: only an admin may change the `:definition`
  or `:archived` of one in the sandbox dependency set."
  :feature :sandboxes
  [{measure-id :id} changes]
  (not (and (some #(contains? changes %) [:definition :archived])
            (non-admin-affects-sandboxing? :measure measure-id))))

;;; ----------------------------------------------- Permissions graph ------------------------------------------------

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
         (sandbox.db/sandbox id))
       (sandbox.db/insert-sandbox! sandbox)))))
