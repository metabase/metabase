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
  "The number of Fields matching `(where-fn ids)` of each of the Tables with `table-ids` that has any, by Table id."
  [table-ids where-fn]
  (into {}
        (map (juxt :table_id :field_count))
        (app-db/select-batched #(t2/query {:select   [:table_id [:%count.* :field_count]]
                                           :from     [(t2/table-name :model/Field)]
                                           :where    (where-fn %)
                                           :group-by [:table_id]})
                               table-ids)))

(defn- first-fields-by-table
  "The first `limit` Fields by id of each of the Tables with `table-ids` among the Fields matching `(where-fn ids)`,
  lowest id first."
  [table-ids where-fn limit]
  (vec (sort-by :id (app-db/select-batched
                     #(t2/select :model/Field
                                 {:select   [:f.*]
                                  :from     [[(t2/table-name :model/Field) :f]]
                                  :join     [[^:allow-subquery
                                              {:select [:id [[:over [[:row_number]
                                                                     ^:allow-subquery {:partition-by :table_id
                                                                                       :order-by     [[:id :asc]]}]]
                                                             :row_num]]
                                               :from   [(t2/table-name :model/Field)]
                                               :where  (where-fn %)}
                                              :ranked]
                                             [:and [:= :ranked.id :f.id] [:<= :ranked.row_num [:auto/param limit]]]]
                                  :order-by [[:f.id :asc]]})
                     table-ids))))

(defn- first-fields-after
  "The first `limit` Fields by id of those `(select-fn ids)` returns for the partitions of `table-ids`, each partition
  read with that same limit and order."
  [select-fn table-ids limit]
  (into [] (take limit) (sort-by :id (app-db/select-batched select-fn table-ids))))

(defn- base-types->descendants
  "Given a set of `base-types`, an expanded set including those types and all their descendants in the type
  hierarchy, as qualified strings so HoneySQL doesn't confuse them for columns."
  [base-types]
  (into #{}
        (comp (mapcat (fn [base-type] (cons base-type (descendants base-type))))
              (map u/qualified-name))
        base-types))

(defn- fingerprint-version-clauses
  "HoneySQL `:or` disjuncts, one per fingerprint version of `version->base-types` (a map of fingerprint version to the
  base types re-fingerprinted at it) that is older than the latest and not yet superseded, each matching the Fields
  whose `base_type`, or an ancestor of it, was re-fingerprinted at that version."
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
  "HoneySQL clause matching Fields whose fingerprint needs to be re-calculated: active, non-`PK`/no-semantic-type,
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
  "The number of Fields that [[needs-fingerprint-update-clause]] matches of each of the Tables with `table-ids` that
  has any, by Table id."
  [table-ids           :- ::table-ids
   refingerprint?      :- :boolean
   version->base-types :- ::version->base-types]
  (field-counts-by-table table-ids #(vector :and
                                            [:in :table_id [:auto/param %]]
                                            (needs-fingerprint-update-clause refingerprint? version->base-types))))

(mu/defn fields-to-fingerprint :- [:sequential (ms/InstanceOf :model/Field)]
  "The first `limit` Fields by id that [[needs-fingerprint-update-clause]] matches of each of the Tables with
  `table-ids`."
  [table-ids           :- ::table-ids
   refingerprint?      :- :boolean
   version->base-types :- ::version->base-types
   limit               :- ms/PositiveInt]
  (first-fields-by-table table-ids
                         #(vector :and
                                  [:in :table_id [:auto/param %]]
                                  (needs-fingerprint-update-clause refingerprint? version->base-types))
                         limit))

(mu/defn grown-table-ids :- [:set ::lib.schema.id/table]
  "The ids of the Tables among `table-ids` whose row count estimate is at least `factor` times the row count recorded
  in the fingerprint origin of their first fingerprinted Field, which has the oldest fingerprint of the Table: a
  new sample gives all of a Table's Fields the same origin. A Table with no estimate, or whose fingerprints recorded no
  row count, is not among them."
  [table-ids :- ::table-ids
   factor    :- pos?]
  (into #{}
        (keep (fn [{:keys [table_id fingerprint_origin estimated_row_count]}]
                (when-let [then (some-> fingerprint_origin :row-count)]
                  (when (and (pos? then) (>= estimated_row_count (* factor then)))
                    table_id))))
        (app-db/select-batched
         #(t2/select :model/Field
                     {:select [:f.table_id :f.fingerprint_origin :t.estimated_row_count]
                      :from  [[(t2/table-name :model/Field) :f]]
                      :join  [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
                      :where [:and
                              [:> :t.estimated_row_count 0]
                              [:in :f.id ^:allow-subquery {:select   [[:%min.id :id]]
                                                           :from     [(t2/table-name :model/Field)]
                                                           :where    [:and
                                                                      [:in :table_id [:auto/param %]]
                                                                      [:= :active true]
                                                                      [:not= :fingerprint_origin nil]]
                                                           :group-by [:table_id]}]]})
         table-ids)))

