(ns metabase.automagic-dashboards.filters
  (:require [clojure.string :as str]
            [metabase.models.field :refer [Field] :as field]
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
       (filter (fn [{:keys [base_type special_type] :as field}]
                 (or (isa? base_type :type/DateTime)
                     (isa? special_type :type/Category)
                     (field/unix-timestamp? field))))))

(defn- build-fk-map
  [tables field]
  (->> (db/select Field
         :fk_target_field_id [:not= nil]
         :table_id [:in tables])
       field/with-targets
       (filter (comp #{(:table_id field)} :table_id :target))
       (group-by :table_id)
       (keep (fn [[_ [fk & fks]]]
               ;; Bail out if there is more than one FK from the same table
               (when (empty? fks)
                 [(:table_id fk) [:fk-> (:id fk) (:id field)]])))
       (into {(:table_id field) [:field-id (:id field)]})))

(defn- filter-for-card
  [card field]
  (some->> ((:fk-map field) (:table_id card))
           (vector :dimension)))

(defn- add-filter
  [dashcard filter-id field]
  (let [mappings (->> (conj (:series dashcard) (:card dashcard))
                      (keep (fn [card]
                              (when-let [target (filter-for-card card field)]
                                {:parameter_id filter-id
                                 :target       target
                                 :card_id      (:id card)})))
                      not-empty)]
    (cond
      (nil? (:card dashcard)) dashcard
      mappings                (update dashcard :parameter_mappings concat mappings))))

(defn- filter-type
  [{:keys [base_type special_type] :as field}]
  (cond
    (isa? base_type :type/DateTime)    "date/all-options"
    (field/unix-timestamp? field)      "date/all-options"
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
   (->> dimensions
        (map #(->> %
                   (build-fk-map (keep (comp :table_id :card)
                                       (:ordered_cards dashboard)))
                   (assoc % :fk-map)))
        (reduce
         (fn [dashboard candidate]
           (let [filter-id     (-> candidate hash str)
                 dashcards     (:ordered_cards dashboard)
                 dashcards-new (map #(add-filter % filter-id candidate) dashcards)]
             ;; Only add filters that apply to all cards.
             (if (= (count dashcards) (count dashcards-new))
               (-> dashboard
                   (assoc :ordered_cards dashcards-new)
                   (update :parameters conj {:id   filter-id
                                             :type (filter-type candidate)
                                             :name (:display_name candidate)
                                             :slug (:name candidate)}))
               dashboard)))
         dashboard))))
