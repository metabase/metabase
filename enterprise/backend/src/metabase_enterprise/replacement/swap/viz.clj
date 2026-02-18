(ns metabase-enterprise.replacement.swap.viz
  (:require
   [clojure.walk]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.visualization-settings :as vs]
   [toucan2.core :as t2]))

(defn- upgrade-legacy-field-ref
  "Given a card's dataset_query (pMBQL) and a legacy field ref
  ([\"field\" 42 {...}]), resolve it through the metadata system and return
  an upgraded version."
  [query field-ref]
  (let [pmbql-ref   (lib.convert/legacy-ref->pMBQL query field-ref)
        col-meta    (lib/metadata query 0 pmbql-ref)
        upgraded    (lib/ref col-meta)
        legacy-back (lib/->legacy-MBQL upgraded)]
    legacy-back))

(defn- upgrade-column-settings-keys
  "Given a card's dataset_query (pMBQL) and a column_settings map (from visualization_settings),
  return a new column_settings map with upgraded parameter-mapping. Keys are JSON-encoded strings."
  [query column-settings]
  (when (some? column-settings)
    (clojure.walk/postwalk
     (fn [form]
       (if (lib/is-field-clause? form)
         (upgrade-legacy-field-ref query form)
         form))
     column-settings)))

(defn- swap-field-ref [mp field-ref old-table new-table]
  (let [field-ref (lib.convert/legacy-ref->pMBQL mp field-ref)]
    (if-some [field-id (lib/field-ref-id field-ref)]
      (if-some [field-meta (t2/select-one :model/Field :id field-id :table_id old-table)]
        (let [field-name (:name field-meta)
              new-field (t2/select-one :model/Field :name field-name :table_id new-table)]
          (when (nil? new-field)
            (throw (ex-info "Could not find field with matching name." {:name field-name
                                                                        :original-field field-meta
                                                                        :table_id new-table})))
          (let [new-field-meta (lib.metadata/field mp (:id new-field))]
            (lib/->legacy-MBQL (lib/ref new-field-meta))))
        ;; Can be here for two reasons:
        ;;  1. field-id doesn't exist. Oh, well. We just give up.
        ;;  2. field is not from the table we're swapping.
        field-ref)
      field-ref)))

(defn- ultimate-table-id [[source-type source-id]]
  (case source-type
    :table source-id))

(defn- swap-field-refs [mp form old-source [new-source-type new-source-id]]
  (case new-source-type
    :table
    (let [new-table-id new-source-id
          old-table-id (ultimate-table-id old-source)]
      (clojure.walk/postwalk
       (fn [exp]
         (if (lib/is-field-clause? exp)
           (swap-field-ref mp exp old-table-id new-table-id)
           exp))
       form))

    :card
    form))

(defn update-dashcards-column-settings!
  "After a card's query has been updated, upgrade the column_settings keys on all
  DashboardCards that display this card."
  [card-id query old-source new-source]
  (doseq [dashcard (t2/select :model/DashboardCard :card_id card-id)]
    (let [viz      (vs/db->norm (:visualization_settings dashcard))
          col-sets (::vs/column-settings viz)]
      (when (seq col-sets)
        (let [upgraded (upgrade-column-settings-keys query col-sets)
              swapped  (swap-field-refs query col-sets old-source new-source)]
          (when (not= col-sets upgraded)
            (t2/update! :model/DashboardCard (:id dashcard)
                        {:visualization_settings (-> viz
                                                     (assoc ::vs/column-settings swapped)
                                                     vs/norm->db)})))))))
