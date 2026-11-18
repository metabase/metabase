(ns metabase.sync.metadata-sync.links
  "The links of the Tables that one instance sends another: the values of a Table that point at another Table, by
  name. A link is an FK target (`fk`). Display remaps are not sent: they are content, not warehouse metadata.

  A link is only part of a Table's links when both of its ends are described: its Table and Field, and the Table and
  Field it points at."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::field-path
  "A Field's name, after the names of its parents. Always one name today."
  [:sequential {:min 1} ms/NonBlankString])

(mr/def ::target
  [:map {:closed true}
   [:schema [:maybe :string]]
   [:table  ms/NonBlankString]
   [:field  ::field-path]])

(mr/def ::link
  "A link. `kind` is always `fk` in this version; it is there so that a later version can send other kinds."
  [:map {:closed true}
   [:kind   [:= "fk"]]
   [:field  ::field-path]
   [:target ::target]])

(defn- target [tables-by-id table-id field-name]
  (when-let [{table-schema :schema table-name :name} (tables-by-id table-id)]
    {:schema table-schema :table table-name :field [field-name]}))

(defn- fk-links
  "The FK links of the Tables with `table-ids`, as `[table-id link]`, whose target is in `tables-by-id`."
  [table-ids tables-by-id]
  (for [{:keys [table_id field_name target_table_id target_field_name]}
        (pages/in-batches sync.db/fk-links-of-tables table-ids)
        :let  [link-target (target tables-by-id target_table_id target_field_name)]
        :when link-target]
    [table_id {:kind "fk" :field [field_name] :target link-target}]))

(mu/defn table-links :- [:map-of ::lib.schema.id/table [:sequential {:min 1} ::link]]
  "The links of each of `tables`, by Table id, in a fixed order: by Field path, then by kind. `tables` and `selection`
  are rows from [[metabase.sync.metadata-sync.tables/selection]]. A link whose target is not in a Table of
  `selection`, or is not a described Field, is left out. A Table with no links is left out."
  [tables    :- [:sequential ::sync.db/described-table]
   selection :- [:sequential ::sync.db/described-table]]
  (let [tables-by-id (into {} (map (juxt :id identity)) selection)
        table-ids    (mapv :id tables)]
    (update-vals (group-by first (fk-links table-ids tables-by-id))
                 (fn [entries]
                   (vec (sort-by (juxt :field :kind) (map second entries)))))))
