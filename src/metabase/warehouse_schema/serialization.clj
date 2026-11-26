(ns metabase.warehouse-schema.serialization
  "The SerDes of Fields, their Dimensions, FieldValues and user settings, the user settings of Tables, and the
  definitions of Tables."
  (:require
   [clojure.string :as str]
   [metabase.serialization.core :as serialization]))

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

(def ^:private definition-key-models
  "The model of the row that each key of a `history_definition` or `eav_definition` holds, when it is not a Field."
  {:definition_table :model/Table})

(defn- walk-definition
  "`definition` with each Field and `definition_table` id or reference replaced by what `visit` returns for it, a walk
  of [[serialization/export-in-bulk]] and [[serialization/import-in-bulk]]."
  [visit definition]
  (some->> definition
           (into {} (map (fn [[k v]]
                           [k (serialization/visit-some (definition-key-models k :model/Field) v visit)])))))

(def definition-transform
  "The transform of the `history_definition` and `eav_definition` of Tables and their user settings: each Field id as
  a `[db-name schema table-name & field-names]` reference and the `definition_table` as `[db-name schema
  table-name]`."
  {:export (fn [store _ definitions _]
             (serialization/export-in-bulk store definitions walk-definition))
   :import (fn [store _ definitions opts]
             (serialization/import-in-bulk store definitions opts walk-definition))})

(defn dimension-storage-paths
  "The storage path of each of the Dimension `entities`, the one of its Field with a `___dimension` suffix."
  [entities _ctx]
  (field-paths-with-suffix entities "___dimension"))

(defn field-values-storage-paths
  "The storage path of each of the FieldValues `entities`, the one of its Field with a `___fieldvalues` suffix."
  [entities _ctx]
  (field-paths-with-suffix entities "___fieldvalues"))

(defn field-user-settings-storage-paths
  "The storage path of each of the FieldUserSettings `entities`, the one of its Field with a `___fieldusersettings`
  suffix."
  [entities _ctx]
  (field-paths-with-suffix entities "___fieldusersettings"))

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
