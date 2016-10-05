(ns metabase.models.card
  (:require [clojure.core.memoize :as memoize]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.db :as db]
            (metabase.models [card-label :refer [CardLabel]]
                             [dependency :as dependency]
                             [interface :as i]
                             [label :refer [Label]]
                             [permissions :as perms]
                             [revision :as revision]
                             [user :as user])
            [metabase.query :as q]
            [metabase.query-processor :as qp]
            [metabase.query-processor.permissions :as qp-perms]
            [metabase.util :as u]))


(i/defentity Card :report_card)


;;; ------------------------------------------------------------ Hydration ------------------------------------------------------------

(defn dashboard-count
  "Return the number of Dashboards this Card is in."
  {:hydrate :dashboard_count}
  [{:keys [id]}]
  (db/select-one-count 'DashboardCard, :card_id id))

(defn labels
  "Return `Labels` for CARD."
  {:hydrate :labels}
  [{:keys [id]}]
  (if-let [label-ids (seq (db/select-field :label_id CardLabel, :card_id id))]
    (db/select Label, :id [:in label-ids], {:order-by [:%lower.name]})
    []))


;;; ------------------------------------------------------------ Permissions Checking ------------------------------------------------------------

(defn- permissions-path-set:mbql [{database-id :database, :as query}]
  {:pre [(integer? database-id) (map? (:query query))]}
  (try (let [{{:keys [source-table join-tables]} :query} (qp/expand query)]
         (set (for [table (cons source-table join-tables)]
                (perms/object-path database-id
                                   (:schema table)
                                   (or (:id table) (:table-id table))))))
       ;; if for some reason we can't expand the Card (i.e. it's an invalid legacy card)
       ;; just return a set of permissions that means no one will ever get to see it
       (catch Throwable e
         (log/warn "Error getting permissions for card:" (.getMessage e) "\n" (u/pprint-to-str (u/filtered-stacktrace e)))
         #{"/db/0/"}))) ; DB 0 will never exist

(defn- permissions-path-set:native [read-or-write {database-id :database}]
  #{((case read-or-write
       :read  perms/native-read-path
       :write perms/native-readwrite-path) database-id)})

;; it takes a lot of DB calls and function calls to expand/resolve a query, and since they're pure functions we can save ourselves some a lot of DB calls
;; by caching the results. Cache the permissions reqquired to run a given query dictionary for up to 6 hours
(defn- query-perms-set* [{query-type :type, :as query} read-or-write]
  (cond
    (= query {})                     #{}
    (= (keyword query-type) :native) (permissions-path-set:native read-or-write query)
    (= (keyword query-type) :query)  (permissions-path-set:mbql query)
    :else                            (throw (Exception. (str "Invalid query type: " query-type)))))

(def ^{:arglists '([query read-or-write])} query-perms-set
  "Return a set of required permissions for *running* QUERY (if READ-OR-WRITE is `:read`) or *saving* it (if READ-OR-WRITE is `:write`)."
  (memoize/ttl query-perms-set* :ttl/threshold (* 6 60 60 1000)))


(defn- perms-objects-set
  "Return a set of required permissions object paths for CARD.
   Optionally specify whether you want `:read` or `:write` permissions; default is `:read`.
   (`:write` permissions only affects native queries)."
  [{query :dataset_query} read-or-write]
  (query-perms-set query read-or-write))


;;; ------------------------------------------------------------ Dependencies ------------------------------------------------------------

(defn card-dependencies
  "Calculate any dependent objects for a given `Card`."
  [this id {:keys [dataset_query]}]
  (when (and dataset_query
             (= :query (keyword (:type dataset_query))))
    {:Metric  (q/extract-metric-ids (:query dataset_query))
     :Segment (q/extract-segment-ids (:query dataset_query))}))


;;; ------------------------------------------------------------ Revisions ------------------------------------------------------------

(defn serialize-instance
  "Serialize a `Card` for use in a `Revision`."
  [_ _ instance]
  (->> (dissoc instance :created_at :updated_at)
       (into {})                                 ; if it's a record type like CardInstance we need to convert it to a regular map or filter-vals won't work
       (m/filter-vals (complement delay?))))



;;; ------------------------------------------------------------ Lifecycle ------------------------------------------------------------


(defn- populate-query-fields [card]
  (let [{query :query, database-id :database, query-type :type} (:dataset_query card)
        table-id (or (:source_table query) ; legacy (MBQL '95)
                     (:source-table query))
        defaults {:database_id database-id
                  :table_id    table-id
                  :query_type  (keyword query-type)}]
    (if query-type
      (merge defaults card)
      card)))


(defn- pre-insert [{:keys [dataset_query], :as card}]
  (u/prog1 card
    ;; for native queries we need to make sure the user saving the card has native query permissions for the DB
    ;; because users can always see native Cards and we don't want someone getting around their lack of permissions that way
    (when (and *current-user-id*
               (= (keyword (:type dataset_query)) :native))
      (let [database (db/select-one ['Database :id :name], :id (:database dataset_query))]
        (qp-perms/throw-if-cannot-run-new-native-query-referencing-db *current-user-id* database)))))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete! 'PulseCard :card_id id)
  (db/cascade-delete! 'Revision :model "Card", :model_id id)
  (db/cascade-delete! 'DashboardCardSeries :card_id id)
  (db/cascade-delete! 'DashboardCard :card_id id)
  (db/cascade-delete! 'CardFavorite :card_id id)
  (db/cascade-delete! 'CardLabel :card_id id))


(u/strict-extend (class Card)
  i/IEntity
  (merge i/IEntityDefaults
         {:hydration-keys     (constantly [:card])
          :types              (constantly {:display :keyword, :query_type :keyword, :dataset_query :json, :visualization_settings :json, :description :clob})
          :timestamped?       (constantly true)
          :can-read?          (partial i/current-user-has-full-permissions? :read)
          :can-write?         (partial i/current-user-has-full-permissions? :write)
          :pre-update         populate-query-fields
          :pre-insert         (comp populate-query-fields pre-insert)
          :pre-cascade-delete pre-cascade-delete
          :perms-objects-set  perms-objects-set})

  revision/IRevisioned
  (assoc revision/IRevisionedDefaults
    :serialize-instance serialize-instance)

  dependency/IDependent
  {:dependencies card-dependencies})
