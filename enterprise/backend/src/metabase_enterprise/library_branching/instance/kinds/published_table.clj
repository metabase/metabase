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
   [metabase-enterprise.library-branching.instance.portable :as portable]
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
  (let [wanted     (set table-keys)
        ;; A case-insensitive collation can match a table whose key differs in case.
        tables     (filterv #(contains? wanted (table-key %))
                            (content/in-chunks library-branching.db/tables-by-key (vec wanted) 100))
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

(def kind-store
  "The `KindStore` of published tables."
  (reify instance/KindStore
    (read-all [_ ids] (read-published-tables ids))
    (current [_ _id] (instance/not-yet! `instance/current))
    (write! [_ _id _content] (instance/not-yet! `instance/write!))
    (trash! [_ _id] (instance/not-yet! `instance/trash!))))
