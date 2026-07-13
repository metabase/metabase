(ns metabase.indexes.reconcile
  "Reconcile Metabase-managed index requests (TableIndex rows) with the indexes physically present in the warehouse.
  Shared by the read API and the transform-run status verification: we apply an index request, then match it against
  `driver/fetch-table-indexes` to confirm it landed."
  (:require
   [metabase.driver :as driver]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private unnamed-inline-kinds
  "Index kinds with no physical name (warehouse `:name` is nil); matched by kind + key columns instead."
  #{:sortkey :order-by :distkey :clustering})

(mr/def ::match-key
  "Join key for reconciling a managed request with a warehouse index. `:kind` selects how it's matched: `:named` keys
  by `:name`; an unnamed-inline `:sortkey`/`:order-by` by `:kind` + `:key-columns`; `:distkey` also by `:style`, so the
  column-less `:even` and `:all` stay distinct."
  [:map
   [:kind :keyword]
   [:name {:optional true} [:maybe :string]]
   [:style {:optional true} [:maybe :string]]
   [:key-columns {:optional true} [:sequential [:maybe :string]]]])

(mu/defn match-key :- ::match-key
  "The [[::match-key]] for a warehouse index map (see the schema for how each kind is keyed)."
  [{:keys [kind key-columns] am :access-method nm :name} :- [:map
                                                             [:kind :keyword]
                                                             [:key-columns [:sequential [:maybe :string]]]
                                                             [:access-method {:optional true} [:maybe :string]]
                                                             [:name {:optional true} [:maybe :string]]]]
  (cond
    (= kind :distkey)                     {:kind :distkey :style am :key-columns key-columns}
    (contains? unnamed-inline-kinds kind) {:kind kind :key-columns key-columns}
    :else                                 {:kind :named :name nm}))

(mu/defn index-name :- :string
  "Physical index name for a structured def: a named kind's `:name`, else its `:kind` as a string (one inline key per
  transform)."
  [structured :- [:map
                  [:name {:optional true} [:maybe :string]]
                  [:kind [:or :keyword :string]]]]
  (or (:name structured) (name (:kind structured))))

(mu/defn managed-match-key :- ::match-key
  "The [[match-key]] for an index request, from its stored structured definition and index name."
  [{:keys [index_name structured]} :- [:map
                                       [:index_name [:maybe :string]]
                                       [:structured :map]]]
  (let [{:keys [kind style columns]} structured
        ;; only a :key distkey has a meaningful column; :all/:even ignore any stray column the form sent
        key-columns (if (and (= kind :distkey) (not= style :key)) [] (mapv :name columns))]
    (match-key {:kind          kind
                :name          index_name
                :access-method (some-> style name)
                :key-columns   key-columns})))

(defn warehouse-key-set
  "Set of [[match-key]]s for the warehouse indexes, to test managed requests against with [[present-in-warehouse?]]."
  [warehouse-maps]
  (into #{} (map match-key) warehouse-maps))

(defn present-in-warehouse?
  "Whether managed request `row`'s index is one of `present-keys` (a [[warehouse-key-set]])."
  [present-keys row]
  (contains? present-keys (managed-match-key row)))

(defn classify-index-outcomes
  "Group managed request `rows` by the lifecycle status a completed full run implies, given `present-keys`
  (a [[warehouse-key-set]] of what physically landed). An applicable request is `:succeeded` when its index is
  present, else `:failed`; a `:delete-pending` request is kept (`:delete-pending`) while its index is still present,
  and dropped (`:delete-row`) once it's gone."
  [rows present-keys]
  (group-by (fn [row]
              (let [applicable? (not= :delete-pending (:status row))
                    present?    (present-in-warehouse? present-keys row)]
                (cond
                  (and applicable? present?) :succeeded
                  applicable?                :failed
                  present?                   :delete-pending
                  :else                      :delete-row)))
            rows))

(defn- observed-fields
  "The observation fields of a warehouse `::table-index` map, snake-cased for the API."
  [wh]
  {:name              (:name wh)
   :kind              (:kind wh)
   :key_columns       (vec (:key-columns wh))
   :include_columns   (vec (:include-columns wh))
   :is_unique         (boolean (:is-unique wh))
   :is_primary        (boolean (:is-primary wh))
   :is_valid          (boolean (:is-valid wh))
   :partial_predicate (:partial-predicate wh)
   :access_method     (:access-method wh)})

(defn- declared-fields
  "A request not (yet) in the warehouse, projected from its declared `:structured` into the observation fields."
  [{:keys [structured]}]
  {:name              (:name structured)
   :kind              (:kind structured)
   :key_columns       (mapv :name (:columns structured))
   :include_columns   (vec (:include structured))
   :is_unique         (boolean (:unique structured))
   :is_primary        false
   :is_valid          false
   :partial_predicate nil
   :access_method     nil})

(defn- request-fields
  "The managed `row` carried under `:request` on an observed index -- the full request resource."
  [row]
  {:request (select-keys row [:id :transform_id :index_name :status :structured :error_message
                              :created_by :created_at :updated_at :last_executed_at])})

(mu/defn merge-indexes :- [:sequential :map]
  "Reality-first merged index list: every warehouse index, flagged `:metabase_managed` with its `:request` when a
  TableIndex `row` matches ([[match-key]]), plus any request not yet present, projected from its `:structured`."
  [rows           :- [:sequential :map]
   warehouse-maps :- [:sequential :map]]
  (let [by-key       (u/index-by managed-match-key rows)
        present-keys (warehouse-key-set warehouse-maps)
        present      (for [wh warehouse-maps
                           :let [row (get by-key (match-key wh))]]
                       (merge (observed-fields wh)
                              {:metabase_managed     (some? row)
                               :present_in_warehouse true}
                              (when row (request-fields row))))
        absent       (for [row   rows
                           :when (not (present-in-warehouse? present-keys row))]
                       (merge (declared-fields row)
                              {:metabase_managed     true
                               :present_in_warehouse false}
                              (request-fields row)))]
    (into (vec present) absent)))

(mu/defn fetch-warehouse-indexes :- [:maybe [:sequential :map]]
  "Physical indexes on `table-name` (`schema`) in `database` via `driver/fetch-table-indexes`.
  Returns `nil` if the driver can't introspect indexes or the warehouse is unreachable, so callers can distinguish
  fetch failure from a successful empty index list."
  [database   :- :map
   schema     :- [:maybe :string]
   table-name :- :string]
  (try
    (vec (driver/fetch-table-indexes (:engine database) database schema table-name))
    (catch Throwable t
      (log/warnf t "fetch-table-indexes failed for %s.%s" schema table-name)
      nil)))
