(ns metabase-enterprise.serialization.metadata
  "Reducible queries and row formatters that produce serdes-portable warehouse metadata
  (databases, tables, and fields) for the `/api/ee/serialization/metadata/export` endpoint.
  All references — database, table, fk_target_field — are emitted as portable references
  (names rather than numeric IDs) so the response can be ingested by another Metabase
  instance with different surrogate keys."
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- perm-user-info
  "Current-user info passed to `perms/visible-*-filter-select` to scope the visibility filters."
  []
  {:user-id       api/*current-user-id*
   :is-superuser? api/*is-superuser?*})

(defn- perm-mapping
  "Permission mapping required to include a database/table in the export."
  []
  {:perms/view-data      :unrestricted
   :perms/create-queries :query-builder})

(defn- visible-db-where
  "Honeysql predicate selecting non-audit, non-router databases visible to the current user.
  `d` is the table alias of the joined `metabase_database`."
  [d]
  [:and
   [:= (u/qualified-key d :is_audit) false]
   [:= (u/qualified-key d :router_database_id) nil]
   [:in (u/qualified-key d :id) (perms/visible-database-filter-select (perm-user-info) (perm-mapping))]])

(defn- visible-table-where
  "Honeysql predicate selecting active, non-hidden tables visible to the current user.
  `t` is the table alias of the joined `metabase_table`."
  [t]
  [:and
   [:= (u/qualified-key t :active) true]
   [:= (u/qualified-key t :visibility_type) nil]
   [:in (u/qualified-key t :id) (perms/visible-table-filter-select :id (perm-user-info) (perm-mapping))]])

(defn- visible-field-where
  "Honeysql predicate selecting active, non-sensitive fields. `f` is the table alias of the
  joined `metabase_field`."
  [f]
  [:and
   [:= (u/qualified-key f :active) true]
   [:<> (u/qualified-key f :visibility_type) "sensitive"]])

(defn- reducible-databases-query
  "Raw reducible-query streaming visible-database rows for [[reducible-databases]]."
  []
  (t2/reducible-query {:select [[:db.name :name] [:db.engine :engine]]
                       :from   [[:metabase_database :db]]
                       :where  (visible-db-where :db)}))

(defn- reducible-tables-query
  "Raw reducible-query streaming visible-table rows for [[reducible-tables]]."
  []
  (t2/reducible-query {:select [[:db.name :db_name]
                                [:table.schema :schema]
                                [:table.name :table_name]
                                [:table.description :description]]
                       :from   [[:metabase_table :table]]
                       :join   [[:metabase_database :db] [:= :table.db_id :db.id]]
                       :where  [:and (visible-db-where :db) (visible-table-where :table)]}))

(defn- reducible-fields-query
  "Raw reducible-query streaming visible-field rows for [[reducible-fields]]. Visibility
  filters on the FK target chain are folded into the LEFT JOIN ON clauses (rather than the
  WHERE) so that an inaccessible target fails the join and the `fk_*` columns come back as
  NULL — [[format-field-row]] then drops the `:fk_target_field_id` for that row.

  `:parent_id_int` and `:fk_parent_id_int` are pulled (as the raw integer storage column
  values, not for emission) so [[format-field-row]] can decide convention-aware `:id`
  construction and `:parent_id` emission gating per the wire-format contract."
  []
  (t2/reducible-query
   {:select    [[:db.name :db_name]
                [:table.schema :table_schema]
                [:table.name :table_name]
                [:field.name :field_name]
                [:field.description :description]
                [:field.base_type :base_type]
                [:field.database_type :database_type]
                [:field.effective_type :effective_type]
                [:field.semantic_type :semantic_type]
                [:field.coercion_strategy :coercion_strategy]
                [:field.nfc_path :nfc_path]
                [:field.parent_id :parent_id_int]
                [:fk_db.name :fk_db_name]
                [:fk_table.schema :fk_table_schema]
                [:fk_table.name :fk_table_name]
                [:fk_field.name :fk_field_name]
                [:fk_field.nfc_path :fk_field_nfc_path]
                [:fk_field.parent_id :fk_parent_id_int]]
    :from      [[:metabase_field :field]]
    :join      [[:metabase_table :table]    [:= :field.table_id :table.id]
                [:metabase_database :db]    [:= :table.db_id :db.id]]
    :left-join [[:metabase_field :fk_field]    [:and [:= :field.fk_target_field_id :fk_field.id] (visible-field-where :fk_field)]
                [:metabase_table :fk_table]    [:and [:= :fk_field.table_id :fk_table.id]        (visible-table-where :fk_table)]
                [:metabase_database :fk_db]    [:and [:= :fk_table.db_id :fk_db.id]              (visible-db-where :fk_db)]]
    :where     [:and (visible-db-where :db) (visible-table-where :table) (visible-field-where :field)]}))

(defn- decode-nfc-path
  "JSON-decode an `nfc_path` value pulled via raw query (no model transform). Returns nil for
  null/empty, the original value when it's already a sequential collection, or the decoded
  vector when it's a JSON string."
  [nfc-path]
  (cond
    (nil? nfc-path)        nil
    (sequential? nfc-path) (seq nfc-path)
    (string? nfc-path)     (seq (json/decode nfc-path))))

(defn- external-database-id
  "Portable id for a database — its name."
  [db-name]
  db-name)

(defn- external-table-id
  "Portable id for a table — `[db-name schema table-name]` (schema may be nil)."
  [db-name schema table-name]
  [db-name schema table-name])

(defn- external-field-id
  "Portable id for a field. Convention-aware — branches on `has-parent?` (true when
  the storage row has a non-NULL `parent_id` column) and on whether `nfc-path` is set:

    - **Convention A child** (`has-parent?` true): the row has a real parent storage row
      with int id, and `nfc-path` is the parent ancestry chain. The portable id is
      `[db schema table & nfc-path & field-name]` — the leaf name is appended.
    - **Convention B leaf** (`has-parent?` false, `nfc-path` non-empty): the row has
      no parent storage row; `nfc-path` is the FULL structural path including the leaf,
      and `field-name` is the synthesized arrow-joined display label. The portable id
      is `[db schema table & nfc-path]` — `nfc-path` is used verbatim, `field-name`
      is NOT appended (the path already terminates at the leaf's structural location).
    - **Flat root** (`has-parent?` false, `nfc-path` empty/nil): `[db schema table field-name]`."
  [db-name schema table-name field-name nfc-path has-parent?]
  (cond
    has-parent?    (-> [db-name schema table-name] (into nfc-path) (conj field-name))
    (seq nfc-path) (into [db-name schema table-name] nfc-path)
    :else          [db-name schema table-name field-name]))

(defn format-database-row
  "JSON shape for one database row, identifying the database by its portable id."
  [{:keys [name engine]}]
  {:id (external-database-id name) :name name :engine engine})

(defn format-table-row
  "JSON shape for one table row, with portable references for `:id` and `:db_id`. Optional
  fields are omitted when nil."
  [{:keys [db_name schema table_name description]}]
  (m/assoc-some {:id    (external-table-id db_name schema table_name)
                 :db_id (external-database-id db_name)
                 :name  table_name}
                :schema schema
                :description description))

(defn format-field-row
  "JSON shape for one field row, with portable references for `:id`, `:table_id`,
  `:parent_id`, and `:fk_target_field_id`. The convention is encoded in the **presence
  or absence** of optional wire keys; the importer never has to interpret either:

    - `:parent_id` is emitted only when storage `parent_id` is non-NULL (a real parent
      storage row exists). Convention B leaves and flat roots get no `:parent_id`.
    - `:nfc_path` is emitted verbatim when the storage column is non-empty. Under
      Convention A on a child, this is the parent ancestry chain (no leaf). Under
      Convention B, this is the full structural path including the leaf.
    - `:id` is built convention-aware via [[external-field-id]] — see that function's
      docstring for the three cases.

  The FK target gets the same convention-aware treatment via the same
  [[external-field-id]] function — `:fk_parent_id_int` and `:fk_field_nfc_path` are
  pulled to enable that.

  Optional fields are omitted when nil."
  [{:keys [db_name table_schema table_name field_name description base_type database_type
           effective_type semantic_type coercion_strategy nfc_path parent_id_int
           fk_db_name fk_table_schema fk_table_name fk_field_name fk_field_nfc_path
           fk_parent_id_int]}]
  (let [nfc-path        (decode-nfc-path nfc_path)
        has-parent?     (some? parent_id_int)
        parent-id       (when has-parent?
                          ;; The parent's portable id collapses to `[db schema table & nfc-path]`
                          ;; in every Convention A case:
                          ;; - If the parent itself has a parent (grandparent exists), the
                          ;;   parent is a Convention A child; its `name` = last element of
                          ;;   the child's `nfc-path`; its `nfc-path` = (butlast child-nfc-path).
                          ;;   `external-field-id` for that case yields parent.nfc-path ++ parent.name
                          ;;   which is exactly the child's full nfc-path.
                          ;; - If the parent has no parent (it's a flat structural root in
                          ;;   Convention A), the parent's `name` = (last child-nfc-path) and
                          ;;   `nfc-path` is nil. `external-field-id`'s flat-root branch yields
                          ;;   `[db schema table parent.name]` = `[db schema table (last child-nfc-path)]`,
                          ;;   which (since the child's nfc-path here is length 1) equals
                          ;;   `[db schema table & nfc-path]`.
                          ;; Either way the result is `(into [db schema table] nfc-path)`,
                          ;; so we can construct it directly without re-reading the parent row.
                          (into [db_name table_schema table_name] nfc-path))
        fk-field-nfc    (decode-nfc-path fk_field_nfc_path)
        fk-has-parent?  (some? fk_parent_id_int)
        fk-target-id    (when (and fk_db_name fk_table_name fk_field_name)
                          (external-field-id fk_db_name fk_table_schema fk_table_name
                                             fk_field_name fk-field-nfc fk-has-parent?))]
    (m/assoc-some {:id       (external-field-id db_name table_schema table_name field_name nfc-path has-parent?)
                   :table_id (external-table-id db_name table_schema table_name)
                   :name     field_name}
                  :description description
                  :base_type base_type
                  :database_type database_type
                  :effective_type (when (and effective_type (not= base_type effective_type)) effective_type)
                  :semantic_type semantic_type
                  :coercion_strategy coercion_strategy
                  :nfc_path nfc-path
                  :parent_id parent-id
                  :fk_target_field_id fk-target-id)))

(defn reducible-databases
  "Eduction streaming visible databases as already-formatted JSON-shaped rows."
  []
  (eduction (map format-database-row) (reducible-databases-query)))

(defn reducible-tables
  "Eduction streaming visible tables as already-formatted JSON-shaped rows."
  []
  (eduction (map format-table-row) (reducible-tables-query)))

(defn reducible-fields
  "Eduction streaming visible fields as already-formatted JSON-shaped rows."
  []
  (eduction (map format-field-row) (reducible-fields-query)))
