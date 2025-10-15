(ns metabase.blueprints.blueprints
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.transforms.execute :as transforms.execute]
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

(def order [:account :contact :opportunity :lead])

(defn transforms
  [which]
  (slurp (io/resource (format "blueprints/salesforce/models/%s.sql" which))))

(defn- macro [schema table-name columns]
  (let [custom-column? (fn [c] (str/ends-with? c "_c"))
        supplemental-column? (fn [all c]
                               (and (custom-column? c)
                                    (contains? (set all) (str/replace c "_c$" ""))))]
    (format "with cte as (select \n  %s \n from %s.%s) \n "
            (str/join "  , "
                      (for [c (sort columns)
                            :when (or (not (custom-column? c))
                                      (and (custom-column? c)
                                           (supplemental-column? columns c)))
                            :let [column-name (if (custom-column? c)
                                                (str/replace c #"_c$" "_custom")
                                                c)]]
                        (format "%s as %s\n" c column-name)))
            schema
            table-name)))

(defn replace-table-references
  [sql-snippet ts source-schema]
  (-> sql-snippet
      (str/replace #"<<source\.(.*)>>" (str source-schema ".$1"))
      (str/replace #"<<transformed\.(.*)>>" (fn [[_full table]]
                                              (format "%s.%s"
                                                      (-> (get ts table) :target :schema)
                                                      (-> (get ts table) :target :name))))))

(defn create-transform
  [which ts field-names {:keys [source-schema output-schema db-id]}]
  ;; todo: include database id
  (let [cte (macro source-schema which field-names)
        sql (-> (transforms which)
                (str/replace "<<CTE>>" cte)
                (replace-table-references ts source-schema))]
    {:name (format "%s transform" which)
     :description nil
     :source {:type "query"
              :query {:lib/type "mbql/query"
                      :stages [{:lib/type "mbql.stage/native"
                                :template-tags {}
                                :native sql}]
                      :database db-id}}
     :target {:type "table"
              :name (format "transformed_%s" which)
              :schema output-schema
              :database db-id}}))

(defn patch-card
  [yaml-file db-name destination-schema collection-id user-id]
  (let [card (-> (yaml/parse-string (slurp (io/resource yaml-file)))
                 (update :dataset_query (fn [query]
                                          (walk/postwalk (fn [x]
                                                           (cond (string? x)
                                                                 ({"<<db>>" db-name
                                                                   "<<destination_schema>>" destination-schema} x x)
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

(comment

  (slurp (io/resource "blueprints/salesforce/cards/customer_base_by_country.yaml"))
  )

(defn create-salesforce-transforms! [id]
  (let [db (t2/select-one :model/Database :id id)]
    (when-not (-> db :settings :blueprints :is-salesforce?)
      (throw (ex-info "Not a salesforce database" (:settings db))))
    (let [source-schema (-> db :settings :blueprints :salesforce-schema)
          output-schema (str (gensym "transform"))
          table->fields (into {}
                              (map (fn [o]
                                     (let [table-name (name o)
                                           table-id (t2/select-one-fn :id
                                                                      :model/Table
                                                                      :schema source-schema
                                                                      :name table-name)
                                           field-names (t2/select :model/Field
                                                                  :table_id table-id)]
                                       [table-name (->> field-names (map :name) sort vec)])))
                              order)
          transforms (reduce (fn [acc t]
                               (let [which (name t)
                                     transform (create-transform which
                                                                 (:transforms acc)
                                                                 (table->fields which)
                                                                 {:source-schema source-schema
                                                                  :output-schema output-schema
                                                                  :db-id id})]
                                 (-> acc
                                     (update :transforms assoc which transform)
                                     (update :sequence conj transform))))
                             {:transforms {}
                              :sequence []}
                             order)
          ts (:sequence transforms)
          response  (reduce (fn [acc t]
                              (let [t' (t2/insert-returning-instance! :model/Transform t)
                                    start-promise (promise)]
                                [(transforms.execute/run-mbql-transform! t' {:start-promise start-promise
                                                                             :run-method :manual})
                                 @start-promise]
                                (conj acc (t2/select-one :model/Table
                                                         :db_id id
                                                         :name (-> t' :target :name)
                                                         :schema (-> t' :target :schema)))))
                            []
                            ts)]
      (t2/update! :model/Database id
                  {:settings (let [table-ids (map :id response)]
                               (-> (:settings db)
                                   (assoc-in [:blueprints :blueprinted] true)
                                   (assoc-in [:blueprints :salesforce-transforms] table-ids)))})
      response)))

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
