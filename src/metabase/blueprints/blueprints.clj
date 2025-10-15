(ns metabase.blueprints.blueprints
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [toucan2.core :as t2]))

(def salesforce-tables
  "A set of the standard salesforce tables."
  #{"account"
    "account_history"
    "broadcast_topic"
    "broadcast_topic_collab_room"
    "broadcast_topic_user_role"
    "collaboration_room"
    "contact"
    "contact_history"
    "flow_record_element_occurrence"
    "lead"
    "lead_history"
    "operating_hours"
    "operating_hours_feed"
    "operating_hours_history"
    "operating_hours_holiday"
    "operating_hours_holiday_feed"
    "operating_hours_holiday_history"
    "opportunity"
    "opportunity_history"
    "record_type"
    "staged_email"
    "store_history"
    "task"
    "time_slot"
    "time_slot_history"
    "token_history"
    "user"
    "user_preference"})

(defn- is-salesforce-tables? [table-names]
  (< 5 (count (set/intersection salesforce-tables table-names))))

(defn identify-blueprints!
  "Determines the relevant blueprints for a database."
  [db]
  (let [db-id (:id db)
        schema->tables (group-by :schema (t2/select :model/Table :db_id db-id))]
    (doseq [[schema tables] schema->tables]
      (let [table-names (set (map :name tables))]
        (when (is-salesforce-tables? table-names)
          (t2/update! :model/Database db-id {:settings (merge (:settings db)
                                                              {:blueprints {:is-salesforce? true
                                                                            :salesforce-schema schema}})}))))))

(defn create-salesforce-cards! [db tables]
  ;; get the serialized cards from the salesforce dashboard
  ;; deserialize them into clojure objects
  ;; patch them with the db/table references
  ;; toucan insert them
  ;; return them for use in dashboard creation
  (tap> "creating salesforce cards")
  [:card1 :card2])

(defn create-salesforce-dashboard! [db cards]
  (tap> "creating salesforce dashboard")
  ;; get the serialized dashboard?
  ;; deserialize it into a clojure object
  ;; patch it with the db/cards references
  ;; toucan insert it
  ;; return the id for use in the api response
  {})

(comment

  (->> (t2/select :model/Table :db_id 2575 :schema "salesforce")
       (map :name)
       (remove #(str/ends-with? % "_c"))
       (remove #(str/starts-with? % "fivetran_"))
       sort
       vec)

  (->> (t2/select :model/Database :id 2575)
       :settings)

  (let [db {:id 2575}
        db-id (:id db)
        schema->tables (group-by :schema (t2/select :model/Table :db_id db-id))]
    (doseq [[_schema tables] schema->tables]
      (let [table-names (set (map :name tables))]
        (when (is-salesforce-tables? table-names)
          (t2/update! :model/Database db-id {:settings (merge (:settings db)
                                                              {:blueprints {:is-salesforce? true}})})))))

  (tap> 1))
