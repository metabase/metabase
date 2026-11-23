(ns metabase.analyze.db
  "Application database queries for the analysis and field values steps of sync, each over a chunk of Tables."
  (:require
   [clojure.set :as set]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::table-ids
  "The ids of a chunk of Tables."
  [:sequential {:min 1} ::lib.schema.id/table])

(mr/def ::field-counts
  "A number of Fields by Table id, for the Tables that have any."
  [:map-of ::lib.schema.id/table :int])

(defn- field-counts-by-table
  "The number of Fields matching `where` of each Table that has any, by Table id."
  [where]
  (into {}
        (map (juxt :table_id :field_count))
        (t2/query {:select   [:table_id [:%count.* :field_count]]
                   :from     [(t2/table-name :model/Field)]
                   :where    where
                   :group-by [:table_id]})))

(defn- first-fields-by-table
  "The first `limit` Fields by id of each Table among the Fields matching `where`, lowest id first."
  [where limit]
  (t2/select :model/Field
             {:select   [:f.*]
              :from     [[(t2/table-name :model/Field) :f]]
              :join     [[^:allow-subquery
                          {:select [:id [[:over [[:row_number]
                                                 ^:allow-subquery {:partition-by :table_id
                                                                   :order-by     [[:id :asc]]}]]
                                         :row_num]]
                           :from   [(t2/table-name :model/Field)]
                           :where  where}
                          :ranked]
                         [:and [:= :ranked.id :f.id] [:<= :ranked.row_num [:auto/param limit]]]]
              :order-by [[:f.id :asc]]}))

;;; ------------------------------------------------ Fingerprints ------------------------------------------------

(defn- base-types->descendants
  "Given a set of `base-types`, an expanded set including those types and all their descendants in the type
  hierarchy, as qualified strings so HoneySQL doesn't confuse them for columns."
  [base-types]
  (into #{}
        (comp (mapcat (fn [base-type] (cons base-type (descendants base-type))))
              (map u/qualified-name))
        base-types))

(defn- fingerprint-version-clauses
  "Honey SQL `:or` disjuncts, one per fingerprint version older than the latest that hasn't already been superseded,
  matching Fields whose `base_type` (or a descendant) was re-fingerprinted at that version. `version->base-types` is
  a map of fingerprint version to the set of base types re-fingerprinted at that version."
  [version->base-types]
  (let [versions+base-types (reverse (sort-by first (seq version->base-types)))
        already-seen        (atom #{})]
    (into [:or]
          (keep (fn [[version base-types]]
                  (let [not-yet-seen (set/difference (base-types->descendants base-types) @already-seen)]
                    (when (seq not-yet-seen)
                      (swap! already-seen set/union not-yet-seen)
                      [:and
                       [:< :fingerprint_version version]
                       [:in :base_type not-yet-seen]]))))
          versions+base-types)))

(def ^:private fields-to-fingerprint-base-clause
  [:and
   [:= :active true]
   [:or
    [:not (app-db/isa :semantic_type :type/PK)]
    [:= :semantic_type nil]]
   [:not-in :visibility_type ["retired" "sensitive"]]
   [:not-in :base_type (conj (app-db/type-keyword->descendants :type/fingerprint-unsupported)
                             (u/qualified-name :type/*))]])

(defn- needs-fingerprint-update-clause
  "Honey SQL clause matching Fields whose fingerprint needs to be re-calculated: active, non-`PK`/no-semantic-type,
  non-retired/sensitive-visibility, non-fingerprint-unsupported `base_type`, and, unless `refingerprint?`, without a
  fingerprint or whose fingerprint version can be updated per `version->base-types` (a map of fingerprint version to
  the set of base types that should be re-fingerprinted at that version)."
  [refingerprint? version->base-types]
  (cond-> fields-to-fingerprint-base-clause
    (not refingerprint?) (conj (fingerprint-version-clauses version->base-types))))

(mr/def ::version->base-types
  "A map of fingerprint version to the set of base types re-fingerprinted at that version."
  [:map-of :int [:set [:or :keyword :string]]])

(mu/defn fingerprint-field-counts :- ::field-counts
  "The number of Fields whose fingerprint needs to be re-calculated of each of the Tables with `table-ids` that has
  any. See [[needs-fingerprint-update-clause]] for the matching criteria."
  [table-ids           :- ::table-ids
   refingerprint?      :- :boolean
   version->base-types :- ::version->base-types]
  (field-counts-by-table [:and
                          [:in :table_id [:auto/param table-ids]]
                          (needs-fingerprint-update-clause refingerprint? version->base-types)]))

(mu/defn fields-to-fingerprint :- [:sequential (ms/InstanceOf :model/Field)]
  "The first `limit` Fields by id of each of the Tables with `table-ids` whose fingerprint needs to be re-calculated.
  See [[needs-fingerprint-update-clause]] for the matching criteria."
  [table-ids           :- ::table-ids
   refingerprint?      :- :boolean
   version->base-types :- ::version->base-types
   limit               :- ms/PositiveInt]
  (first-fields-by-table [:and
                          [:in :table_id [:auto/param table-ids]]
                          (needs-fingerprint-update-clause refingerprint? version->base-types)]
                         limit))

;;; ------------------------------------------------ Classification ------------------------------------------------

(mu/defn incomplete-analysis-fields :- [:sequential (ms/InstanceOf :model/Field)]
  "Up to `limit` active, visible Fields of the Tables with `table-ids` fingerprinted at `fingerprint-version` but not yet
  analyzed, lowest id first, after `after-id`."
  [table-ids           :- ::table-ids
   fingerprint-version :- :int
   after-id            :- [:int {:min 0}]
   limit               :- ms/PositiveInt]
  (t2/select :model/Field
             {:where    [:and
                         [:in :table_id [:auto/param table-ids]]
                         [:= :active true]
                         [:not-in :visibility_type ["sensitive" "retired"]]
                         [:= :fingerprint_version [:auto/param fingerprint-version]]
                         [:= :last_analyzed nil]
                         [:> :id [:auto/param after-id]]]
              :order-by [[:id :asc]]
              :limit    limit}))

(mu/defn name-field-counts :- ::field-counts
  "The number of active, visible Fields whose semantic type is `:type/Name` of each of the Tables with `table-ids` that
  has any."
  [table-ids :- ::table-ids]
  (field-counts-by-table [:and
                          [:in :table_id [:auto/param table-ids]]
                          [:= :active true]
                          [:not-in :visibility_type ["sensitive" "retired"]]
                          [:= :semantic_type (u/qualified-name :type/Name)]]))

;;; ------------------------------------------------ Field values ------------------------------------------------

(defn- normal-fields-clause
  "Honey SQL clause matching the active, normal-visibility Fields of the Tables with `table-ids`."
  [table-ids]
  [:and
   [:in :table_id [:auto/param table-ids]]
   [:= :active true]
   [:= :visibility_type "normal"]])

(mu/defn normal-field-counts :- ::field-counts
  "The number of active, normal-visibility Fields of each of the Tables with `table-ids` that has any."
  [table-ids :- ::table-ids]
  (field-counts-by-table (normal-fields-clause table-ids)))

(mu/defn normal-fields :- [:sequential (ms/InstanceOf :model/Field)]
  "The first `limit` active, normal-visibility Fields by id of each of the Tables with `table-ids`."
  [table-ids :- ::table-ids
   limit     :- ms/PositiveInt]
  (first-fields-by-table (normal-fields-clause table-ids) limit))
