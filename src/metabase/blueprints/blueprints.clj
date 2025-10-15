(ns metabase.blueprints.blueprints
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.models.serialization :as serdes]
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

(defn patch-card
  [yaml-file db destination-schema which->table {:keys [collection-id user-id]}]
  (let [card (-> (yaml/parse-string (slurp (io/resource yaml-file)))
                 (assoc :database_id (:id db))
                 (update :dataset_query
                         (fn [query]
                           (walk/postwalk
                            (fn [x]
                              (cond (string? x)
                                    ;; todo: patch table in new schema
                                    ({"<<db>>" (:name db)
                                      "<<destination_schema>>" destination-schema} x
                                     (str/replace x #"<<target\.(.*)>>"
                                                  (fn [[whole which]]
                                                    (or (which->table which)
                                                        (throw (ex-info (str "Can't replace " whole) {}))))))
                                    (sequential? x)
                                    (vec x)
                                    :else x))
                            query
                            )))
                 (update :dataset_query serdes/import-mbql)
                 (update :visualization_settings serdes/import-visualization-settings)
                 (assoc :collection_id collection-id
                        :creator_id user-id)
                 )]
    card))

(defn document-for-collection
  "this is basically an xray"
  [collection-id creator-id]
  (let [cards (t2/select :model/Card :collection_id collection-id)]
    (t2/insert! :model/Document
                {:name "Hiro in a Box™®"
                 :creator_id creator-id
                 :content_type "application/json+vnd.prose-mirror",
                 :collection_id collection-id
                 :document {:type "doc"
                            :content (into [{:type "paragraph",
                                             :content [{:type "text",
                                                        :text "What is going on in our company?"}]}]
                                           (map (fn [card]
                                                  {:type "resizeNode",
                                                   :attrs {:height 442, :minHeight 280},
                                                   :content [{:type "cardEmbed",
                                                              :attrs {:id (:id card),
                                                                      :name nil}}]}))
                                           cards)}})))


(comment
  (document-for-collection nil 1)

  (slurp (io/resource "blueprints/salesforce/cards/customer_base_by_country.yaml"))
  ;; yaml file
  (doseq [y ["blueprints/salesforce/cards/customer_base_by_country.yaml"
             "blueprints/salesforce/cards/trend__total___of_weighted_open_pipeline_expected__close_date_this_q.yaml"
             "blueprints/salesforce/cards/expected_deals_this_quarter.yaml"
             "blueprints/salesforce/cards/bar_customer_logo_over_time.yaml"
             "blueprints/salesforce/cards/current_quarter_cw_amount.yaml"
             "blueprints/salesforce/cards/pivot_pipeline.yaml"
             "blueprints/salesforce/cards/monthly_cw_deal_trend.yaml"
             "blueprints/salesforce/cards/monthly_pipeline.yaml"]
          :let [db (t2/select-one :model/Database :id 3)]]
    (t2/insert! :model/Card
                (patch-card y db
                            "transform476140" ;; destination schema might need origin schema
                            {"account" "transformed_account"
                             "opportunity" "transformed_opportunity"} ;; output table names
                            {:collection-id nil :user-id 1})))
  (t2/insert! :model/Card *1)
  )

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
