(ns metabase.automagic-dashboards.filters
  (:require [clojure.string :as str]
            [metabase.models
             [card :refer [Card]]
             [dashboard :as dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [field :refer [Field]]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private FieldIdForm
  [(s/one (s/constrained (s/either s/Str s/Keyword)
                         (comp #{"field-id" "fk->"} str/lower-case name))
          "head")
   s/Any])

(defn- collect-field-references
  [card]
  (->> card
       :dataset_query
       :query
       ((juxt :breakout :fields))
       (tree-seq sequential? identity)
       (remove (s/checker FieldIdForm))))

(defn- candidates-for-filtering
  [cards]
  (->> cards
       (mapcat collect-field-references)
       distinct
       (map (comp Field last))
       distinct
       (filter (fn [{:keys [base_type special_type]}]
                 (or (isa? base_type :type/DateTime)
                     (isa? special_type :type/Category))))))

(defn- find-fk
  [from-table to-field]
  (->> (db/select [Field :id :fk_target_field_id]
         :fk_target_field_id [:not= nil]
         :table_id from-table)
       (filter (comp #{(:table_id to-field)} :table_id Field :fk_target_field_id))
       (map :id)))

(defn- filter-for-card
  [card field]
  (when-let [field-reference (if (= (:table_id card) (:table_id field))
                               [:field-id (:id field)]
                               (let [fk (find-fk (:table_id card) field)]
                                 ;; Bail out if there are multiple FKs from the
                                 ;; same table.
                                 (when (= (count fk) 1)
                                   [:fk-> (first fk) (:id field)])))]
    [:dimension field-reference]))

(defn- add-filter
  [dashcard filter-id field]
  (if-let [target (-> dashcard :card_id Card (filter-for-card field))]
    (update dashcard :parameter_mappings conj
            {:parameter_id filter-id
             :card_id      (:card_id dashcard)
             :target       target})
    dashcard))

(defn- filter-type
  [{:keys [base_type special_type]}]
  (cond
    (isa? base_type :type/DateTime)    "date/all-options"
    (isa? special_type :type/State)    "location/state"
    (isa? special_type :type/Country)  "location/country"
    (isa? special_type :type/Category) "category"))

(defn add-filters!
  "Add filters to dashboard `dashboard`. Takes an optional argument `dimensions`
   which is a list of fields for which to create filters, else it tries to infer
   by which fields it would be useful to filter."
  ([dashboard]
   (add-filters! (->> (db/select-field :card_id DashboardCard
                                       :dashboard_id (:id dashboard))
                      (keep Card)
                      candidates-for-filtering)
                 dashboard))
  ([dashboard dimensions]
   (let [[parameters dashcards]
         (->> dimensions
              (reduce
               (fn [[parameters dashcards] candidate]
                 (let [filter-id     (-> candidate hash str)
                       dashcards-new (keep #(add-filter % filter-id candidate)
                                           dashcards)]
                   [(cond-> parameters
                      (not= dashcards dashcards-new)
                      (conj {:id   filter-id
                             :type (filter-type candidate)
                             :name (:display_name candidate)
                             :slug (:name candidate)}))
                    dashcards-new]))
               [(:parameters dashboard)
                (db/select DashboardCard :dashboard_id (:id dashboard))]))]
     (dashboard/update-dashcards! dashboard dashcards)
     (db/update! Dashboard (:id dashboard) :parameters parameters))))
