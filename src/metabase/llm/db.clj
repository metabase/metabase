(ns metabase.llm.db
  "Application database queries for the LLM module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn database-engine
  "The engine of the Database with `database-id`, or nil."
  [database-id]
  (t2/select-one-fn :engine :model/Database :id database-id))

(defn active-tables-matching
  "The active Tables of the Database with `database-id` matching any of the Honey SQL `match-clauses`."
  [database-id match-clauses]
  (t2/select :model/Table
             {:where [:and
                      [:= :db_id database-id]
                      [:= :active true]
                      (into [:or] match-clauses)]}))

(defn visible-tables
  "The active, visible Tables among `table-ids` of the Database with `database-id` also selected by the Honey SQL
  `query`."
  [table-ids database-id query]
  (t2/select :model/Table
             :id [:in table-ids]
             :db_id database-id
             :active true
             :visibility_type nil
             query))

(defn unarchived-cards
  "The unarchived Cards with `card-ids`."
  [card-ids]
  (t2/select :model/Card :id [:in card-ids] :archived false))

(defn fields
  "The Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field :id [:in field-ids]))

(defn field-names-and-tables
  "The id, name, and Table id of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :name :table_id] :id [:in field-ids]))

(defn field-fingerprints
  "A map of Field id to fingerprint for the Fields with `field-ids`."
  [field-ids]
  (t2/select-pk->fn :fingerprint :model/Field :id [:in field-ids]))
