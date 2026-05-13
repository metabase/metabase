(ns metabase.metabot.descriptions
  "Code to generate descriptions for entities so those are better surfaced by semantic search. This will live
   in a different ns later. Here just for start."
  (:require
   [clojure.string :as str]
   [toucan2.core :as t2]))

;; inputs? outputs?
;; table and card

;; model vs metadata?

;; n+1 here and there, to be resolved later

;; selmer template?
(defn generate-table-description
  [database-name schema-name table-name fields fk-tables*]
  (str (format (str "This is the `%s` table."
                    " The table belongs to the `%s` database with the schema `%s`.")
               table-name database-name schema-name)
       (when (seq fields)
         (str " "
              "The table has following fields: "
              (str/join ", "
                        (map #(str (:name %) " (" (:database_type %) ")")
                             fields))
              "."))
       (when (seq fk-tables*)
         (str " "
              "Table has foreign keys targeting the tables (schema prefixed): "
              (str/join ", "
                        (map #(str "`" (first %) "." (second %) "`")
                             fk-tables*))
              "."))))

;; todo remapping...
(defn- fk-tables
  [fields]
  (let [field-ids (into #{}
                        (comp (filter (comp #{:type/FK} :semantic_type))
                              (map :fk_target_field_id))
                        fields)
        table-ids (into #{} (map :table_id)
                        (t2/select :model/Field :id [:in field-ids]))]
    (mapv (juxt :schema :name)
          (t2/select :model/Table :id [:in table-ids]))))

(defn- description-for-table
  [table-id]
  (let [table (t2/select-one :model/Table :id table-id)
        _ (assert (pos-int? (:db_id table))
                  "Table must have :db_id")
        db (t2/select-one :model/Database :id (:db_id table))
        fields (t2/select :model/Field :table_id (:id table))
        fk-tables* (fk-tables fields)
        description (generate-table-description
                     ;; I'm not aware of cannonical driver agnostic way
                     ;; -- it might not be even available for conn str 
                     ;; only dbs.
                     (-> db :details :name)
                     (:schema table)
                     (:name table)
                     fields
                     fk-tables*)]
    description))

(defn set-table-auto-description!
  [table-id description]
  (t2/update! :model/Table :id table-id {:description description}))

(defn auto-describe-table!
  [table-id]
  (set-table-auto-description! table-id
                               (description-for-table table-id)))

(defn auto-describe-db-tables!
  [db-id]
  (run!
   auto-describe-table!
   (t2/select-fn-vec :id :model/Table :db_id db-id)))

(comment

  (auto-describe-db-tables! 1)
  (t2/select [:model/Table :id :name :description] :db_id 1)

  (t2/select :model/Field :table_id [:in (map :id (t2/select [:model/Table :id :name :description] :db_id 1))]))