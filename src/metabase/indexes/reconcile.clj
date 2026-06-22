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
  "Index kinds with no physical name (warehouse `:name` is nil); matched by kind + key columns instead. `:distkey` is
  excluded until a driver fetches one: it stores a single `:column`, so it can't be column-keyed."
  #{:sortkey :order-by})

(mr/def ::match-key
  "Join key for reconciling a managed request with a warehouse index: a `:name` string for named kinds, else a
  `[kind key-columns]` tuple for unnamed-inline kinds."
  [:maybe [:or :string [:tuple :keyword [:sequential [:maybe :string]]]]])

(mu/defn match-key :- ::match-key
  "Join key for a warehouse index map: `[:kind key-columns]` for unnamed-inline kinds, else its `:name`. Kind
  qualifiers (e.g. a sortkey's style) are intentionally not part of the key."
  [{:keys [kind key-columns] nm :name} :- [:map
                                           [:kind :keyword]
                                           [:key-columns [:sequential [:maybe :string]]]
                                           [:name {:optional true} [:maybe :string]]]]
  (if (contains? unnamed-inline-kinds kind)
    [kind key-columns]
    nm))

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
  (match-key {:kind        (:kind structured)
              :name        index_name
              :key-columns (mapv :name (:columns structured))}))

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
        present-keys (into #{} (map match-key) warehouse-maps)
        present      (for [wh warehouse-maps
                           :let [row (get by-key (match-key wh))]]
                       (merge (observed-fields wh)
                              {:metabase_managed     (some? row)
                               :present_in_warehouse true}
                              (when row (request-fields row))))
        absent       (for [row   rows
                           :when (not (contains? present-keys (managed-match-key row)))]
                       (merge (declared-fields row)
                              {:metabase_managed     true
                               :present_in_warehouse false}
                              (request-fields row)))]
    (into (vec present) absent)))

(mu/defn fetch-warehouse-indexes :- [:sequential :map]
  "Physical indexes on `table-name` (`schema`) in `database` via `driver/fetch-table-indexes`. Returns `[]` if the
  driver can't introspect indexes or the warehouse is unreachable, so callers degrade instead of erroring."
  [database   :- :map
   schema     :- [:maybe :string]
   table-name :- :string]
  (try
    (vec (driver/fetch-table-indexes (:engine database) database schema table-name))
    (catch Throwable t
      (log/warnf t "fetch-table-indexes failed for %s.%s" schema table-name)
      [])))
