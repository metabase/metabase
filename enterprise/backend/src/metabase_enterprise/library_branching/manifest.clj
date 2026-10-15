(ns metabase-enterprise.library-branching.manifest
  "The manifest export of an instance: the document of `format.manifest`, read from the app DB."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.manifest :as format.manifest]
   [metabase-enterprise.library-branching.format.writer :as writer]))

(set! *warn-on-reflection* true)

(defn- database-rows
  []
  ;; A routing destination holds a copy of its router's schema; queries name the router.
  (library-branching.db/rows {:select [:id :name :engine]
                              :from   [:metabase_database]
                              :where  [:and [:= :is_audit false] [:= :router_database_id nil]]}))

(defn- table-rows
  []
  (library-branching.db/rows {:select [:id :db_id :schema :name]
                              :from   [:metabase_table]
                              :where  [:= :active true]}))

(defn- field-rows
  []
  (library-branching.db/rows {:select [:id :table_id :parent_id :name :base_type :effective_type]
                              :from   [:metabase_field]
                              :where  [:= :active true]}))

(defn- field-doc
  "The document of field row `field`, with the fields under it from `children`, `{[table-id parent-id] [row]}`."
  [children {:keys [id table_id base_type effective_type] :as field}]
  (let [nested (mapv (partial field-doc children) (sort-by :name (get children [table_id id])))]
    (cond-> {:name (:name field)}
      base_type      (assoc :base_type base_type)
      effective_type (assoc :effective_type effective_type)
      (seq nested)   (assoc :fields nested))))

(defn manifest
  "The manifest document of this instance, read in the current transaction: each database that is not the audit
  database or a routing destination, with its active tables and their active fields, each nested field under its
  parent. Databases are in the order of their names, tables in the order of their schemas and names, fields in the
  order of their names."
  []
  (let [children (group-by (juxt :table_id :parent_id) (field-rows))
        tables   (group-by :db_id (table-rows))]
    {:format    format.manifest/version
     :databases (vec (for [{:keys [id engine] :as db} (sort-by :name (database-rows))
                           :let [ts (vec (for [{:keys [schema] :as table} (sort-by (juxt :schema :name) (get tables id))
                                               :let [fields (mapv (partial field-doc children)
                                                                  (sort-by :name (get children [(:id table) nil])))]]
                                           (cond-> {:name (:name table)}
                                             schema       (assoc :schema schema)
                                             (seq fields) (assoc :fields fields))))]]
                       (cond-> {:name (:name db)}
                         engine    (assoc :engine engine)
                         (seq ts)  (assoc :tables ts))))}))

(defn manifest-yaml
  "The canonical YAML bytes of [[manifest]]."
  ^bytes []
  (writer/write-yaml (manifest)))
