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
   [metabase-enterprise.sandbox.dependencies :as sandbox.dependencies]
   [metabase-enterprise.sandbox.schema :as sandbox.schema]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
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
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Definition ---------------------------------------------------

(methodical/defmethod t2/table-name :model/Sandbox [_model] :sandboxes)

(doto :model/Sandbox
  (derive :metabase/model)
  ;;; only admins can work with sandboxes
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive :hook/worktree-id))

(t2/deftransforms :model/Sandbox
  {:attribute_remappings sandbox.schema/attribute-remappings-transform})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn table-field-names->cols
  "Return a mapping of field names to corresponding cols for the table with `table-id` of the database with
  `database-id`."
  [database-id table-id]
  (into {} (for [col (request/as-admin
                       (qp.preprocess/query->expected-cols
                        {:database database-id
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

(mu/defn- check-columns-match-table-of-database
  "Throws a 400 when a column of `result-metadata-columns` has a base type that does not derive from that of the
  same-named column of the Table with `table-id` of the Database with `database-id`, ignoring columns the Table lacks."
  [database-id             :- [:maybe ::lib.schema.id/database]
   table-id                :- ::lib.schema.id/table
   result-metadata-columns :- [:maybe ::queries.schema/card.result-metadata]]
  (let [table-cols (table-field-names->cols database-id table-id)]
    (doseq [col   result-metadata-columns
            :let  [table-col (get table-cols (:name col))]
            :when table-col]
      (check-column-types-match col table-col))))

(defn- columns-check-inputs
  "The result metadata of the Cards and the Database ids of the Tables of those of the sandbox `rows` that have a Card,
  as `[card-id->result-metadata table-id->database-id]`, each read once."
  [rows]
  (if-let [rows (not-empty (filterv :card_id rows))]
    [(sandbox.db/cards-result-metadata (mapv :card_id rows))
     (sandbox.db/table-database-ids (mapv :table_id rows))]
    [{} {}]))

(defn- check-sandbox-columns
  "Throws a 400 when the Card of the sandbox `row` returns columns whose types differ from those of its Table, given the
  inputs [[columns-check-inputs]] read."
  [[card-id->result-metadata table-id->database-id] {card-id :card_id, table-id :table_id}]
  (when card-id
    (when-let [result-metadata (not-empty (card-id->result-metadata card-id))]
      (check-columns-match-table-of-database (table-id->database-id table-id) table-id result-metadata))))

(mu/defn check-columns-match-table
  "Make sure the result metadata data columns for the Card associated with the `sandbox` match up with the columns in
  the Table that's getting sandboxed."
  [sandbox :- [:map
               [:card_id {:optional true} [:maybe ::lib.schema.id/card]]
               [:table_id ::lib.schema.id/table]]]
  (check-sandbox-columns (columns-check-inputs [sandbox]) sandbox))

(t2/define-before-update :model/Sandbox
  [sandbox]
  (let [changes (t2/changes sandbox)]
    (when (contains? changes :table_id)
      (throw (ex-info (tru "You cannot change the table of a sandbox.")
                      {:id (:id sandbox), :status-code 400})))
    (when (contains? changes :group_id)
      (throw (ex-info (tru "You cannot change the group of a sandbox.")
                      {:id (:id sandbox), :status-code 400})))
    sandbox))

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

(defn- non-admin-affects-sandboxing-with-any?
  "Whether the current user is a non-admin and one of the `entity-kind` (`:card`, `:snippet`, `:segment`, or `:measure`)
  entities with `ids` is in the sandbox dependency set, which is computed once for all of them."
  [entity-kind ids]
  (boolean (and (seq ids)
                api/*current-user-id*
                (not api/*is-superuser?*)
                (some (get (sandbox-dependency-set) entity-kind) ids))))

(defn- non-admin-affects-sandboxing?
  "Whether the current user is a non-admin and the `entity-kind` entity with `id` is in the sandbox dependency set."
  [entity-kind id]
  (non-admin-affects-sandboxing-with-any? entity-kind (when id [id])))

(defenterprise pre-update-check-sandboxes-constraints
  "Throws when a change of the result metadata of any of `card-changes`, `[stored-card changes]` pairs, gives a Card
  result metadata that no longer matches the Tables of the sandboxes that use it, with the sandboxes and their Tables
  read together."
  :feature :sandboxes
  [card-changes]
  (let [checked               (filterv (fn [[_ changes]] (contains? changes :result_metadata)) card-changes)
        id->sandboxes         (sandbox.db/sandboxes-using-cards (mapv (comp :id first) checked))
        table-ids             (into [] (comp cat (map :table_id)) (vals id->sandboxes))
        table-id->database-id (if (seq table-ids) (sandbox.db/table-database-ids table-ids) {})]
    (doseq [[{card-id :id original-result-metadata :result_metadata} {new-result-metadata :result_metadata}] checked
            :let [gtaps-using-this-card (not-empty (get id->sandboxes card-id))]
            :when gtaps-using-this-card
            :when (not= original-result-metadata new-result-metadata)
            {table-id :table_id} gtaps-using-this-card]
      (try
        (check-columns-match-table-of-database (table-id->database-id table-id) table-id new-result-metadata)
        (catch clojure.lang.ExceptionInfo e
          (throw (ex-info (str (tru "Cannot update Card: Card is used for Sandboxing, and updates would violate sandbox rules.")
                               " "
                               (.getMessage e))
                          (ex-data e)
                          e)))))))

(defenterprise sandboxes-allow-result-metadata-write?
  "Whether sandboxing lets the current user store result metadata for the Card with `card-id`: only an admin may for one
  in the sandbox dependency set."
  :feature :sandboxes
  [card-id]
  (not (non-admin-affects-sandboxing? :card card-id)))

(defenterprise sandboxes-allow-card-update?
  "Whether sandboxing lets the current user apply `changes`, the `:dataset_query`, `:archived` or `:result_metadata` of
  a Card that really change, to a Card: only an admin may change them on one in the sandbox dependency set."
  :feature :sandboxes
  [{card-id :id} changes]
  (not (and (some #(contains? changes %) [:dataset_query :archived :result_metadata])
            (non-admin-affects-sandboxing? :card card-id))))

(defenterprise sandboxes-allow-cards-update?
  "Whether sandboxing lets the current user change the `:dataset_query`, `:archived` or `:result_metadata` of every one
  of `cards`: only an admin may when one of them is in the sandbox dependency set."
  :feature :sandboxes
  [cards]
  (not (non-admin-affects-sandboxing-with-any? :card (keep :id cards))))

(defenterprise sandboxes-allow-card-delete?
  "Whether sandboxing lets the current user delete a Card: only an admin may delete one in the sandbox dependency set."
  :feature :sandboxes
  [{card-id :id}]
  (not (non-admin-affects-sandboxing? :card card-id)))

(defenterprise sandboxes-allow-snippet-update?
  "Whether sandboxing lets the current user apply `changes` to a snippet: only an admin may change the `:content`,
  `:name` or `:archived` of one in the sandbox dependency set."
  :feature :sandboxes
  [{snippet-id :id} changes]
  (not (and (some #(contains? changes %) [:content :name :archived])
            (non-admin-affects-sandboxing? :snippet snippet-id))))

(defenterprise sandboxes-allow-snippets-update?
  "Whether sandboxing lets the current user apply `changes` to every one of `snippets`: only an admin may change the
  `:content`, `:name` or `:archived` of one in the sandbox dependency set."
  :feature :sandboxes
  [snippets changes]
  (not (and (some #(contains? changes %) [:content :name :archived])
            (non-admin-affects-sandboxing-with-any? :snippet (keep :id snippets)))))

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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-new-sandboxes
  "Throws a 400 unless every row of `rows` satisfies these rules, with the refusal of the first row that breaks one:

  - its Card's columns match its Table"
  [rows]
  (let [inputs (columns-check-inputs rows)]
    (run! #(check-sandbox-columns inputs %) rows)))

(defn- remove-native-access-of-groups!
  "Take native query access away from the group of each of `rows` on the Database of its Table where it has it, and
  return the rows, with the Databases and permissions of all rows read once and written together."
  [rows]
  (when-let [pairs (not-empty (into [] (comp (map (juxt :group_id :table_id)) (distinct)) rows))]
    (let [table-id->db-id (sandbox.db/table-database-ids (mapv second pairs))
          pairs           (filterv (comp table-id->db-id second) pairs)
          pair->value     (perms/group-table-permissions pairs :perms/create-queries table-id->db-id)]
      (perms/set-database-permissions! (into []
                                             (comp (filter #(= :query-builder-and-native (pair->value %)))
                                                   (map (fn [[group-id table-id]] [group-id (table-id->db-id table-id)])))
                                             pairs)
                                       :perms/create-queries
                                       :query-builder)))
  rows)

(mu/defn create-sandboxes! :- [:sequential ::sandbox.schema/sandbox]
  "Insert the Sandbox `rows` in one transaction and return them in order, publishing their create event; a Card whose
  columns do not match the Table is a 400, and the group loses native query access to the Database of the Table where
  it has it."
  [rows :- [:sequential ::sandbox.schema/sandbox.create]]
  (mdb/create-batched! :model/Sandbox rows
                       {:before-create (fn [rows]
                                         (check-new-sandboxes rows)
                                         (remove-native-access-of-groups! rows))
                        :after-create  #(events/publish-event! :event/sandbox-create (events/create-event %))}))

(defn- check-sandbox-updates
  "Throws a 400 unless every row of `updates` whose Sandbox `id->stored` holds satisfies these rules, with the refusal
  of the first row that breaks one, in this order for each:

  - a new Card's columns match the Table of the Sandbox
  - the Sandbox keeps its Table and its group"
  [updates id->stored]
  (let [card-changed? (fn [{id :id :as row}]
                        (when-let [before (id->stored id)]
                          (and (contains? row :card_id) (not= (:card_id row) (:card_id before)))))
        inputs        (columns-check-inputs (for [{id :id :as row} updates
                                                  :when (card-changed? row)]
                                              (merge (id->stored id) (dissoc row :id))))]
    (doseq [{id :id :as row} updates
            :let [before  (id->stored id)
                  changes (dissoc row :id)]
            :when before]
      (when (card-changed? row)
        (check-sandbox-columns inputs (merge before changes)))
      (t2.before-update/before-update :model/Sandbox (merge before changes)))))

(mu/defn update-sandboxes! :- :nil
  "Apply `updates`, each the id of a Sandbox and the columns to set, in one transaction, publishing their update event;
  a new Card whose columns do not match the Table is a 400, the refusal of the first refused row being the one thrown."
  [updates :- [:sequential ::sandbox.schema/sandbox.update]]
  (mdb/update-batched! :model/Sandbox updates
                       {:before-update check-sandbox-updates
                        :reread?       true
                        :after-update  (fn [updates id->stored id->updated]
                                         (events/publish-event! :event/sandbox-update
                                                                (events/update-event id->stored updates {:objects id->updated})))}))

(mu/defn delete-sandboxes! :- :nil
  "Delete the Sandboxes with `sandbox-ids` in one transaction, publishing their delete event."
  [sandbox-ids :- [:sequential ::lib.schema.id/sandbox]]
  (mdb/delete-batched! :model/Sandbox sandbox-ids
                       {:before-delete #(events/publish-event! :event/sandbox-delete (events/delete-event %))}))

(defn- graph-sandbox-change
  "The update row of `sandbox`, a sandbox of a permissions graph with an `:id`, when it holds a `:card_id` or
  `:attribute_remappings` to set, else nil; a present key with a nil value clears that column."
  [sandbox]
  (when (some #(contains? sandbox %) [:card_id :attribute_remappings])
    (assoc (u/select-keys-when sandbox :present #{:card_id :attribute_remappings}) :id (:id sandbox))))

(defn- in-input-order
  "The stored Sandboxes `id->sandbox` of the `sandboxes` with an `:id` and the `created` ones of those without, in the
  order of `sandboxes`."
  [sandboxes id->sandbox created]
  (first
   (reduce (fn [[results created] sandbox]
             (if-let [id (:id sandbox)]
               [(conj results (id->sandbox id)) created]
               [(conj results (first created)) (rest created)]))
           [[] created]
           sandboxes)))

(defenterprise upsert-sandboxes-for-graph!
  "Create new `sandboxes` or update existing ones, returning each as stored, in order. If a sandbox has an `:id` it will
  be updated, otherwise it will be created. New sandboxes must have a `:table_id` corresponding to a sandboxed query
  path in the `permissions` table; if this does not exist, the sandbox will not be created."
  :feature :sandboxes
  [sandboxes]
  (let [existing-ids (into [] (keep :id) sandboxes)]
    (update-sandboxes! (into [] (keep graph-sandbox-change) (filter :id sandboxes)))
    (let [created     (create-sandboxes! (filterv (complement :id) sandboxes))
          id->sandbox (if (seq existing-ids) (sandbox.db/sandboxes-by-ids existing-ids) {})]
      (in-input-order sandboxes id->sandbox created))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Sandbox [_model]
  {:skip?    false
   :sequence "group_table_access_policy_id_seq"})

(defmethod dependencies/spec :model/Sandbox [_model]
  {:type  :sandbox
   :items sandbox.db/dependency-sandbox-items

   :dependencies sandbox.dependencies/dependencies

   :dependency-columns #{:card_id}})
