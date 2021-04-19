(ns metabase.automagic-dashboards.filters
  (:require [metabase.mbql.normalize :as normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :as field :refer [Field]]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^{:arglists '([form])} field-reference?
  "Is given form an MBQL field reference?"
  (complement (s/checker mbql.s/field)))

(defn field-reference->id
  "Extract field ID from a given field reference form."
  [clause]
  (mbql.u/match-one clause [:field id _] id))

(defn collect-field-references
  "Collect all `:field` references from a given
   form."
  [form]
  (->> form
       (tree-seq (every-pred (some-fn sequential? map?)
                             (complement field-reference?))
                 identity)
       (filter field-reference?)))

;; TODO — this function name is inaccurate, rename to `temporal?`
(defn datetime?
  "Does `field` represent a temporal value, i.e. a date, time, or datetime?"
  [field]
  (and (not ((disj u.date/extract-units :year) (:unit field)))
       (or (isa? (:base_type field) :type/Temporal)
           (field/unix-timestamp? field))))

(defn- interestingness
  [{:keys [base_type semantic_type fingerprint] :as field}]
  (cond-> 0
    (some-> fingerprint :global :distinct-count (< 10)) inc
    (some-> fingerprint :global :distinct-count (> 20)) dec
    ((descendants :type/Category) semantic_type)        inc
    (field/unix-timestamp? field)                       inc
    (isa? base_type :type/Temporal)                     inc
    ((descendants :type/Temporal) semantic_type)        inc
    (isa? semantic_type :type/CreationTimestamp)        inc
    (#{:type/State :type/Country} semantic_type)        inc))

(defn- interleave-all
  [& colls]
  (lazy-seq
   (when-not (empty? colls)
     (concat (map first colls) (apply interleave-all (keep (comp seq rest) colls))))))

(defn- sort-by-interestingness
  [fields]
  (->> fields
       (map #(assoc % :interestingness (interestingness %)))
       (sort-by interestingness >)
       (partition-by :interestingness)
       (mapcat (fn [fields]
                 (->> fields
                      (group-by (juxt :base_type :semantic_type))
                      vals
                      (apply interleave-all))))))

(defn interesting-fields
  "Pick out interesting fields and sort them by interestingness."
  [fields]
  (->> fields
       (filter (fn [{:keys [semantic_type] :as field}]
                 (or (datetime? field)
                     (isa? semantic_type :type/Category))))
       sort-by-interestingness))

(defn- candidates-for-filtering
  [fieldset cards]
  (->> cards
       (mapcat collect-field-references)
       (map field-reference->id)
       distinct
       (map fieldset)
       interesting-fields))

(defn- build-fk-map
  [fks field]
  (if (:id field)
    (->> fks
         (filter (comp #{(:table_id field)} :table_id :target))
         (group-by :table_id)
         (keep (fn [[_ [fk & fks]]]
                 ;; Bail out if there is more than one FK from the same table
                 (when (empty? fks)
                   [(:table_id fk) [:field (u/the-id field) {:source-field (u/the-id fk)}]])))
         (into {(:table_id field) [:field (u/the-id field) nil]}))
    (constantly [:field (:name field) {:base-type (:base_type field)}])))

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
  [{:keys [base_type semantic_type] :as field}]
  (cond
    (datetime? field)                   "date/all-options"
    (isa? semantic_type :type/State)    "location/state"
    (isa? semantic_type :type/Country)  "location/country"
    (isa? semantic_type :type/Category) "category"))

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
        (candidates-for-filtering (->> dashboard
                                       :context
                                       :tables
                                       (mapcat :fields)
                                       (map (fn [field]
                                              [((some-fn :id :name) field) field]))
                                       (into {})))
        (add-filters dashboard max-filters)))
  ([dashboard dimensions max-filters]
   (let [fks (->> (db/select Field
                    :fk_target_field_id [:not= nil]
                    :table_id [:in (keep (comp :table_id :card) (:ordered_cards dashboard))])
                  field/with-targets)]
     (->> dimensions
          remove-unqualified
          sort-by-interestingness
          (take max-filters)
          (reduce
           (fn [dashboard candidate]
             (let [filter-id     (-> candidate ((juxt :id :name :unit)) hash str)
                   candidate     (assoc candidate :fk-map (build-fk-map fks candidate))
                   dashcards     (:ordered_cards dashboard)
                   dashcards-new (keep #(add-filter % filter-id candidate) dashcards)]
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


(defn- flatten-filter-clause
  "Returns a sequence of filter subclauses making up `filter-clause` by flattening `:and` compound filters.

    (flatten-filter-clause [:and
                            [:= [:field 1 nil] 2]
                            [:and
                             [:= [:field 3 nil] 4]
                             [:= [:field 5 nil] 6]]])
    ;; -> ([:= [:field 1 nil] 2]
           [:= [:field 3 nil] 4]
           [:= [:field 5 nil] 6])"
  [[clause-name, :as filter-clause]]
  (when (seq filter-clause)
    (if (= clause-name :and)
      (rest (mbql.u/simplify-compound-filter filter-clause))
      [filter-clause])))

(defn inject-refinement
  "Inject a filter refinement into an MBQL filter clause, returning a new filter clause.

  There are two reasons why we want to do this: 1) to reduce visual noise when we display applied filters; and 2) some
  DBs don't do this optimization or even protest (eg. GA) if there are duplicate clauses.

  Assumes that any refinement sub-clauses referencing fields that are also referenced in the main clause are subsets
  of the latter. Therefore we can rewrite the combined clause to ommit the more broad version from the main clause.
  Assumes both filter clauses can be flattened by recursively merging `:and` claueses
  (ie. no `:and`s inside `:or` or `:not`)."
  [filter-clause refinement]
  (let [in-refinement?   (into #{}
                               (map collect-field-references)
                               (flatten-filter-clause refinement))
        existing-filters (->> filter-clause
                              flatten-filter-clause
                              (remove (comp in-refinement? collect-field-references)))]
    (if (seq existing-filters)
      ;; since the filters are programatically generated they won't have passed thru normalization, so make sure we
      ;; normalize them before passing them to `combine-filter-clauses`, which validates its input
      (apply mbql.u/combine-filter-clauses (map (partial normalize/normalize-fragment [:query :filter])
                                                (cons refinement existing-filters)))
      refinement)))
