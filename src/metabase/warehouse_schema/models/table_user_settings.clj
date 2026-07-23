(ns metabase.warehouse-schema.models.table-user-settings
  "Mirror table of `:model/Table` that records the values a user has explicitly set through the UI (as
  opposed to values authored by sync). One row per Table, PK is `table_id`. The mirror of
  [[metabase.warehouse-schema.models.field-user-settings]] for Tables."
  (:require
   [metabase.app-db.query :as mdb.query]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.table :as table]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TableUserSettings [_model] :metabase_table_user_settings)

(t2/deftransforms :model/TableUserSettings
  {:entity_type     mi/transform-keyword
   :visibility_type mi/transform-keyword
   :field_order     mi/transform-keyword
   :data_layer      table/transform-table-data-layer
   :data_source     table/transform-table-data-source
   :data_authority  table/transform-table-data-authority})

(doto :model/TableUserSettings
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/primary-keys :model/TableUserSettings [_model] [:table_id])

(defn upsert-user-settings!
  "Record user-set values for the Tables with `table-ids`; safe under concurrent first-time inserts.
  Only keys in [[table/table-user-settings]] are recorded; a key explicitly present with a `nil`
  value is recorded as `nil` (the user unset it)."
  [table-ids settings]
  (let [filtered-settings (u/select-keys-when settings :present table/table-user-settings)]
    (when (seq filtered-settings)
      (doseq [id table-ids]
        (mdb.query/update-or-insert! :model/TableUserSettings {:table_id id}
                                     (constantly filtered-settings))))))

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/pk-column "TableUserSettings" [_model-name] :table_id)

(defmethod serdes/entity-id "TableUserSettings" [_ _] nil)

(defmethod serdes/generate-path "TableUserSettings" [_ {:keys [table_id]}]
  (conj (serdes/table->path (serdes/*export-table-fk* table_id))
        {:model "TableUserSettings" :id "1"}))

(defmethod serdes/deserialization-dependencies "TableUserSettings" [tus]
  ;; the parent Table is synthesized on import if missing, so it is not a dependency
  (let [db-path (first (serdes/path tus))]
    (cond-> [[db-path]]
      (:collection_id tus) (conj [{:model "Collection" :id (:collection_id tus)}]))))

(defmethod serdes/load-find-local "TableUserSettings" [path]
  (let [found-table (serdes/load-find-local (pop path))]
    (t2/select-one :model/TableUserSettings :table_id (:id found-table))))

(defn- table-path->table-ref [tus-path]
  (let [[db schema table-name :as table-ref] (mapv :id (pop tus-path))]
    (if table-name
      table-ref
      ;; It's too short, so no schema. Shift them over and add a nil schema.
      [db nil schema])))

(defmethod serdes/make-spec "TableUserSettings" [_model-name _opts]
  {:copy      [:display_name :description :entity_type :visibility_type :field_order :caveats
               :points_of_interest :show_in_getting_started :is_published :data_authority :data_source
               :owner_email]
   :transform {:created_at    (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :owner_user_id (serdes/fk :model/User)
               :data_layer    (serdes/optional-kw)
               :table_id      {::serdes/fk true
                               :export     (constantly ::serdes/skip)
                               :import-with-context (fn [current _ _]
                                                      (serdes/*import-table-fk* (table-path->table-ref (serdes/path current))))}}})

(def ^:private table-user-settings-slug "___tableusersettings")

(defmethod serdes/storage-path "TableUserSettings" [tus _]
  ;; stored next to the Table's own YAML as <table-name>___tableusersettings.yaml
  (let [table-path (pop (serdes/path tus))]
    (conj (serdes/storage-path-prefixes table-path)
          {:label (str (:id (peek table-path)) table-user-settings-slug)})))
