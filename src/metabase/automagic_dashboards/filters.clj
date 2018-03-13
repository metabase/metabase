(ns metabase.automagic-dashboards.filters
  (:require [clojure.string :as str]
            [metabase.models.field :refer [Field]]
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
       (remove (s/checker FieldIdForm))
       (map last)))

(defn- candidates-for-filtering
  [cards]
  (->> cards
       (mapcat collect-field-references)
       distinct
       (map Field)
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
  (some->> (if (= (:table_id card) (:table_id field))
             [:field-id (:id field)]
             (let [fk (find-fk (:table_id card) field)]
               ;; Bail out if there are multiple FKs from the same table.
               (when (= (count fk) 1)
                 [:fk-> (first fk) (:id field)])))
           (vector :dimension)))

(defn- add-filter
  [dashcard filter-id field]
  (if-let [targets (->> (conj (:series dashcard) (:card dashcard))
                        (keep (fn [card]
                                (some-> card
                                        (filter-for-card field)
                                        (vector card))))
                        not-empty)]
    (update dashcard :parameter_mappings concat (for [[target card] targets]
                                                  {:parameter_id filter-id
                                                   :target       target
                                                   :card_id      (:id card)}))
    dashcard))

(defn- filter-type
  [{:keys [base_type special_type]}]
  (cond
    (isa? base_type :type/DateTime)    "date/all-options"
    (isa? special_type :type/State)    "location/state"
    (isa? special_type :type/Country)  "location/country"
    (isa? special_type :type/Category) "category"))

(defn add-filters
  "Add filters to dashboard `dashboard`. Takes an optional argument `dimensions`
   which is a list of fields for which to create filters, else it tries to infer
   by which fields it would be useful to filter."
  ([dashboard]
   (add-filters dashboard (-> dashboard :orderd_cards candidates-for-filtering)))
  ([dashboard dimensions]
   (reduce
    (fn [dashboard candidate]
      (let [filter-id     (-> candidate hash str)
            dashcards     (:ordered_cards dashboard)
            dashcards-new (map #(add-filter % filter-id candidate) dashcards)]
        (cond-> dashboard
          (not= dashcards dashcards-new)
          (-> (assoc :ordered_cards dashcards-new)
              (update :parameters conj {:id   filter-id
                                        :type (filter-type candidate)
                                        :name (:display_name candidate)
                                        :slug (:name candidate)})))))
    dashboard
    dimensions)))
