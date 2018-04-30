(ns metabase.automagic-dashboards.filters
  (:require [clojure.string :as str]
            [clj-time.format :as t.format]
            [metabase.models
             [field :refer [Field] :as field]
             [table :refer [Table]]]
            [metabase.query-processor.util :as qp.util]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private FieldReference
  [(s/one (s/constrained su/KeywordOrString
                         (comp #{:field-id :fk-> :field-literal} qp.util/normalize-token))
          "head")
   s/Any])

(def ^:private ^{:arglists '([form])} field-reference?
  "Is given form an MBQL field reference?"
  (complement (s/checker FieldReference)))

(defmulti
  ^{:doc "Extract field ID from a given field reference form."
    :arglists '([op & args])}
  field-reference->id (comp qp.util/normalize-token first))

(defmethod field-reference->id :field-id
  [[_ id]]
  id)

(defmethod field-reference->id :fk->
  [[_ _ id]]
  id)

(defmethod field-reference->id :field-literal
  [[_ name _]]
  name)

(defn collect-field-references
  "Collect all field references (`[:field-id]` or `[:fk->]` forms) from a given form."
  [form]
  (->> form
       (tree-seq (some-fn sequential? map?) identity)
       (filter field-reference?)))

(def ^:private ^{:arglists '([field])} periodic-datetime?
  (comp #{:minute-of-hour :hour-of-day :day-of-week :day-of-month :day-of-year :week-of-year
          :month-of-year :quarter-of-year}
        :unit))

(defn- datetime?
  [field]
  (and (not (periodic-datetime? field))
       (or (isa? (:base_type field) :type/DateTime)
           (field/unix-timestamp? field))))

(defn- candidates-for-filtering
  [fieldset cards]
  (->> cards
       (mapcat collect-field-references)
       (map field-reference->id)
       distinct
       (map fieldset)
       (filter (fn [{:keys [special_type] :as field}]
                 (or (datetime? field)
                     (isa? special_type :type/Category))))))

(defn- build-fk-map
  [fks field]
  (if (:id field)
    (->> fks
         (filter (comp #{(:table_id field)} :table_id :target))
         (group-by :table_id)
         (keep (fn [[_ [fk & fks]]]
                 ;; Bail out if there is more than one FK from the same table
                 (when (empty? fks)
                   [(:table_id fk) [:fk-> (u/get-id fk) (u/get-id field)]])))
         (into {(:table_id field) [:field-id (u/get-id field)]}))
    (constantly [:field-literal (:name field) (:base_type field)])))

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
  "Return filter type for a given field."
  [{:keys [base_type special_type] :as field}]
  (cond
    (datetime? field)                  "date/all-options"
    (isa? special_type :type/State)    "location/state"
    (isa? special_type :type/Country)  "location/country"
    (isa? special_type :type/Category) "category"))

(defn- score
  [{:keys [base_type special_type fingerprint] :as field}]
  (cond-> 0
    (some-> fingerprint :global :distinct-count (< 10)) inc
    (some-> fingerprint :global :distinct-count (> 20)) dec
    ((descendants :type/Category) special_type)         inc
    (field/unix-timestamp? field)                       inc
    (isa? base_type :type/DateTime)                     inc
    ((descendants :type/DateTime) special_type)         inc
    (isa? special_type :type/CreationTimestamp)         inc
    (#{:type/State :type/Country} special_type)         inc))

(def ^:private ^{:arglists '([dimensions])} remove-unqualified
  (partial remove (fn [{:keys [fingerprint]}]
                    (some-> fingerprint :global :distinct-count (< 2)))))

(defn add-filters
  "Add up to `max-filters` filters to dashboard `dashboard`. Takes an optional
   argument `dimensions` which is a list of fields for which to create filters, else
   it tries to infer by which fields it would be useful to filter."
  ([dashboard max-filters]
   (->> dashboard
        :orderd_cards
        (candidates-for-filtering (:fieldset dashboard))
        (add-filters dashboard max-filters)))
  ([dashboard dimensions max-filters]
   (let [fks (->> (db/select Field
                    :fk_target_field_id [:not= nil]
                    :table_id [:in (keep (comp :table_id :card) (:ordered_cards dashboard))])
                  field/with-targets)]
     (->> dimensions
          remove-unqualified
          (sort-by score >)
          (take max-filters)
          (map #(assoc % :fk-map (build-fk-map fks %)))
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
           dashboard)))))


(def ^:private date-formatter (t.format/formatter "MMMM d, YYYY"))
(def ^:private datetime-formatter (t.format/formatter "EEEE, MMMM d, YYYY h:mm a"))

(defn- humanize-datetime
  [dt]
  (t.format/unparse (if (str/index-of dt "T")
                      datetime-formatter
                      date-formatter)
                    (t.format/parse dt)))

(defn- field-reference->field
  [fieldset field-reference]
  (cond-> (-> field-reference collect-field-references first field-reference->id fieldset)
    (-> field-reference first qp.util/normalize-token (= :datetime-field))
    (assoc :unit (-> field-reference last qp.util/normalize-token))))

(defmulti
  ^{:private true
    :arglists '([fieldset [op & args]])}
  humanize-filter-value (fn [_ [op & args]]
                          (qp.util/normalize-token op)))

(defn- either
  [v & vs]
  (if (empty? vs)
    v
    (loop [acc      (format "either %s" v)
           [v & vs] vs]
      (cond
        (nil? v)    acc
        (empty? vs) (format "%s or %s" acc v)
        :else       (recur (format "%s, %s" acc v) vs)))))

(defmethod humanize-filter-value :=
  [fieldset [_ field-reference value & values]]
  (let [field (field-reference->field fieldset field-reference)]
    [{:field field-reference
      :value (if (datetime? field)
               (format "is on %s" (humanize-datetime value))
               (format "is %s" (apply either value values)))}]))

(defmethod humanize-filter-value :!=
  [fieldset [_ field-reference value & values]]
  (let [field (field-reference->field fieldset field-reference)]
    [{:field field-reference
      :value (if (datetime? field)
               (format "is not on %s" (humanize-datetime value))
               (format "is not %s" (apply either value values)))}]))

(defmethod humanize-filter-value :>
  [fieldset [_ field-reference value]]
  (let [field (field-reference->field fieldset field-reference)]
    [{:field field-reference
      :value (if (datetime? field)
               (format "is after %s" (humanize-datetime value))
               (format "is greater than %s" value))}]))

(defmethod humanize-filter-value :<
  [fieldset [_ field-reference value]]
  (let [field (field-reference->field fieldset field-reference)]
  [{:field field-reference
    :value (if (datetime? field)
             (format "is before %s" (humanize-datetime value))
             (format "is less than %s" value))}]))

(defmethod humanize-filter-value :>=
  [_ [_ field-reference value]]
  [{:field field-reference
    :value (format "is greater than or equal to %s" value)}])

(defmethod humanize-filter-value :<=
  [_ [_ field-reference value]]
  [_ {:field field-reference
    :value (format "is less than or equal to %s" value)}])

(defmethod humanize-filter-value :is-null
  [_ [_ field-reference]]
  [{:field field-reference
    :value "is null"}])

(defmethod humanize-filter-value :not-null
  [_ [_ field-reference]]
  [{:field field-reference
    :value "is not null"}])

(defmethod humanize-filter-value :between
  [_ [_ field-reference min-value max-value]]
  [{:field field-reference
    :value (format "is between %s and %s" min-value max-value)}])

(defmethod humanize-filter-value :inside
  [_ [_ lat-reference lon-reference lat-max lon-min lat-min lon-max]]
  [{:field lat-reference
    :value (format "is between %s and %s" lat-min lat-max)}
   {:field lon-reference
    :value (format "is between %s and %s" lon-min lon-max)}])

(defmethod humanize-filter-value :starts-with
  [_ [_ field-reference value]]
  [{:field field-reference
    :value (format "starts with %s" value)}])

(defmethod humanize-filter-value :contains
  [_ [_ field-reference value]]
  [{:field field-reference
    :value (format "contains %s" value)}])

(defmethod humanize-filter-value :does-not-contain
  [_ [_ field-reference value]]
  [{:field field-reference
    :value (format "does not contain %s" value)}])

(defmethod humanize-filter-value :ends-with
  [_ [_ field-reference value]]
  [{:field field-reference
    :value (format "ends with %s" value)}])

(defn- time-interval
  [n unit]
  (let [unit (name unit)]
    (cond
      (zero? n) (format "current %s" unit)
      (= n -1)  (format "previous %s" unit)
      (= n 1)   (format "next %s" unit)
      (pos? n)  (format "next %s %ss" n unit)
      (neg? n)  (format "previous %s %ss" n unit))))

(defmethod humanize-filter-value :time-interval
  [_ [_ field-reference n unit]]
  [{:field field-reference
    :value (format "is during the %s" (time-interval n unit))}])

(defmethod humanize-filter-value :and
  [fieldset [_ & clauses]]
  (mapcat (partial humanize-filter-value fieldset) clauses))

(def ^:private unit-name (comp {:minute-of-hour  "minute of hour"
                                :hour-of-day     "hour of day"
                                :day-of-week     "day of week"
                                :day-of-month    "day of month"
                                :week-of-year    "week of year"
                                :month-of-year   "month of year"
                                :quarter-of-year "quarter of year"}
                               qp.util/normalize-token))

(defn- field-name
  [field field-reference]
  (let [full-name (cond->> (:display_name field)
                    (periodic-datetime? field)
                    (format "%s of %s" (-> field :unit unit-name str/capitalize)))]
    (if (-> field-reference first qp.util/normalize-token (= :fk->))
      [(-> field :table_id Table :display_name) full-name]
      [full-name])))

(defn applied-filters
  "Extract fields and their values from MBQL filter clauses."
  [fieldset filter-clause]
  (for [{field-reference :field value :value} (some->> filter-clause
                                                       not-empty
                                                       (humanize-filter-value fieldset))]
    (let [field (field-reference->field fieldset field-reference)]
      {:field    (field-name field field-reference)
       :field_id (:id field)
       :type     (filter-type field)
       :value    value})))
