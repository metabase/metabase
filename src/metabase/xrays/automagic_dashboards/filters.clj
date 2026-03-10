(ns metabase.xrays.automagic-dashboards.filters
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.schema :as lib.schema]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [metabase.xrays.automagic-dashboards.util :as magic.util]
   [toucan2.core :as t2]))

(defn- temporal?
  "Does `field` represent a temporal value, i.e. a date, time, or datetime?"
  [{base-type :base_type, effective-type :effective_type, unit :unit}]
  ;; Excluding :year because it's (currently) both an extraction and truncation unit.
  ;; For the purposes of this check, :year is an interesting :unit which yields a time interval, not just a number.
  (and (not ((disj u.date/extract-units :year) unit))
       (isa? (or effective-type base-type) :type/Temporal)))

(defn- interestingness
  [{base-type :base_type, effective-type :effective_type, semantic-type :semantic_type, :keys [fingerprint]}]
  (cond-> 0
    (some-> fingerprint :global :distinct-count (< 10)) inc
    (some-> fingerprint :global :distinct-count (> 20)) dec
    ((descendants :type/Category) semantic-type)        inc
    (isa? (or effective-type base-type) :type/Temporal) inc
    ((descendants :type/Temporal) semantic-type)        inc
    (isa? semantic-type :type/CreationTimestamp)        inc
    (#{:type/State :type/Country} semantic-type)        inc))

(defn- interleave-all
  [& colls]
  (lazy-seq
   (when (seq colls)
     (concat (map first colls) (apply interleave-all (keep (comp seq rest) colls))))))

(defn- sort-by-interestingness
  [fields]
  (->> fields
       (map #(assoc % :interestingness (interestingness %)))
       (sort-by :interestingness >)
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
       (filter (fn [{:keys [base_type effective_type semantic_type] :as field}]
                 (or (temporal? field)
                     (isa? (or effective_type base_type) :type/Boolean)
                     (isa? semantic_type :type/Category))))
       sort-by-interestingness))

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
  (when-let [field-ref ((:fk-map field) (:table_id card))]
    [:dimension field-ref {:stage-number 0}]))

(defn- add-filter
  [dashcard filter-id field]
  (let [mappings (->> (conj (:series dashcard) (:card dashcard))
                      (keep (mu/fn [card :- [:maybe ::ads/card]]
                              (when-let [target (filter-for-card card field)]
                                {:parameter_id filter-id
                                 :target       target
                                 :card_id      (:id card)})))
                      not-empty)]
    (cond
      (nil? (:card dashcard)) dashcard
      mappings                (update dashcard :parameter_mappings concat mappings))))

(defn- filter-type-info
  "Return parameter type and section id for a given field."
  [{:keys [effective_type semantic_type] :as _field}]
  (cond
    (or (isa? effective_type :type/Date) (isa? effective_type :type/DateTime))
    {:type "date/all-options"
     :sectionId "date"}

    (or (isa? effective_type :type/Text) (isa? effective_type :type/TextLike))
    {:type "string/="
     :sectionId (if (isa? semantic_type :type/Address) "location" "string")}

    (isa? effective_type :type/Number)
    (if (or (isa? semantic_type :type/PK) (isa? semantic_type :type/FK))
      {:type "id"
       :sectionId "id"}
      {:type "number/="
       :sectionId "number"})

    ;; TODO this needs to be `boolean/=` once we introduce boolean parameters in #57435
    (isa? effective_type :type/Boolean)
    {:type "string/="
     :sectionId "string"}))

(def ^:private ^{:arglists '([dimensions])} remove-unqualified
  (partial remove (fn [{:keys [fingerprint]}]
                    (some-> fingerprint :global :distinct-count (< 2)))))

(mu/defn add-filters
  "Add up to `max-filters` filters to dashboard `dashboard`. The `dimensions` argument is a list of fields for which to
  create filters."
  [dashboard :- ::ads/dashboard
   dimensions
   max-filters]
  (let [fks (when-let [table-ids (not-empty (set (keep (comp :table_id :card)
                                                       (:dashcards dashboard))))]
              (field/with-targets (t2/select :model/Field
                                             :fk_target_field_id [:not= nil]
                                             :table_id [:in table-ids])))]
    (->> dimensions
         remove-unqualified
         sort-by-interestingness
         (take max-filters)
         (reduce
          (fn [dashboard candidate]
            (let [filter-id     (magic.util/filter-id-for-field candidate)
                  candidate     (assoc candidate :fk-map (build-fk-map fks candidate))
                  dashcards     (:dashcards dashboard)
                  dashcards-new (keep #(add-filter % filter-id candidate) dashcards)
                  filter-info   (filter-type-info candidate)]
              ;; Only add filters that apply to all cards and when we have a parameter type for the field
              (if (and (= (count dashcards) (count dashcards-new)) (some? filter-info))
                (-> dashboard
                    (assoc :dashcards dashcards-new)
                    (update :parameters conj (merge {:id   filter-id
                                                     :name (:display_name candidate)
                                                     :slug (:name candidate)}
                                                    filter-info)))
                dashboard)))
          dashboard))))

(mu/defn inject-refinement :- [:maybe ::lib.schema/filters]
  "Inject a filter refinement into an MBQL filter clause, returning a new filter clause.

  There are two reasons why we want to do this: 1) to reduce visual noise when we display applied filters; and 2) some
  DBs don't do this optimization or even protest (eg. GA) if there are duplicate clauses.

  Assumes that any refinement sub-clauses referencing fields that are also referenced in the main clause are subsets
  of the latter. Therefore we can rewrite the combined clause to omit the more broad version from the main clause.
  Assumes both filter clauses can be flattened by recursively merging `:and` claueses
  (ie. no `:and`s inside `:or` or `:not`)."
  [filter-clauses :- [:maybe ::lib.schema/filters]
   refinement     :- [:maybe vector?]]
  (if (some? refinement)
    ;; normalize refinement since it's read from the YAML files or whatever
    (let [refinement        (lib/normalize refinement)
          ;; TODO (Cam 10/21/2025) -- HACK -- I wanted to use [[lib/filter-parts]] for this but we need to pass in
          ;; query as part of this. Maybe we can refactor this code so we can use that, or just add a new function to
          ;; see if we have existing filters against a column.
          refinement-column (nth refinement 2)
          ;; remove any existing filters against the column in the refinement filter.
          filter-clauses'   (into []
                                  (remove (fn [a-filter]
                                            (lib.equality/= (nth a-filter 2) refinement-column)))
                                  (lib/simplify-filters filter-clauses))]
      (lib/simplify-filters (conj filter-clauses' refinement)))
    filter-clauses))
