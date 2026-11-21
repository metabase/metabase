(ns metabase.warehouse-schema.serialization
  "The SerDes of Fields, their Dimensions, FieldValues and user settings, and the user settings of Tables."
  (:require
   [clojure.string :as str]
   [metabase.serialization.core :as serialization]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.user-settings :as user-settings]))

(set! *warn-on-reflection* true)

(defn- field-paths-with-suffix
  "The storage path of each of `entities`, which name a Field by `:field_id`, the one of its Field with `suffix`."
  [entities suffix]
  (mapv (fn [entity]
          (let [field-path (serialization/storage-path-prefixes (:field_id entity))]
            (update field-path (dec (count field-path))
                    (fn [segment] (assoc segment :suffix suffix)))))
        entities))

(defn field-entity-ref
  "The ref of a Field `entity`, the ref of its parent Field or Table with its name."
  [{:keys [table_id parent_id name]}]
  (conj (or parent_id table_id) name))

(defn field-storage-paths
  "The storage path of each of the Field `entities`, under `fields/` of its Table by its dotted name."
  [entities _ctx]
  (mapv (fn [field]
          (let [[db-name schema table-name & field-names] (field-entity-ref field)
                field-name                                (str/join "." field-names)]
            (conj (serialization/storage-path-prefixes [db-name schema table-name])
                  {:label "fields"}
                  {:label field-name :key field-name})))
        entities))

(defn- import-dimension-field-ids
  "Imports the `field_id` of Dimensions, keeping the Field id that a Dimension nested in its Field's entity loads with."
  [store _entities field-ids opts]
  (mapv (fn [field-id imported] (if (int? field-id) field-id imported))
        field-ids
        (serialization/column-ids store :model/Field (mapv #(when-not (int? %) %) field-ids) opts)))

(def dimension-field-id-transform
  "The transform of the `field_id` of Dimensions."
  (assoc serialization/field-transform :import import-dimension-field-ids))

(defn dimension-storage-paths
  "The storage path of each of the Dimension `entities`, the one of its Field with a `___dimension` suffix."
  [entities _ctx]
  (field-paths-with-suffix entities "___dimension"))

(defn field-values-storage-paths
  "The storage path of each of the FieldValues `entities`, the one of its Field with a `___fieldvalues` suffix."
  [entities _ctx]
  (field-paths-with-suffix entities "___fieldvalues"))

(defn field-values-before-load
  "The FieldValues load `items` without the `type` and `hash_key` their local rows already hold."
  [items]
  (mapv (fn [{:keys [local] :as item}]
          (cond-> item
            (and local (= (get-in item [:row :type]) (:type local)))         (update :row dissoc :type)
            (and local (= (get-in item [:row :hash_key]) (:hash_key local))) (update :row dissoc :hash_key)))
        items))

(defn field-user-settings-storage-paths
  "The storage path of each of the FieldUserSettings `entities`, the one of its Field with a `___fieldusersettings`
  suffix."
  [entities _ctx]
  (field-paths-with-suffix entities "___fieldusersettings"))

(defn field-user-settings-before-load
  "The FieldUserSettings load `items`, the rows that update a local row clearing the user-settable columns they lack."
  [items]
  (mapv (fn [{:keys [local] :as item}]
          (cond-> item
            local (update :row #(merge (zipmap user-settings/user-settable-field-columns (repeat nil)) %))))
        items))

(defn field-user-settings-after-load
  "Writes the user-set columns of the loaded FieldUserSettings `items` to their Fields."
  [items]
  (doseq [{{:keys [field_id] :as settings} :instance} items]
    (warehouse-schema.db/update-field! field_id (select-keys settings (user-settings/user-set-field-columns settings)))))

(defn table-user-settings-storage-paths
  "The storage path of each of the TableUserSettings `entities`, in the directory of its Table with a
  `___tableusersettings` suffix."
  [entities _ctx]
  (mapv (fn [{:keys [table_id]}]
          (conj (serialization/storage-path-prefixes table_id)
                {:label (nth table_id 2) :suffix "___tableusersettings"}))
        entities))

(defn table-user-settings-import-dependencies
  "The Collection each of the TableUserSettings `entities` depends on, if any."
  [entities]
  (mapv (fn [{:keys [collection_id]}]
          (cond-> #{} collection_id (conj [:model/Collection collection_id])))
        entities))

(defn- without-derived-half
  "Drop from `changes` the half of a `visibility_type`/`data_layer` pair the Table's own update derives from the other."
  [{:keys [visibility_type data_layer] :as changes}]
  (if (and (contains? changes :visibility_type) (contains? changes :data_layer))
    (if (= (some-> data_layer keyword) (table/visibility-type->data-layer (some-> visibility_type keyword)))
      (dissoc changes :data_layer)
      (dissoc changes :visibility_type))
    changes))

(defn- load-legacy-fields!
  "Loads the FieldUserSettings that the settings `items` of an older export carry under `:fields`, deleting the other
  FieldUserSettings of their Tables."
  [items]
  (doseq [{{:keys [table_id]} :instance {:keys [fields]} :entity} (filter #(contains? (:entity %) :fields) items)]
    (let [kept (into #{} (map :field_id)
                     (serialization/load :model/FieldUserSettings (mapv serialization/restore-identity fields)))]
      (warehouse-schema.db/delete-field-user-settings!
       (vec (remove kept (warehouse-schema.db/field-ids-with-user-settings-for-table table_id)))))))

(defn table-user-settings-after-load
  "Writes the user-set columns of the loaded TableUserSettings `items` to their Tables, loading the FieldUserSettings
  of older exports."
  [items]
  (load-legacy-fields! items)
  (doseq [{{:keys [table_id] :as settings} :instance :keys [entity]} items]
    (warehouse-schema.db/update-table! table_id (without-derived-half
                                                 (select-keys settings (user-settings/user-set-table-columns settings))))
    (when (:field_order entity)
      (table/update-field-positions! (warehouse-schema.db/table table_id)))))
