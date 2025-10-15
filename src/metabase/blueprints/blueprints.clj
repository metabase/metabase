(ns metabase.blueprints.blueprints
  (:require
   [clojure.string :as str]
   [toucan2.core :as t2]))

(comment

  (->> (t2/select :model/Table :db_id 2575 :schema "salesforce")
       (map :name)
       (remove #(str/ends-with? % "_c"))
       (remove #(str/starts-with? % "fivetran_"))
       sort
       vec))

(def salesforce-tables
  ["account"
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
   "user_preference"])
