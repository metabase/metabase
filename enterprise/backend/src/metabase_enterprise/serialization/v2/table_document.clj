(ns metabase-enterprise.serialization.v2.table-document
  "The table file of the kind layout: one document per table. At the top, the table's settings (its
  TableUserSettings row); then `columns`, an entry per column in the table's column order, with the column's settings
  (its FieldUserSettings row) and its `remapping` (its Dimension row). With the schema, the table's and each column's
  own rows are each one's `metadata`. Each part is the stored form its own file would hold, without its `serdes/meta`.

  [[assemble]] builds the document from the rows of an extracted table; [[split]] takes it apart into those rows,
  which load as the files of their own models do."
  (:require
   [metabase-enterprise.serialization.db :as serialization.db]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn table-document?
  "Whether the parsed file `m` is a table document: a Table with `columns`."
  [m]
  (and (map? m)
       (= "Table" (-> m :serdes/meta last :model))
       (contains? m :columns)))

(defn- part
  "The stored form of the extracted entity `entity`, without its `serdes/meta`."
  [entity]
  (dissoc (serdes/storable entity) :serdes/meta))

(defn- extract
  "The extracted instances of `model` that the query options `query-opts` select, with the export options `opts`."
  [model opts query-opts]
  (into [] (map #(serdes/extract-one model opts %)) (serdes/extract-query model (merge opts query-opts))))

(defn- field-ref
  "The `[db schema table field ...]` reference of the extracted Field `field`."
  [{:keys [table_id parent_id name]}]
  (conj (vec (or parent_id table_id)) name))

(defn- column-entry
  "The document entry of the column `ref`, from its extracted `field` (when the export has it), `settings` and
  `remapping`."
  [ref field settings remapping schema?]
  (cond-> (merge {:name (peek ref)}
                 (when (< 4 (count ref)) {:parents (subvec ref 3 (dec (count ref)))})
                 (some-> settings part))
    remapping           (assoc :remapping (part remapping))
    (and schema? field) (assoc :metadata (part field))))

(defn assemble
  "The table document of the extracted Table `table`, from its rows on this instance, extracted with the export
  options `extract-opts`. With `schema?`, the table's and its columns' own rows are in it."
  [table {:keys [schema? extract-opts]}]
  (let [opts      (or extract-opts {})
        table-id  (:id (serdes/load-find-local (serdes/path table)))
        field-ids (serialization.db/field-ids-of-table table-id)
        fields    (->> (extract "Field" opts {:filter-column :table_id :filter-ids [table-id]})
                       (sort-by (juxt #(or (:position %) Long/MAX_VALUE) :name)))
        settings  (first (extract "TableUserSettings" opts {:filter-ids [table-id]}))
        by-field  (fn [entities] (u/index-by (comp vec :field_id) entities))
        column-settings (by-field (extract "FieldUserSettings" opts {:filter-column :table_id :filter-ids [table-id]}))
        remappings      (by-field (when (seq field-ids)
                                    (extract "Dimension" opts {:filter-column :field_id :filter-ids field-ids})))
        refs      (mapv field-ref fields)
        ;; settings or a remapping of a column the export has no row for still belong in the file
        others    (remove (set refs) (distinct (concat (keys column-settings) (keys remappings))))]
    (cond-> (merge {:serdes/meta [{:model "Table"}]
                    :db_id       (:db_id table)
                    :schema      (:schema table)
                    :name        (:name table)}
                   (some-> settings part))
      schema? (assoc :metadata (part table))
      true    (assoc :columns (into (mapv (fn [ref field]
                                            (column-entry ref field (column-settings ref) (remappings ref) schema?))
                                          refs fields)
                                    (map #(column-entry % nil (column-settings %) (remappings %) schema?))
                                    others)))))

(defn- with-model [m model]
  (assoc m :serdes/meta [{:model model}]))

(defn split
  "The entities the table document `doc` holds, each as the file of its own model would hold it, with
  `serdes/meta` reduced to its model (each model computes its identity from its content)."
  [doc]
  (let [top (dissoc doc :serdes/meta :columns :metadata :db_id :schema :name)]
    (concat
     (some-> (:metadata doc) (with-model "Table") vector)
     (when (contains? top :table_id)
       [(with-model top "TableUserSettings")])
     (for [column (:columns doc)
           entity [(some-> (:metadata column) (with-model "Field"))
                   (when (contains? column :field_id)
                     (with-model (dissoc column :name :parents :remapping :metadata) "FieldUserSettings"))
                   (some-> (:remapping column) (with-model "Dimension"))]
           :when entity]
       entity))))
