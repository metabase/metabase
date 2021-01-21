(ns metabase.test.generate
  "Facilities for generating random instances of our various models."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.models :refer [Activity Card Dashboard DashboardCard User Collection Pulse PulseCard Database Table Field Metric
                            FieldValues Dimension MetricImportantField PermissionsGroup Permissions PermissionsGroupMembership
]]
   [metabase.test :as mt]
   [methodical.core :as m]
   [toucan.db :as db]
   [toucan.util.test :as tt]))

(declare create-random!)


(def ^:dynamic *max-children*
  "Max number of child entities to generate from each entity."
  4)

(def ^:dynamic *current-user* nil)

(defn children
  "Picks at random the number of children to generate, between 0 and `max-children`."
  []
  (rand-int *max-children*))

(defn- ^:dynamic coin-toss?
  "Chances of adding a non-required attribute/filter"
  []
  (zero? (rand-int 2)))

(defn- random-uppercase-letter []
  (char (+ (int \A) (rand-int 26))))

(defn- random-name
  "Generate a random string of 20 uppercase letters."
  []
  (str/join (repeatedly 20 random-uppercase-letter)))

;;; create-random!*
(m/defmulti create-random!*
  {:arglists '([model property-overrides])}
  (fn [model _]
    (class model)))

(m/defmethod create-random!* :before :default
  [model property-overrides]
  property-overrides)


(m/defmethod create-random!* :default
  [model property-overrides]
  (let [properties (merge (tt/with-temp-defaults model)
                          property-overrides)]
    (db/insert! model properties)))

;;; create-random!* before/after modifiers

(defn- random-query []
  (cond-> (mt/mbql-query venues)
    ;; 50% chance to add an aggregation
    (coin-toss?) (assoc-in [:query :aggregation] [[:count]])
    ;; 50% chance to add a filter on `price`
    (coin-toss?) (assoc-in [:query :filter] [:=
                                             [:field-id (mt/id :venues :price)]
                                             (inc (rand-int 4))])))


(m/defmethod create-random!* :before (class Card)
  [_ property-overrides]
  (merge {:dataset_query (random-query)}
         property-overrides))

(m/defmethod create-random!* :after (class Card)
  [_ card]
  card)

(m/defmethod create-random!* :before (class Activity)
  [_ property-overrides]
  (cond-> {}
    (coin-toss?) (assoc :user_id (:id (create-random! User)))
    (coin-toss?) (assoc :table_id (rand-int 5))
    (coin-toss?) (assoc :details (random-name))
    true (merge property-overrides)))


(m/defmethod create-random!* :before (class Field)
  [_ property-overrides]
  (let [base-types ["type/BigInteger" "type/Text" "type/Float"]
        names ["STATE", "Subtotal", "Name", "Age"]]
    (cond-> {}
      (coin-toss?) (assoc :base_type (rand-nth base-types))
      (coin-toss?) (assoc :name (rand-nth names))
     true (merge property-overrides))))

(m/defmethod create-random!* :after (class Field)
  [_ field]
  (dotimes [_ (children)]
    (create-random!* FieldValues {:field_id (:id field)}))

  (dotimes [_ (children)]
    (create-random!* Dimension {:field_id (:id field)}))
  field)

(m/defmethod create-random!* :after (class Table)
  [_ table]
  (dotimes [_ (children)]
    (let [field (create-random!* Field {:table_id (:id table)})
          metric (create-random!* Metric {:table_id (:id table)
                                          :creator_id (:id *current-user*)})]
      (when (coin-toss?)
        (create-random!* MetricImportantField
                         {:metric_id (:id metric), :field_id (:id field)}))))
  table)


(m/defmethod create-random!* :after (class Database)
  [_ database]
  (dotimes [_ (children)]
    (create-random!* Table {:db_id (:id database)}))
  database)

(m/defmethod create-random!* :after (class Dashboard)
  [_ dashboard]
  (dotimes [_ (children)]
    (let [card (create-random!* Card {:creator_id (:id *current-user*)})]
      (println "Creating random Card with query" (pr-str (:dataset_query card)))
      (create-random!* DashboardCard {:dashboard_id (:id dashboard), :card_id (:id card)})))
  dashboard)

(m/defmethod create-random!* :after (class DashboardCard)
  [_ dcard]
  (when (coin-toss?)
    (create-random!* PulseCard {:pulse_id (:id (create-random!* Pulse {:creator_id (:id *current-user*)}))
                                :dashboard_card_id (:id dcard)
                                :card_id (:card_id dcard)}))
  dcard)

(m/defmethod create-random!* :after (class User)
  [_ user]
  (when (coin-toss?)
    (create-random!* Collection {:personal_owner_id (:id user)}))
  (dotimes [_ (children)]
    (create-random!* Activity {:user_id (:id user)
                               :topic (random-name)}))
  (when (coin-toss?)
    (create-random!* PermissionsGroupMembership
                     {:user_id (:id user)
                      :group_id (:id (create-random!* PermissionsGroup {:name (random-name)}))}))
  user)

(m/defmethod create-random!* :after (class Collection)
  [_ collection]
  (dotimes [_ (children)]
    (create-random!* Pulse {:creator_id (or (:personal_owner_id collection)
                                            (:id (first (db/select User {:limit 1}))))
                            :collection_id (:id collection)}))

  (when (coin-toss?)
    (create-random!* Collection
                     {:location (str (or (:location collection) "/")
                                     (:id collection)
                                     "/")
                      }))
  collection)

(defn create-random!
  {:arglists '([model] [n model] [model property-overrides] [n model property-overrides])}
  ([model]
   (create-random!* model nil))
  ([x y]
   (if (integer? x)
     (create-random! x y nil)
     (create-random!* x y)))
  ([n model property-overrides]
   (vec (for [_ (range n)]
          (create-random!* model property-overrides)))))

(defn generate-data! []
  (let [entities [Card Dashboard DashboardCard Collection Pulse Database Table Field PulseCard Metric
                  FieldValues Dimension MetricImportantField Activity]]
    (mt/with-model-cleanup entities
      (binding [*current-user* (create-random! User)]
        (let [dash (create-random! Dashboard {:creator_id (:id *current-user*)})
              database (create-random! Database)
              collections (dotimes [_ (children)] (create-random! Collection {:location "/"}))]
          (doseq [e entities]
            (printf "created %s: %d\n" (name e) (db/count e)))
          dash)))))
