(ns metabase.models.card
  "Underlying DB model for what is now most commonly referred to as a 'Question' in most user-facing situations. Card
  is a historical name, but is the same thing; both terms are used interchangeably in the backend codebase."
  (:require [clojure.core.memoize :as memoize]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase
             [public-settings :as public-settings]
             [query-processor :as qp]
             [util :as u]]
            [metabase.api.common :as api :refer [*current-user-id*]]
            [metabase.models
             [card-label :refer [CardLabel]]
             [collection :as collection]
             [dependency :as dependency]
             [field-values :as field-values]
             [interface :as i]
             [label :refer [Label]]
             [params :as params]
             [permissions :as perms]
             [revision :as revision]]
            [metabase.query-processor.middleware.permissions :as qp-perms]
            [metabase.query-processor.util :as qputil]
            [metabase.util.query :as q]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel Card :report_card)

;;; -------------------------------------------------- Hydration --------------------------------------------------

(defn dashboard-count
  "Return the number of Dashboards this Card is in."
  {:hydrate :dashboard_count}
  [{:keys [id]}]
  (db/count 'DashboardCard, :card_id id))

(defn labels
  "Return `Labels` for CARD."
  {:hydrate :labels}
  [{:keys [id]}]
  (if-let [label-ids (seq (db/select-field :label_id CardLabel, :card_id id))]
    (db/select Label, :id [:in label-ids], {:order-by [:%lower.name]})
    []))

(defn with-in-public-dashboard
  "Efficiently add a `:in_public_dashboard` key to each item in a sequence of `cards`. This boolean key predictably
  represents whether the Card in question is a member of one or more public Dashboards, which can be important in
  determining its permissions. This will always be `false` if public sharing is disabled."
  {:batched-hydrate :in_public_dashboard}
  [cards]
  (let [card-ids                  (set (filter some? (map :id cards)))
        public-dashboard-card-ids (when (and (seq card-ids)
                                             (public-settings/enable-public-sharing))
                                    (->> (db/query {:select    [[:c.id :id]]
                                                    :from      [[:report_card :c]]
                                                    :left-join [[:report_dashboardcard :dc] [:= :c.id :dc.card_id]
                                                                [:report_dashboard :d] [:= :dc.dashboard_id :d.id]]
                                                    :where     [:and
                                                                [:in :c.id card-ids]
                                                                [:not= :d.public_uuid nil]]})
                                         (map :id)
                                         set))]
    (for [card cards]
      (when (some? card) ; card may be `nil` here if it comes from a text-only Dashcard
        (assoc card :in_public_dashboard (contains? public-dashboard-card-ids (u/get-id card)))))))


;;; ---------------------------------------------- Permissions Checking ----------------------------------------------

(defn- native-permissions-path
  "Return the `:read` (for running) or `:write` (for saving) native permissions path for DATABASE-OR-ID."
  [read-or-write database-or-id]
  ((case read-or-write
     :read  perms/native-read-path
     :write perms/native-readwrite-path) (u/get-id database-or-id)))

(defn- query->source-and-join-tables
  "Return a sequence of all Tables (as TableInstance maps) referenced by QUERY."
  [{:keys [source-table join-tables source-query native], :as query}]
  (cond
    ;; if we come across a native query just put a placeholder (`::native`) there so we know we need to add native
    ;; permissions to the complete set below.
    native       [::native]
    ;; if we have a source-query just recur until we hit either the native source or the MBQL source
    source-query (recur source-query)
    ;; for root MBQL queries just return source-table + join-tables
    :else        (cons source-table join-tables)))

(defn- tables->permissions-path-set
  "Given a sequence of TABLES referenced by a query, return a set of required permissions."
  [read-or-write database-or-id tables]
  (set (for [table tables]
         (if (= ::native table)
           ;; Any `::native` placeholders from above mean we need READ-OR-WRITE native permissions for this DATABASE
           (native-permissions-path read-or-write database-or-id)
           ;; anything else (i.e., a normal table) just gets normal table permissions
           (perms/object-path (u/get-id database-or-id)
                              (:schema table)
                              (or (:id table) (:table-id table)))))))

(declare query-perms-set)

(defn- mbql-permissions-path-set
  "Return the set of required permissions needed to run QUERY."
  [read-or-write query]
  {:pre [(map? query) (map? (:query query))]}
  (try
    (or
     ;; If `query` is based on a source Card (if `:source-table` uses a psuedo-source-table like `card__<id>`) then
     ;; return the permissions needed to *read* that Card. Running or saving a Card that uses another Card as a source
     ;; query simply requires read permissions for that Card; e.g. if you are allowed to view a query you can save a
     ;; new query that uses it as a source. Thus the distinction between read and write permissions in not important
     ;; here.
     ;;
     ;; See issue #6845 for further discussion.
     (when-let [source-card-id (qputil/query->source-card-id query)]
       (query-perms-set (db/select-one-field :dataset_query Card :id source-card-id) :read))
     ;; otherwise if there's no source card then calculate perms based on the Tables referenced in the query
     (let [{:keys [query database]} (qp/expand query)]
       (tables->permissions-path-set read-or-write database (query->source-and-join-tables query))))
    ;; if for some reason we can't expand the Card (i.e. it's an invalid legacy card) just return a set of permissions
    ;; that means no one will ever get to see it (except for superusers who get to see everything)
    (catch Throwable e
      (log/warn "Error getting permissions for card:" (.getMessage e) "\n"
                (u/pprint-to-str (u/filtered-stacktrace e)))
      #{"/db/0/"})))                    ; DB 0 will never exist

;; Calculating Card read permissions is rather expensive, since we must parse and expand the Card's query in order to
;; find the Tables it references. Since we read Cards relatively often, these permissions are cached in the
;; `:read_permissions` column of Card. There should not be situtations where these permissions are not cached; but if
;; for some strange reason they are we will go ahead and recalculate them.

;; TODO - what if the query uses a source query, and that query changes? Not sure if that will cause an issue or not.
(defn query-perms-set
  "Calculate the set of permissions required to `:read`/run or `:write` (update) a Card with `query`. In normal cases
  for read permissions you should look at a Card's `:read_permissions`, which is precalculated. If you specifically
  need to calculate permissions for a query directly, and ignore anything precomputed, use this function. Otherwise
  you should rely on one of the optimized ones below."
  [{query-type :type, database :database, :as query} read-or-write]
  (cond
    (empty? query)                   #{}
    (= (keyword query-type) :native) #{(native-permissions-path read-or-write database)}
    (= (keyword query-type) :query)  (mbql-permissions-path-set read-or-write query)
    :else                            (throw (Exception. (str "Invalid query type: " query-type)))))


(defn- card-perms-set-for-query
  "Return the permissions required to `read-or-write` `card` based on its query, disregarding the collection the Card is
  in, whether it is publicly shared, etc. This will return precalculated `:read_permissions` if they are present."
  [{read-perms :read_permissions, id :id, query :dataset_query} read-or-write]
  (cond
    ;; for WRITE permissions always recalculate since these will be determined relatively infrequently (hopefully)
    ;; e.g. when updating a Card
    (= :write read-or-write) (query-perms-set query :write)
    ;; if the Card has populated `:read_permissions` and we're looking up read pems return those rather than calculating
    ;; on-the-fly. Cast to `set` to be extra-double-sure it's a set like we'd expect when it gets deserialized from JSON
    read-perms (set read-perms)
    ;; otherwise if :read_permissions was NOT populated. This should not normally happen since the data migration
    ;; should have pre-populated values for all the Cards. If it does it might mean something like we fetched the Card
    ;; without its `read_permissions` column. Since that would be "doing something wrong" warn about it.
    :else (do (log/warn "Card" id "is missing its read_permissions. Calculating them now...")
              (query-perms-set query :read))))

(defn- card-perms-set-for-current-user
  "Calculate the permissions required to `read-or-write` `card` *for the current user*. This takes into account whether
  the Card is publicly available, or in a collection the current user can view; it also attempts to use precalcuated
  `read_permissions` when possible. This is the function that should be used for general permissions checking for a
  Card."
  [{collection-id :collection_id, public-uuid :public_uuid, in-public-dash? :in_public_dashboard,
    outer-query :dataset_query, :as card}
   read-or-write]
  (let [source-card-id (qputil/query->source-card-id outer-query)]
    (cond
      ;; you don't need any permissions to READ a public card, which is PUBLIC by definition :D
      (and (public-settings/enable-public-sharing)
           (= :read read-or-write)
           (or public-uuid in-public-dash?))
      #{}

      collection-id
      (collection/perms-objects-set collection-id read-or-write)

      ;; if this is based on a source card then our permissions are based on that; recurse. You can always save a new
      ;; Card based on a source card you can read, thus read/write permissions for this new Card will be the same as
      ;; read permissions for its source. This is dicussed in further detail above in `mbql-permissions-path-set`
      source-card-id
      (card-perms-set-for-current-user (Card source-card-id) :read)

      :else
      (card-perms-set-for-query card read-or-write))))


;;; -------------------------------------------------- Dependencies --------------------------------------------------

(defn card-dependencies
  "Calculate any dependent objects for a given `card`."
  ([_ _ card]
   (card-dependencies card))
  ([{:keys [dataset_query]}]
   (when (and dataset_query
              (= :query (keyword (:type dataset_query))))
     {:Metric  (q/extract-metric-ids (:query dataset_query))
      :Segment (q/extract-segment-ids (:query dataset_query))})))


;;; -------------------------------------------------- Revisions --------------------------------------------------

(defn serialize-instance
  "Serialize a `Card` for use in a `Revision`."
  ([instance]
   (serialize-instance nil nil instance))
  ([_ _ instance]
   (dissoc instance :created_at :updated_at)))


;;; -------------------------------------------------- Lifecycle --------------------------------------------------

(defn- native-query? [query-type]
  (or (= query-type "native")
      (= query-type :native)))

(defn query->database-and-table-ids
  "Return a map with `:database-id` and source `:table-id` that should be saved for a Card. Handles queries that use
   other queries as their source (ones that come in with a `:source-table` like `card__100`) recursively, as well as
   normal queries."
  [outer-query]
  (let [database-id  (qputil/get-normalized outer-query :database)
        query-type   (qputil/get-normalized outer-query :type)
        source-table (qputil/get-in-normalized outer-query [:query :source-table])]
    (cond
      (native-query? query-type) {:database-id database-id, :table-id nil}
      (integer? source-table)    {:database-id database-id, :table-id source-table}
      (string? source-table)     (let [[_ card-id] (re-find #"^card__(\d+)$" source-table)]
                                   (db/select-one [Card [:table_id :table-id] [:database_id :database-id]]
                                     :id (Integer/parseInt card-id))))))

(defn populate-query-fields
  "Lift `database_id`, `table_id`, and `query_type` from query definition."
  [{{query-type :type, :as outer-query} :dataset_query, :as card}]
  (merge (when-let [{:keys [database-id table-id]} (and query-type
                                                        (query->database-and-table-ids outer-query))]
           {:database_id database-id
            :table_id    table-id
            :query_type  (keyword query-type)})
         card))

(defn- pre-insert [{query :dataset_query, :as card}]
  ;; TODO - make sure if `collection_id` is specified that we have write permissions for that collection
  ;; Save the new Card with read permissions since calculating them dynamically is so expensive.
  (u/prog1 (assoc card :read_permissions (query-perms-set query :read))
    ;; for native queries we need to make sure the user saving the card has native query permissions for the DB
    ;; because users can always see native Cards and we don't want someone getting around their lack of permissions
    ;; that way
    (when (and *current-user-id*
               (= (keyword (:type query)) :native))
      (let [database (db/select-one ['Database :id :name], :id (:database query))]
        (qp-perms/throw-if-cannot-run-new-native-query-referencing-db database)))))

(defn- post-insert [card]
  ;; if this Card has any native template tag parameters we need to update FieldValues for any Fields that are
  ;; eligible for FieldValues and that belong to a 'On-Demand' database
  (u/prog1 card
    (when-let [field-ids (seq (params/card->template-tag-field-ids card))]
      (log/info "Card references Fields in params:" field-ids)
      (field-values/update-field-values-for-on-demand-dbs! field-ids))))

(defn- pre-update [{archived? :archived, query :dataset_query, :as card}]
  ;; save the updated Card with updated read permissions.
  (u/prog1 (assoc card :read_permissions (query-perms-set query :read))
    ;; if the Card is archived, then remove it from any Dashboards
    (when archived?
      (db/delete! 'DashboardCard :card_id (u/get-id card)))
    ;; if the template tag params for this Card have changed in any way we need to update the FieldValues for
    ;; On-Demand DB Fields
    (when (and (:dataset_query card)
               (:native (:dataset_query card)))
      (let [old-param-field-ids (params/card->template-tag-field-ids (db/select-one [Card :dataset_query]
                                                                       :id (u/get-id card)))
            new-param-field-ids (params/card->template-tag-field-ids card)]
        (when (and (seq new-param-field-ids)
                   (not= old-param-field-ids new-param-field-ids))
          (let [newly-added-param-field-ids (set/difference new-param-field-ids old-param-field-ids)]
            (log/info "Referenced Fields in Card params have changed. Was:" old-param-field-ids
                      "Is Now:" new-param-field-ids
                      "Newly Added:" newly-added-param-field-ids)
            ;; Now update the FieldValues for the Fields referenced by this Card.
            (field-values/update-field-values-for-on-demand-dbs! newly-added-param-field-ids)))))))

(defn- pre-delete [{:keys [id]}]
  (db/delete! 'PulseCard :card_id id)
  (db/delete! 'Revision :model "Card", :model_id id)
  (db/delete! 'DashboardCardSeries :card_id id)
  (db/delete! 'DashboardCard :card_id id)
  (db/delete! 'CardFavorite :card_id id)
  (db/delete! 'CardLabel :card_id id))


(u/strict-extend (class Card)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:card])
          :types          (constantly {:dataset_query          :json
                                       :description            :clob
                                       :display                :keyword
                                       :embedding_params       :json
                                       :query_type             :keyword
                                       :result_metadata        :json
                                       :visualization_settings :json
                                       :read_permissions       :json-set})
          :properties     (constantly {:timestamped? true})
          :pre-update     (comp populate-query-fields pre-update)
          :pre-insert     (comp populate-query-fields pre-insert)
          :post-insert    post-insert
          :pre-delete     pre-delete
          :post-select    public-settings/remove-public-uuid-if-public-sharing-is-disabled})

  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?         (partial i/current-user-has-full-permissions? :read)
          :can-write?        (partial i/current-user-has-full-permissions? :write)
          :perms-objects-set card-perms-set-for-current-user})

  revision/IRevisioned
  (assoc revision/IRevisionedDefaults
    :serialize-instance serialize-instance)

  dependency/IDependent
  {:dependencies card-dependencies})