(mu/defn incomplete-analysis-fields :- [:sequential (ms/InstanceOf :model/Field)]
  "Up to `limit` active, visible Fields of the Tables with `table-ids` fingerprinted at `fingerprint-version` but not
  yet analyzed, lowest id first, after `after-id`."
  [table-ids           :- ::table-ids
   fingerprint-version :- :int
   after-id            :- [:int {:min 0}]
   limit               :- ms/PositiveInt]
  (first-fields-after #(t2/select :model/Field
                                  {:where    [:and
                                              [:in :table_id [:auto/param %]]
                                              [:= :active true]
                                              [:not-in :visibility_type ["sensitive" "retired"]]
                                              [:= :fingerprint_version [:auto/param fingerprint-version]]
                                              [:= :last_analyzed nil]
                                              [:> :id [:auto/param after-id]]]
                                   :order-by [[:id :asc]]
                                   :limit    limit})
                      table-ids
                      limit))

(mu/defn name-field-counts :- ::field-counts
  "The number of active, visible Fields whose semantic type is `:type/Name` of each of the Tables with `table-ids` that
  has any."
  [table-ids :- ::table-ids]
  (field-counts-by-table table-ids #(vector :and
                                            [:in :table_id [:auto/param %]]
                                            [:= :active true]
                                            [:not-in :visibility_type ["sensitive" "retired"]]
                                            [:= :semantic_type (u/qualified-name :type/Name)])))

(defn- normal-fields-clause
  "HoneySQL clause matching the active, normal-visibility Fields of the Tables with `table-ids`."
  [table-ids]
  [:and
   [:in :table_id [:auto/param table-ids]]
   [:= :active true]
   [:= :visibility_type "normal"]])

(mu/defn normal-field-counts :- ::field-counts
  "The number of active, normal-visibility Fields of each of the Tables with `table-ids` that has any."
  [table-ids :- ::table-ids]
  (field-counts-by-table table-ids normal-fields-clause))

(mu/defn normal-fields :- [:sequential (ms/InstanceOf :model/Field)]
  "The first `limit` active, normal-visibility Fields by id of each of the Tables with `table-ids`."
  [table-ids :- ::table-ids
   limit     :- ms/PositiveInt]
  (first-fields-by-table table-ids normal-fields-clause limit))

(mu/defn data-sensitivity-fields :- [:sequential (ms/InstanceOf :model/Field)]
  "Up to `limit` active, non-retired Fields of the Tables with `table-ids` the data-sensitivity classifier still has to
  scan, unlabeled or, when `rescan-public?`, labeled `PUBLIC`, without a label a user set, lowest id first, after
  `after-id`."
  [table-ids      :- ::table-ids
   rescan-public? :- :boolean
   after-id       :- [:int {:min 0}]
   limit          :- ms/PositiveInt]
  (first-fields-after #(t2/select :model/Field
                                  {:where    [:and
                                              [:in :table_id [:auto/param %]]
                                              [:= :active true]
                                              [:not= :visibility_type "retired"]
                                              (if rescan-public?
                                                [:or [:= :data_sensitivity nil] [:= :data_sensitivity "PUBLIC"]]
                                                [:= :data_sensitivity nil])
                                              [:not [:exists ^:allow-subquery {:select [1]
                                                                               :from   [[(t2/table-name :model/FieldUserSettings) :s]]
                                                                               :where  [:and
                                                                                        [:= :s.field_id :metabase_field.id]
                                                                                        [:not= :s.data_sensitivity nil]]}]]
                                              [:> :id [:auto/param after-id]]]
                                   :order-by [[:id :asc]]
                                   :limit    limit})
                      table-ids
                      limit))
