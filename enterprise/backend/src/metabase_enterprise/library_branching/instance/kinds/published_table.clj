(ns metabase-enterprise.library-branching.instance.kinds.published-table
  "The app DB side of the kind `:published-table`, in the item form of `format.kinds.published-table`: a warehouse
  table that is published into a Library collection. The identity is the table's natural key `[database schema
  table]`, the name is the display name that the table shows, and the place is its collection. The attributes are
  what users set, never what warehouse sync writes: the values of the user settings rows of the table and of its
  fields, for the columns that the user set. A value that the user cleared is at its default, so it is absent."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.published-table :as format.published-table]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.kinds.table-item :as table-item]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.models.serialization :as serdes]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]))

(set! *warn-on-reflection* true)

(def ^:private table-columns
  "The table columns that are attributes of the format."
  (disj (set (keys (:attrs format.published-table/spec))) :fields))

(def ^:private field-columns
  "The field columns that are field settings of the format: the user-settable columns, with `fk_target_field_id` as
  the setting `:fk_target`."
  (disj warehouse-schema-overlay/user-settable-field-columns :fk_target_field_id))

(defn- user-set?
  "True iff the user set `column` in settings row `row`: its flag is true, or (with no flag) its value is not nil.
  `flags` maps each column that a user can clear to its flag."
  [flags row column]
  (if-let [flag (get flags column)]
    (true? (get row flag))
    (some? (get row column))))

(defn- user-values
  "`{column value}` of the columns of `columns` that the user set in settings row `row`, by `set?`."
  [row columns set?]
  (into {} (keep (fn [column] (when (set? row column) [column (get row column)]))) columns))

(defn table-values
  "The user-set values of table settings row `row`, nil for a table with no row."
  [row]
  (when row
    (user-values row table-columns (partial user-set? warehouse-schema-overlay/table-user-settings-flags))))

(defn- field-user-set?
  [row column]
  (if (= :coercion_strategy column)
    ;; As the overlay reads it: a coercion strategy is the user's iff the user set the effective type.
    (some? (:effective_type row))
    (user-set? warehouse-schema-overlay/field-user-settings-flags row column)))

(defn field-values
  "The user-set values of field settings row `row`, with the foreign key target as the field natural key
  `:fk_target`."
  [row]
  (let [values (user-values row field-columns field-user-set?)
        target (when (user-set? warehouse-schema-overlay/field-user-settings-flags row :fk_target_field_id)
                 (:fk_target_field_id row))]
    (cond-> values
      target (assoc :fk_target (serdes/*export-field-fk* target)))))

(defn- without-nil
  [m]
  (into {} (remove (comp nil? val)) m))

(defn fields
  "The `:fields` attribute: `{field-name entry}` for the fields of the settings rows `rows`, an entry holds the
  field's settings and, under `:fields`, those of its nested fields. A field with no setting has no entry, unless a
  nested field has one."
  [rows]
  (reduce (fn [acc row]
            (let [values (without-nil (portable/document (field-values row)))
                  names  (drop 3 (serdes/*export-field-fk* (:field_id row)))
                  path   (vec (interpose :fields (map keyword names)))]
              (if (seq values)
                (update-in acc path merge values)
                acc)))
          {}
          rows))

(defn attrs
  "The attributes of a published table with settings row `settings` and field settings rows `field-rows`, with none
  at its default."
  [settings field-rows]
  (->> (assoc (portable/document (or (table-values settings) {}))
              :fields (fields field-rows))
       (content/attrs format.published-table/spec)))

(defn- portable-content
  [{:keys [collection_id settings field-settings]}]
  {:place (serdes/*export-fk* collection_id :model/Collection)
   :attrs (attrs settings field-settings)})

(defn- table-key
  [{:keys [db schema table]}]
  [db schema table])

(defn read-published-tables
  "`{table-key item}` of the published tables of `table-keys`."
  [table-keys]
  (let [tables     (content/in-chunks library-branching.db/tables-by-key (vec (set table-keys)) 100)
        ids        (mapv :id tables)
        settings   (into {} (map (juxt :table_id identity))
                         (content/in-chunks library-branching.db/table-user-settings-by-table-id ids))
        field-rows (content/in-chunks library-branching.db/field-user-settings-by-table-id ids)
        table-of   (into {}
                         (map (juxt :id :table_id))
                         (content/in-chunks library-branching.db/fields-by-id (vec (distinct (map :field_id field-rows)))))
        field-rows (group-by (comp table-of :field_id) field-rows)
        values     (mapv (fn [{:keys [id] :as t}]
                           (assoc t :settings (get settings id) :field-settings (get field-rows id)))
                         tables)
        contents   (portable/export-batch portable-content values)]
    (into {}
          (map (fn [t {:keys [place attrs]}]
                 (let [id (table-key t)]
                   [id (content/item :published-table id (:display_name t) place attrs)]))
               tables
               contents))))

(defn sync-display-names
  "`{table-key display-name}`: the display name that warehouse sync gives each table of `table-keys`, with no user
  value. A key of no table has no entry."
  [table-keys]
  ;; The table of a key is the row that the read takes.
  (let [tables (content/in-chunks library-branching.db/tables-by-key (vec (set table-keys)) 100)
        names  (into {}
                     (map (juxt :id :display_name))
                     (content/in-chunks library-branching.db/sync-display-names-by-id (mapv :id tables)))]
    (into {} (map (fn [t] [(table-key t) (get names (:id t))])) tables)))

(defn- table-of-key
  "The table row (`{:id :db :schema :table :display_name :collection_id}`) of natural key `k`, or nil."
  [k]
  (first (library-branching.db/tables-by-key [k])))

(defn- the-table
  "[[table-of-key]] of `id`; throws ::instance/refused when this instance has no such table."
  [id]
  (or (table-of-key id)
      (instance/refuse! :environment id "This instance has no table with this natural key.")))

(defn current-published-table
  "The content of the in-scope published table `id`, after a lock on its settings row and the settings rows of its
  fields, or nil."
  [id]
  (when-let [table (table-of-key id)]
    (library-branching.db/lock-table-settings (:id table))
    (when (scope/in-scope? :published-table id)
      (get (read-published-tables [id]) id))))

(defn- field-ids
  "`{[name ...] field-id}`: the path of names from the top-level field down to each field of table `table-id`. Of two
  fields with one path, the active one."
  [table-id]
  (let [fields (library-branching.db/table-fields table-id)
        by-id  (into {} (map (juxt :id identity)) fields)
        path   (fn [field]
                 (loop [at field, names ()]
                   (if-let [parent (get by-id (:parent_id at))]
                     (recur parent (cons (:name at) names))
                     (vec (cons (:name at) names)))))]
    (into {}
          (map (juxt path :id))
          (sort-by #(boolean (:active %)) fields))))

(defn- flatten-fields
  "`{[name ...] settings}`: the settings of each entry of the `:fields` attribute `fields`, by the path of names."
  ([fields] (flatten-fields [] fields))
  ([path fields]
   (into {}
         (mapcat (fn [[k entry]]
                   (let [path (conj path (subs (str k) 1))]
                     (cons [path (dissoc entry :fields)]
                           (flatten-fields path (:fields entry))))))
         fields)))

(defn- field-id-of-key
  "The id of the field of natural key `field-key`; throws ::instance/refused for item `id` when there is none."
  [id field-key]
  (let [table (table-of-key (vec (take 3 field-key)))]
    (or (when table (get (field-ids (:id table)) (vec (drop 3 field-key))))
        (instance/refuse! :environment id (str "This instance has no field " (pr-str field-key) ".")
                          {:field field-key}))))

(defn- with-flag
  "`changes` with `column` set to `v`, and its flag in `flags`, if any, set to whether `v` is a value."
  [changes flags column v]
  (cond-> (assoc changes column v)
    (contains? flags column) (assoc (get flags column) (some? v))))

(defn- field-changes
  "The settings row columns that turn the field settings `old` into `new`, for item `id`."
  [id old new]
  (reduce (fn [changes k]
            (let [v (get new k)]
              (if (= :fk_target k)
                (with-flag changes warehouse-schema-overlay/field-user-settings-flags :fk_target_field_id
                  (some->> v (field-id-of-key id)))
                (with-flag changes warehouse-schema-overlay/field-user-settings-flags k v))))
          {}
          (filter #(not= (get old %) (get new %)) (into (set (keys old)) (keys new)))))

(defn- field-writes
  "`[[field-id changes] ...]`: the settings row changes of the fields of table `table-id` that turn the `:fields`
  attribute `old` into `new`, for item `id`. Throws ::instance/refused for a field that the table does not have."
  [id table-id old new]
  (let [old (flatten-fields old)
        new (flatten-fields new)
        ids (field-ids table-id)]
    (into []
          (keep (fn [path]
                  (let [field-id (or (get ids path)
                                     (instance/refuse! :environment id (str "The table has no field " (pr-str path) ".")
                                                       {:field path}))
                        changes  (field-changes id (get old path) (get new path))]
                    (when (seq changes) [field-id changes]))))
          (sort (filter #(not= (get old %) (get new %)) (into (set (keys old)) (keys new)))))))

(defn- write-field!
  [[field-id changes]]
  (if (library-branching.db/field-settings-exist? field-id)
    (library-branching.db/update-field-settings! field-id changes)
    (library-branching.db/insert-field-settings! (assoc changes :field_id field-id))))

(def ^:private keyword-columns
  "The table settings columns whose model transform takes a keyword, not its name."
  #{:entity_type :field_order :data_layer :data_source :data_authority})

(defn- column-value
  "The settings row value of table column `k` for the document value `v`."
  [k v]
  (cond-> v
    (and (string? v) (contains? keyword-columns k)) keyword))

(defn- update-table-settings!
  "Sets the settings row columns `changes` of table `table-id`. A change of `data_layer` also sets `visibility_type`,
  which Metabase derives from it."
  [table-id changes]
  (if (library-branching.db/table-settings-exist? table-id)
    (library-branching.db/update-table-settings! table-id changes)
    (library-branching.db/insert-table-settings! (assoc changes :table_id table-id))))

(defn write-published-table!
  "Makes the content of published table `id` equal to `item`, by the contract of `instance/write!`: the table is
  published into the collection `place`, and the values that users set on it and on its fields are those of `item`."
  [id {:keys [name place attrs] :as item}]
  (content/check-item! :published-table id item)
  (let [table  (the-table id)
        _      (library-branching.db/lock-table-settings (:id table))
        _      (when (nil? place)
                 (instance/refuse! :place id "A published table is in a collection of the Library."))
        parent (tree/place-collection id place)
        old    (get (read-published-tables [id]) id)
        flags  warehouse-schema-overlay/table-user-settings-flags
        sync   (library-branching.db/table-row (:id table))
        attrs* (dissoc attrs :fields)
        old*   (dissoc (:attrs old) :fields)
        changes (cond-> (reduce (fn [m k] (with-flag m flags k (column-value k (get attrs* k))))
                                {}
                                (disj (content/changed-attrs format.published-table/spec old* attrs*) :fields))
                  (not= name (:name old))
                  (assoc :display_name (when (not= name (:display_name sync)) name))

                  (not (and (= (:id parent) (:collection_id table))
                            (scope/in-scope? :published-table id)))
                  (assoc :is_published true :collection_id (:id parent)))]
    (let [fields (field-writes id (:id table) (:fields (:attrs old)) (:fields attrs))]
      (when (seq changes)
        (update-table-settings! (:id table) changes))
      (run! write-field! fields))
    nil))

(defn trash-published-table!
  "Unpublishes table `id`: a published table leaves the Library as an archive of its collection makes it leave.
  The values that users set stay."
  [id]
  (when-let [table (table-of-key id)]
    (library-branching.db/lock-table-settings (:id table))
    (when (scope/in-scope? :published-table id)
      (update-table-settings! (:id table) {:is_published false :collection_id nil}))
    nil))

(def ^:private models-of-read
  "The models whose tables a read of published tables reads: the tables and fields with their settings rows, the
  databases of their natural keys, and the collections."
  #{:model/Collection :model/Database :model/Field :model/FieldUserSettings :model/Table :model/TableUserSettings})

(def kind-store
  "The `KindStore` of published tables."
  (reify instance/KindStore
    (read-all [_ ids] (read-published-tables ids))
    (read-models [_] models-of-read)
    (current [_ id] (current-published-table id))
    (write! [_ id item] (library-branching.db/do-in-transaction #(write-published-table! id item)))
    (trash! [_ id] (library-branching.db/do-in-transaction
                    #(table-item/do-keeping-archive-closed (fn [] (trash-published-table! id)))))))
