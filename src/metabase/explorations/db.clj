(ns metabase.explorations.db
  "Application database queries for the explorations module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.schema :as documents.schema]
   [metabase.explorations.schema :as explorations.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.core :as queries]
   [metabase.queries.db :as queries.db]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

;;; The queries below follow the per-model `::opts` schemas; queries that do not fit that shape live in the
;;; explorations-only section at the bottom of this namespace.

(mr/def ::exploration-filters
  "Which Explorations a query applies to. Keys mirror the columns of `exploration`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::exploration-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::exploration-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::explorations.schema/exploration.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::explorations.schema/exploration.column
                                              [:tuple ::explorations.schema/exploration.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::exploration-thread-filters
  "Which ExplorationThreads a query applies to. Keys mirror the columns of `exploration_thread`: a scalar matches
  that value and a set matches any of its values. A nullable column also takes a `<column>_set` key, matching the
  rows where that column is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:id                    {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:exploration_id        {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:canceled_at_set       {:optional true} :boolean]
   [:data_access_token_set {:optional true} :boolean]])

(mr/def ::exploration-thread-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::exploration-thread-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::explorations.schema/exploration-thread.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::explorations.schema/exploration-thread.column
                                              [:tuple ::explorations.schema/exploration-thread.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::exploration-block-filters
  "Which ExplorationBlocks a query applies to. Keys mirror the columns of `exploration_block`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id                    {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:exploration_thread_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::exploration-block-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::exploration-block-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::explorations.schema/exploration-block.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::explorations.schema/exploration-block.column
                                              [:tuple ::explorations.schema/exploration-block.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::exploration-page-filters
  "Which ExplorationPages a query applies to. Keys mirror the columns of `exploration_page`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id                    {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:exploration_block_id  {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:card_id               {:optional true} [:maybe ::lib.schema.id/card]]
   [:dimension_id          {:optional true} [:maybe [:or :string :int]]]
   [:query_type            {:optional true} [:maybe [:or :keyword :string]]]
   [:starred               {:optional true} :boolean]])

(mr/def ::exploration-page-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::exploration-page-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::explorations.schema/exploration-page.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::explorations.schema/exploration-page.column
                                              [:tuple ::explorations.schema/exploration-page.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::exploration-query-filters
  "Which ExplorationQueries a query applies to. Keys mirror the columns of `exploration_query`: a scalar matches
  that value and a set matches any of its values. A nullable column also takes a `<column>_set` key, matching the
  rows where that column is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:id                     {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:exploration_thread_id  {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:page_id                {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:status                 {:optional true} [:or [:or :keyword :string] [:set [:or :keyword :string]]]]
   [:dataset_query_set      {:optional true} :boolean]])

(mr/def ::exploration-query-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::exploration-query-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::explorations.schema/exploration-query.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::explorations.schema/exploration-query.column
                                              [:tuple ::explorations.schema/exploration-query.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::exploration-query-result-filters
  "Which ExplorationQueryResults a query applies to. Keys mirror the columns of `exploration_query_result`: a
  scalar matches that value and a set matches any of its values."
  [:map {:closed true}
   [:id                    {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:exploration_query_id  {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::exploration-query-result-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::exploration-query-result-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::explorations.schema/exploration-query-result.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::explorations.schema/exploration-query-result.column
                                              [:tuple ::explorations.schema/exploration-query-result.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::exploration-thread-timeline-filters
  "Which ExplorationThreadTimelines a query applies to. Keys mirror the columns of `exploration_thread_timeline`: a
  scalar matches that value and a set matches any of its values."
  [:map {:closed true}
   [:id                    {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:exploration_thread_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::exploration-thread-timeline-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::exploration-thread-timeline-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::explorations.schema/exploration-thread-timeline.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::explorations.schema/exploration-thread-timeline.column
                                              [:tuple ::explorations.schema/exploration-thread-timeline.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private thread-set-columns
  "Maps each `<column>_set` filter key of ExplorationThread to the column whose nullness it tests."
  {:canceled_at_set       :canceled_at
   :data_access_token_set :data_access_token})

(def ^:private query-set-columns
  "Maps each `<column>_set` filter key of ExplorationQuery to the column whose nullness it tests."
  {:dataset_query_set :dataset_query})

;;; ----------------------------------------------- Exploration -----------------------------------------------

(mu/defn select-one-exploration :- [:maybe ::explorations.schema/exploration.partial]
  "The first Exploration matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-opts]]
  (apply t2/select-one (u.query/model-with-columns :model/Exploration columns) (u.query/opts->args opts)))

(mu/defn insert-exploration! :- ::explorations.schema/exploration
  "Insert `exploration` and return the new instance."
  [exploration :- ::explorations.schema/exploration.create]
  (t2/insert-returning-instance! :model/Exploration exploration))

(mu/defn update-explorations! :- :int
  "Apply `changes` to every Exploration matching `opts`, returning the number updated."
  [opts    :- [:maybe ::exploration-opts]
   changes :- ::explorations.schema/exploration.update]
  (apply t2/update! :model/Exploration (conj (u.query/opts->kv-args opts) changes)))

(mu/defn delete-explorations! :- :int
  "Delete every Exploration matching `opts`, returning the number deleted."
  [opts :- [:maybe ::exploration-opts]]
  (apply t2/delete! :model/Exploration (u.query/opts->args opts)))

;;; ------------------------------------- Queries used only by the explorations module -------------------------------------

(defn- my-explorations-query
  "The query for the Explorations `user-id` created or edited, ordered by that user's most-recent
  touch (descending). \"Touch\" is the union of three streams, all attributed to the user:

    1. the user's `Exploration` revisions (metadata / structure edits),
    2. the user's `Document` revisions for the exploration's Summary document
       (mapped back via `document.exploration_id`),
    3. `exploration.created_at` for explorations the user created — creation is a touch, and
       `created_at` stays reliable even after the creation revision ages out of the
       `revision/max-revisions` cap.

  An exploration appears iff the user produced at least one touch, and `archived`/unreadable ones
  are excluded — so the `COUNT(*) OVER ()` total matches what the caller sees.
  `current_user_last_touched_at` is non-null on every row. `limit`/`offset` are appended only when
  paged."
  [user-id limit offset]
  (let [my-touches ^:allow-subquery
        {:union-all
         [^:allow-subquery
          {:select [[:model_id :eid] [:timestamp :ts]]
           :from   [:revision]
           :where  [:and [:= :model "Exploration"] [:= :user_id user-id]]}
          ^:allow-subquery
          {:select [[:d.exploration_id :eid] [:dr.timestamp :ts]]
           :from   [[:revision :dr]]
           :join   [[:document :d] [:= :d.id :dr.model_id]]
           :where  [:and
                    [:= :dr.model "Document"]
                    [:= :dr.user_id user-id]
                    [:not= :d.exploration_id nil]]}
          ^:allow-subquery
          {:select [[:id :eid] [:created_at :ts]]
           :from   [:exploration]
           :where  [:= :creator_id user-id]}]}
        ;; MAX rather than GREATEST — the latter's NULL semantics differ across app DBs. And
        ;; `my-touches` is a derived table here rather than a sibling CTE: a second `:with` binding
        ;; that selects from the first silently returns no rows under our HoneySQL/H2 stack.
        agg        ^:allow-subquery
        {:select   [:eid [[:max :ts] :max_ts]]
         :from     [[my-touches :my_touches]]
         :group-by [:eid]}]
    (cond-> {:select   [:exploration.*
                        [:agg.max_ts :current_user_last_touched_at]
                        [[:over [[:count :*] ^:allow-subquery {} :total_count]]]]
             :from     [:exploration]
             :join     [[agg :agg] [:= :agg.eid :exploration.id]]
             :where    [:and
                        [:= :exploration.archived false]
                        (collection/visible-collection-filter-clause :exploration.collection_id)]
             :order-by [[:current_user_last_touched_at :desc] [:exploration.id :desc]]}
      limit  (assoc :limit limit)
      offset (assoc :offset offset))))

(mu/defn select-my-explorations
  "The Explorations `user-id` created or edited, most-recently-touched first, each carrying
  `:current_user_last_touched_at` and a `:total_count` window column; paginated by `limit`/`offset`."
  [user-id :- ::lib.schema.id/user
   limit   :- [:maybe ms/PositiveInt]
   offset  :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/Exploration (my-explorations-query user-id limit offset)))

(mu/defn select-exploration-creator-id-for-thread
  "The creator of the Exploration owning the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (t2/select-one-fn :creator_id :model/Exploration
                    {:join  [:exploration_thread [:= :exploration_thread.exploration_id :exploration.id]]
                     :where [:= :exploration_thread.id thread-id]}))

;;; ------------------------------------------------- Threads -------------------------------------------------

(mu/defn select-one-thread :- [:maybe ::explorations.schema/exploration-thread.partial]
  "The first ExplorationThread matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-thread-opts]]
  (apply t2/select-one (u.query/model-with-columns :model/ExplorationThread columns)
         (u.query/opts->args opts {:set-columns thread-set-columns})))

(mu/defn select-threads :- [:sequential ::explorations.schema/exploration-thread.partial]
  "The ExplorationThreads matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-thread-opts]]
  (apply t2/select (u.query/model-with-columns :model/ExplorationThread columns)
         (u.query/opts->args opts {:set-columns thread-set-columns})))

(mu/defn select-thread-pks :- [:set ms/PositiveInt]
  "The ids of the ExplorationThreads matching `opts`."
  [opts :- [:maybe ::exploration-thread-opts]]
  (or (apply t2/select-pks-set :model/ExplorationThread (u.query/opts->args opts {:set-columns thread-set-columns})) #{}))

(mu/defn thread-exists? :- :boolean
  "Whether an ExplorationThread matching `opts` exists."
  [opts :- [:maybe ::exploration-thread-opts]]
  (apply t2/exists? :model/ExplorationThread (u.query/opts->args opts {:set-columns thread-set-columns})))

(mu/defn insert-thread! :- ::explorations.schema/exploration-thread
  "Insert `thread` and return the new instance."
  [thread :- ::explorations.schema/exploration-thread.create]
  (t2/insert-returning-instance! :model/ExplorationThread thread))

(mu/defn update-threads! :- :int
  "Apply `changes` to every ExplorationThread matching `opts`, returning the number updated."
  [opts    :- [:maybe ::exploration-thread-opts]
   changes :- ::explorations.schema/exploration-thread.update]
  (apply t2/update! :model/ExplorationThread (conj (u.query/opts->kv-args opts {:set-columns thread-set-columns}) changes)))

;;; ---------------------------------------- Threads: bespoke queries ----------------------------------------

(mu/defn last-thread-position
  "The highest position among the ExplorationThreads of the Exploration with `exploration-id`."
  [exploration-id :- ms/PositiveInt]
  (:position (select-one-thread {:exploration_id exploration-id
                                 :columns        [:position]
                                 :order-by       [[:position :desc] [:id :desc]]})))

(mu/defn lock-thread
  "The `:id` row of the ExplorationThread with `thread-id`, locked for update."
  [thread-id :- ms/PositiveInt]
  (t2/query {:select [:id]
             :from   [:exploration_thread]
             :where  [:= :id thread-id]
             :for    [:update]}))

(mu/defn cancel-thread!
  "Mark the uncompleted ExplorationThread with `thread-id` canceled and completed at `now`, returning the number of
  rows updated."
  [thread-id :- ms/PositiveInt
   now       :- ms/TemporalInstant]
  (t2/update! :model/ExplorationThread
              :id           thread-id
              :completed_at nil
              {:canceled_at  now
               :completed_at now}))

(mu/defn reset-terminal-thread!
  "Reset the terminal ExplorationThread with `thread-id` to freshly started at `started-at`, if no query of it is
  still running. Returns the number of rows updated."
  [thread-id  :- ms/PositiveInt
   started-at :- ms/TemporalInstant]
  (t2/query-one {:update :exploration_thread
                 :set    {:started_at            started-at
                          :query_plan_started_at nil
                          :query_plan_transcript nil
                          :analysis_started_at   nil
                          :completed_at          nil
                          :canceled_at           nil}
                 :where  [:and
                          [:= :id thread-id]
                          [:not= :completed_at nil]
                          [:not-exists ^:allow-subquery {:select [1]
                                                         :from   [:exploration_query]
                                                         :where  [:and
                                                                  [:= :exploration_thread_id thread-id]
                                                                  [:= :status "running"]]}]]}))

(mu/defn claim-thread-analysis!
  "Stamp the analysis start and completion of the ExplorationThread with `thread-id` at `now` if it has not been
  claimed, canceled, or left with pending queries. Returns the number of rows updated."
  [thread-id :- ms/PositiveInt
   now       :- ms/TemporalInstant]
  (t2/query-one {:update :exploration_thread
                 :set    {:analysis_started_at now
                          :completed_at        now}
                 :where  [:and
                          [:= :id thread-id]
                          [:= :analysis_started_at nil]
                          [:= :canceled_at nil]
                          [:not-exists ^:allow-subquery {:select [1]
                                                         :from   [:exploration_query]
                                                         :where  [:and
                                                                  [:= :exploration_thread_id thread-id]
                                                                  [:= :status "pending"]]}]]}))

;;; ------------------------------------------------- Blocks -------------------------------------------------

(mu/defn select-one-block
  "The first ExplorationBlock matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-block-opts]]
  (apply t2/select-one (u.query/model-with-columns :model/ExplorationBlock columns) (u.query/opts->args opts)))

(mu/defn select-blocks
  "The ExplorationBlocks matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-block-opts]]
  (apply t2/select (u.query/model-with-columns :model/ExplorationBlock columns) (u.query/opts->args opts)))

(mu/defn insert-blocks!
  "Insert one ExplorationBlock map or a sequence of them."
  [blocks :- [:or ::explorations.schema/exploration-block.create [:sequential ::explorations.schema/exploration-block.create]]]
  (t2/insert! :model/ExplorationBlock blocks))

;;; ----------------------------------------- Blocks: bespoke queries -----------------------------------------

(mu/defn block-for-page
  "The ExplorationBlock owning the ExplorationPage with `page-id`, or nil."
  [page-id :- ms/PositiveInt]
  (t2/select-one :model/ExplorationBlock
                 {:select [:exploration_block.*]
                  :join   [[:exploration_page :p] [:= :p.exploration_block_id :exploration_block.id]]
                  :where  [:= :p.id page-id]}))

(mu/defn block-ids-for-thread
  "The IDs of the ExplorationBlocks of the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (mapv :id (select-blocks {:exploration_thread_id thread-id :columns [:id]})))

;;; -------------------------------------------------- Pages --------------------------------------------------

(mu/defn select-one-page :- [:maybe ::explorations.schema/exploration-page.partial]
  "The first ExplorationPage matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-page-opts]]
  (apply t2/select-one (u.query/model-with-columns :model/ExplorationPage columns) (u.query/opts->args opts)))

(mu/defn select-pages :- [:sequential ::explorations.schema/exploration-page.partial]
  "The ExplorationPages matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-page-opts]]
  (apply t2/select (u.query/model-with-columns :model/ExplorationPage columns) (u.query/opts->args opts)))

(mu/defn select-page-pks :- [:set ms/PositiveInt]
  "The ids of the ExplorationPages matching `opts`."
  [opts :- [:maybe ::exploration-page-opts]]
  (or (apply t2/select-pks-set :model/ExplorationPage (u.query/opts->args opts)) #{}))

(mu/defn select-one-page-pk :- [:maybe ms/PositiveInt]
  "The id of the first ExplorationPage matching `opts`, or nil."
  [opts :- [:maybe ::exploration-page-opts]]
  (apply t2/select-one-pk :model/ExplorationPage (u.query/opts->args opts)))

(mu/defn insert-page! :- ms/PositiveInt
  "Insert `page` and return its ID."
  [page :- ::explorations.schema/exploration-page.create]
  (t2/insert-returning-pk! :model/ExplorationPage page))

(mu/defn update-pages! :- :int
  "Apply `changes` to every ExplorationPage matching `opts`, returning the number updated."
  [opts    :- [:maybe ::exploration-page-opts]
   changes :- ::explorations.schema/exploration-page.update]
  (apply t2/update! :model/ExplorationPage (conj (u.query/opts->kv-args opts) changes)))

(mu/defn delete-pages! :- :int
  "Delete every ExplorationPage matching `opts`, returning the number deleted."
  [opts :- [:maybe ::exploration-page-opts]]
  (apply t2/delete! :model/ExplorationPage (u.query/opts->args opts)))

;;; ------------------------------------------ Pages: bespoke queries ------------------------------------------

(mu/defn page-thread-ids
  "Rows of ExplorationPage `:id` and the `:thread_id` of its block, for the ExplorationThreads with `thread-ids`."
  [thread-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select [[:p.id :id] [:b.exploration_thread_id :thread_id]]
             :from   [[:exploration_page :p]]
             :join   [[:exploration_block :b] [:= :b.id :p.exploration_block_id]]
             :where  [:in :b.exploration_thread_id thread-ids]}))

;;; ------------------------------------------------- Queries -------------------------------------------------

(mu/defn select-one-query
  "The first ExplorationQuery matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-query-opts]]
  (apply t2/select-one (u.query/model-with-columns :model/ExplorationQuery columns)
         (u.query/opts->args opts {:set-columns query-set-columns})))

(mu/defn select-queries
  "The ExplorationQueries matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-query-opts]]
  (apply t2/select (u.query/model-with-columns :model/ExplorationQuery columns)
         (u.query/opts->args opts {:set-columns query-set-columns})))

(mu/defn query-exists? :- :boolean
  "Whether an ExplorationQuery matching `opts` exists."
  [opts :- [:maybe ::exploration-query-opts]]
  (apply t2/exists? :model/ExplorationQuery (u.query/opts->args opts {:set-columns query-set-columns})))

(mu/defn count-queries :- :int
  "The number of ExplorationQueries matching `opts`."
  [opts :- [:maybe ::exploration-query-opts]]
  (apply t2/count :model/ExplorationQuery (u.query/opts->args opts {:set-columns query-set-columns})))

(mu/defn insert-queries!
  "Insert the ExplorationQuery `rows`."
  [rows :- [:sequential ::explorations.schema/exploration-query.create]]
  (t2/insert! :model/ExplorationQuery rows))

(mu/defn update-queries! :- :int
  "Apply `changes` to every ExplorationQuery matching `opts`, returning the number updated."
  [opts    :- [:maybe ::exploration-query-opts]
   changes :- ::explorations.schema/exploration-query.update]
  (apply t2/update! :model/ExplorationQuery (conj (u.query/opts->kv-args opts {:set-columns query-set-columns}) changes)))

(mu/defn delete-queries! :- :int
  "Delete every ExplorationQuery matching `opts`, returning the number deleted."
  [opts :- [:maybe ::exploration-query-opts]]
  (apply t2/delete! :model/ExplorationQuery (u.query/opts->args opts {:set-columns query-set-columns})))

;;; ---------------------------------------- Queries: bespoke queries ----------------------------------------

(mu/defn runnable-query
  "The pending ExplorationQuery with `query-id` on an uncanceled thread, or nil."
  [query-id :- ms/PositiveInt]
  (t2/select-one :model/ExplorationQuery
                 {:select [:eq.*]
                  :from   [[:exploration_query :eq]]
                  :join   [[:exploration_thread :et] [:= :et.id :eq.exploration_thread_id]]
                  :where  [:and
                           [:= :eq.id query-id]
                           [:= :eq.status "pending"]
                           [:= :et.canceled_at nil]]}))

(mu/defn count-queries-in-exploration
  "The number of ExplorationQueries among `query-ids` belonging to the Exploration with `exploration-id`."
  [exploration-id :- ms/PositiveInt
   query-ids      :- [:sequential ms/PositiveInt]]
  (t2/count :model/ExplorationQuery
            {:where [:and
                     [:in :id query-ids]
                     [:in :exploration_thread_id
                      ^:allow-subquery {:select [:id]
                                        :from   [:exploration_thread]
                                        :where  [:= :exploration_id exploration-id]}]]}))

(mu/defn oldest-pending-query-created-at
  "The creation time of the oldest pending ExplorationQuery, or nil."
  []
  (:created_at (select-one-query {:status "pending" :columns [:created_at] :order-by [:created_at] :limit 1})))

(mu/defn lock-pending-query-ids-for-thread
  "The ids of the pending ExplorationQueries of the ExplorationThread with `thread-id`, locked for
  update (`SKIP LOCKED` outside H2, whose single-worker model neither needs nor supports it)."
  [thread-id :- ms/PositiveInt]
  (map :id (t2/query (cond-> {:select [:id]
                              :from   [:exploration_query]
                              :where  [:and
                                       [:= :exploration_thread_id thread-id]
                                       [:= :status "pending"]]}
                       (not= :h2 (mdb/db-type)) (assoc :for [:update :skip-locked])))))

(mu/defn page-ids-with-queries :- [:set ms/PositiveInt]
  "The subset of `page-ids` that some ExplorationQuery points at."
  [page-ids :- [:sequential ms/PositiveInt]]
  (into #{} (keep :page_id) (select-queries {:page_id (set page-ids) :columns [:page_id]})))

(mu/defn fail-pending-query!
  "Mark the pending ExplorationQuery with `query-id` as errored with `message` at `finished-at`, returning the number
  of rows updated."
  [query-id    :- ms/PositiveInt
   message     :- :string
   finished-at :- ms/TemporalInstant]
  (t2/update! :model/ExplorationQuery
              {:id query-id, :status "pending"}
              {:status        "error"
               :error_message message
               :finished_at   finished-at}))

(mu/defn cancel-pending-queries-for-thread!
  "Mark the pending ExplorationQueries of the ExplorationThread with `thread-id` canceled."
  [thread-id :- ms/PositiveInt]
  (t2/update! :model/ExplorationQuery
              {:exploration_thread_id thread-id, :status "pending"}
              {:status "canceled"}))

;;; ---------------------------------------------- Query results ----------------------------------------------

(mu/defn select-one-query-result :- [:maybe ::explorations.schema/exploration-query-result.partial]
  "The first ExplorationQueryResult matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-query-result-opts]]
  (apply t2/select-one (u.query/model-with-columns :model/ExplorationQueryResult columns) (u.query/opts->args opts)))

(mu/defn select-query-results :- [:sequential ::explorations.schema/exploration-query-result.partial]
  "The ExplorationQueryResults matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-query-result-opts]]
  (apply t2/select (u.query/model-with-columns :model/ExplorationQueryResult columns) (u.query/opts->args opts)))

(mu/defn query-result-exists? :- :boolean
  "Whether an ExplorationQueryResult matching `opts` exists."
  [opts :- [:maybe ::exploration-query-result-opts]]
  (apply t2/exists? :model/ExplorationQueryResult (u.query/opts->args opts)))

(mu/defn insert-query-result! :- ::explorations.schema/exploration-query-result
  "Insert `query-result` and return the new instance."
  [query-result :- ::explorations.schema/exploration-query-result.create]
  (t2/insert-returning-instance! :model/ExplorationQueryResult query-result))

;;; ------------------------------------ Query results: bespoke queries ------------------------------------

(mu/defn query-result-row-counts
  "The query ID and stored row count of the ExplorationQueryResults of the ExplorationQueries with `query-ids`."
  [query-ids :- [:sequential ms/PositiveInt]]
  (t2/select [:model/ExplorationQueryResult
              :exploration_query_result.exploration_query_id
              [:stored_result.row_count :row_count]]
             {:join  [:stored_result [:= :stored_result.id :exploration_query_result.stored_result_id]]
              :where [:in :exploration_query_result.exploration_query_id query-ids]}))

;;; ---------------------------------------------- Stored results ----------------------------------------------

(mu/defn stored-result
  "The StoredResult with `stored-result-id`, or nil."
  [stored-result-id :- ms/PositiveInt]
  (queries.db/select-one-stored-result {:id stored-result-id}))

(mu/defn orphaned-stored-result-ids
  "Up to `limit` `:id` rows of the StoredResults created before `created-before` that no ExplorationQueryResult or
  Card embed reaches, in ID order."
  [created-before :- ms/TemporalInstant
   limit          :- ms/PositiveInt]
  (t2/query {:select   [:sr.id]
             :from     [[:stored_result :sr]]
             :where    [:and
                        [:not [:exists ^:allow-subquery {:select [1]
                                                         :from   [[:exploration_query_result :eqr]]
                                                         :where  [:= :eqr.stored_result_id :sr.id]}]]
                        [:not [:exists ^:allow-subquery {:select [1]
                                                         :from   [[:stored_result_use :sru]]
                                                         :where  [:and
                                                                  [:= :sru.stored_result_id :sr.id]
                                                                  [:not= :sru.card_id nil]]}]]
                        [:< :sr.created_at created-before]]
             :order-by [[:sr.id :asc]]
             :limit    limit}))

(mu/defn insert-stored-result!
  "Insert `stored-result` and return its ID."
  [stored-result :- ::queries.schema/stored-result.create]
  (queries.db/insert-stored-result! stored-result))

(mu/defn insert-stored-result-use!
  "Insert `stored-result-use`."
  [stored-result-use :- ::queries.schema/stored-result-use.create]
  (queries.db/insert-stored-result-use! stored-result-use))

(mu/defn delete-stored-results!
  "Delete the StoredResults with `stored-result-ids`, returning the number deleted."
  [stored-result-ids :- [:sequential ms/PositiveInt]]
  (queries.db/delete-stored-results! {:id (set stored-result-ids)}))

;;; ------------------------------------------------ Timelines ------------------------------------------------

(mu/defn select-thread-timelines :- [:sequential ::explorations.schema/exploration-thread-timeline.partial]
  "The ExplorationThreadTimelines matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::exploration-thread-timeline-opts]]
  (apply t2/select (u.query/model-with-columns :model/ExplorationThreadTimeline columns) (u.query/opts->args opts)))

(mu/defn insert-thread-timelines!
  "Insert the ExplorationThreadTimeline `rows`."
  [rows :- [:sequential ::explorations.schema/exploration-thread-timeline.create]]
  (t2/insert! :model/ExplorationThreadTimeline rows))

;;; -------------------------------------- Timelines: bespoke queries --------------------------------------

(mu/defn timelines
  "The Timelines with `timeline-ids`."
  [timeline-ids :- [:set ms/PositiveInt]]
  (t2/select :model/Timeline :id [:in timeline-ids]))

(mu/defn thread-timeline-names
  "The `:name` rows of the Timelines selected on the ExplorationThread with `thread-id`, in position order."
  [thread-id :- ms/PositiveInt]
  (t2/query {:select    [[:t.name :name]]
             :from      [[:exploration_thread_timeline :ett]]
             :left-join [[:timeline :t] [:= :t.id :ett.timeline_id]]
             :where     [:= :ett.exploration_thread_id thread-id]
             :order-by  [[:ett.position :asc]]}))

(mu/defn thread-timeline-event-rows
  "The Timelines selected on the ExplorationThread with `thread-id` joined to their unarchived events, ordered by
  position and event timestamp."
  [thread-id :- ms/PositiveInt]
  (t2/query {:select    [[:t.id :timeline_id]
                         [:t.name :timeline_name]
                         [:t.description :timeline_description]
                         [:te.id :event_id]
                         [:te.name :event_name]
                         [:te.description :event_description]
                         [:te.timestamp :event_timestamp]
                         [:te.icon :event_icon]
                         [:ett.position :position]]
             :from      [[:exploration_thread_timeline :ett]]
             :join      [[:timeline :t] [:= :t.id :ett.timeline_id]]
             :left-join [[:timeline_event :te] [:and
                                                [:= :te.timeline_id :t.id]
                                                [:= :te.archived false]]]
             :where     [:= :ett.exploration_thread_id thread-id]
             :order-by  [[:ett.position :asc] [:te.timestamp :asc]]}))

;;; ------------------------------------------------ Documents ------------------------------------------------

(mu/defn summary-document-columns
  "The wire-shape columns of the Document with `document-id`, or nil."
  [document-id :- ms/PositiveInt]
  (t2/select-one [:model/Document
                  :id :name :exploration_id :creator_id :content_type
                  :created_at :updated_at :archived :is_placeholder]
                 :id document-id))

(mu/defn summary-documents-for-explorations
  "The wire-shape columns of the Summary Documents of the Explorations with `exploration-ids`, oldest first."
  [exploration-ids :- [:sequential ms/PositiveInt]]
  (t2/select [:model/Document
              :id :name :exploration_id :creator_id :content_type
              :created_at :updated_at :archived :is_placeholder]
             :exploration_id [:in exploration-ids]
             {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn unarchived-summary-document
  "The unarchived Summary Document of the Exploration with `exploration-id`, or nil."
  [exploration-id :- ms/PositiveInt]
  (t2/select-one :model/Document :exploration_id exploration-id :archived false))

(mu/defn document-exploration-id
  "The Exploration ID of the Document with `document-id`."
  [document-id :- ms/PositiveInt]
  (t2/select-one-fn :exploration_id :model/Document :id document-id))

(mu/defn insert-document!
  "Insert `document`."
  [document :- ::documents.schema/document.create]
  (t2/insert! :model/Document document))

(mu/defn move-summary-documents!
  "Move the Summary Documents of the Exploration with `exploration-id` to the Collection with `collection-id`."
  [exploration-id :- ms/PositiveInt
   collection-id  :- [:maybe ::lib.schema.id/collection]]
  (t2/update! :model/Document :exploration_id exploration-id {:collection_id collection-id}))

(mu/defn archive-summary-documents!
  "Archive the unarchived Summary Documents of the Exploration with `exploration-id` as not archived directly."
  [exploration-id :- ms/PositiveInt]
  (t2/update! :model/Document
              :exploration_id exploration-id
              :archived       false
              {:archived true, :archived_directly false}))

(mu/defn unarchive-summary-documents!
  "Unarchive the Summary Documents of the Exploration with `exploration-id` that were archived with it."
  [exploration-id :- ms/PositiveInt]
  (t2/update! :model/Document
              :exploration_id    exploration-id
              :archived          true
              :archived_directly false
              {:archived false}))

;;; ------------------------------------------------ Other models ------------------------------------------------

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-names
  "The ID and name of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select [:model/Card :id :name] :id [:in card-ids]))

(mu/defn card-description
  "The description of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :description :model/Card :id card-id))

(mu/defn card-presentation
  "The name, description, display, and visualization settings of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :name :description :display :visualization_settings] :id card-id))

(mu/defn card-queries
  "The ID, schema, Database, and query of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select [:model/Card :id :card_schema :database_id :dataset_query] :id [:in card-ids]))

(mu/defn metric-cards-by-id
  "A map of ID to the planner columns of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select-pk->fn identity
                    [:model/Card :id :name :description :database_id :dataset_query :card_schema :dimensions
                     :dimension_mappings]
                    :id [:in card-ids]))

(mu/defn metric-card-ids
  "The `:id`s of the Cards visible to the current user as metrics, restricted to `metric-ids` when
  non-empty, with those in `library-collection-ids` sorted first and then alphabetically by name."
  [metric-ids             :- [:maybe [:sequential ::lib.schema.id/metric]]
   library-collection-ids :- [:maybe [:set ::lib.schema.id/collection]]]
  (t2/select [:model/Card :id]
             {:where    (cond-> (queries/visible-metric-cards-where-clause)
                          (seq metric-ids) (as-> where [:and where [:in :id (vec metric-ids)]]))
              :order-by [[[:case
                           [:in :collection_id (if (seq library-collection-ids) library-collection-ids [-1])] 0
                           :else 1] :asc]
                         [:name :asc]]}))

;;; Columns we actually need from `Card` for the two functions below. We deliberately avoid pulling the full row
;;; (which includes large blobs like `:result_metadata`, `:visualization_settings`, `:parameter_mappings`, etc.) so
;;; the response stays small and JSON encoding is fast.
(def ^:private exploration-card-columns
  [:id :name :description :collection_id :database_id :table_id :type :entity_id
   :card_schema :dataset_query :dimensions :dimension_mappings])

(mu/defn metric-cards-for-explorations
  "The exploration-relevant columns of the metric Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select (into [:model/Card] exploration-card-columns) :id [:in card-ids] :type "metric"))

(mu/defn cards-for-explorations
  "The exploration-relevant columns of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select (into [:model/Card] exploration-card-columns) :id [:in card-ids]))

(mu/defn library-metrics-root-collection
  "The ID and location of the library metrics Collection of `type`, or nil."
  [type :- :string]
  (t2/select-one [:model/Collection :id :location] :type type))

(mu/defn segment-names
  "A map of ID to name for the Segments with `segment-ids`."
  [segment-ids :- [:set ::lib.schema.id/segment]]
  (t2/select-pk->fn :name [:model/Segment :id :name] :id [:in segment-ids]))

(mu/defn segment-name
  "The name of the Segment with `segment-id`."
  [segment-id :- ::lib.schema.id/segment]
  (t2/select-one-fn :name :model/Segment :id segment-id))

(mu/defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn live-comment-targets
  "The child target IDs of the live exploration Comments anchored to one of `child-target-ids`."
  [child-target-ids :- [:sequential :string]]
  (t2/select-fn-set :child_target_id :model/Comment
                    :target_type     "exploration"
                    :child_target_id [:in child-target-ids]
                    :deleted_at      nil))
