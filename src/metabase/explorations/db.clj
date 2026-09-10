(ns metabase.explorations.db
  "Application database queries for the explorations module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.schema :as documents.schema]
   [metabase.explorations.schema :as explorations.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.core :as queries]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Exploration -----------------------------------------------

(mu/defn exploration
  "The Exploration with `exploration-id`, or nil."
  [exploration-id :- ms/PositiveInt]
  (t2/select-one :model/Exploration :id exploration-id))

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

(mu/defn my-explorations
  "The Explorations `user-id` created or edited, most-recently-touched first, each carrying
  `:current_user_last_touched_at` and a `:total_count` window column; paginated by `limit`/`offset`."
  [user-id :- ::lib.schema.id/user
   limit   :- [:maybe ms/PositiveInt]
   offset  :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/Exploration (my-explorations-query user-id limit offset)))

(mu/defn exploration-creator-id-for-thread
  "The creator of the Exploration owning the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (t2/select-one-fn :creator_id :model/Exploration
                    {:join  [:exploration_thread [:= :exploration_thread.exploration_id :exploration.id]]
                     :where [:= :exploration_thread.id thread-id]}))

(mu/defn insert-exploration!
  "Insert `exploration` and return the new instance."
  [exploration :- ::explorations.schema/exploration.update]
  (first (t2/insert-returning-instances! :model/Exploration exploration)))

(mu/defn update-exploration!
  "Apply `changes` to the Exploration with `exploration-id`."
  [exploration-id :- ms/PositiveInt
   changes        :- (mut/select-keys ::explorations.schema/exploration.update [:name :description :archived :archived_directly :collection_id :collection_position])]
  (t2/update! :model/Exploration exploration-id changes))

(mu/defn delete-exploration!
  "Delete the Exploration with `exploration-id`."
  [exploration-id :- ms/PositiveInt]
  (t2/delete! :model/Exploration :id exploration-id))

;;; ------------------------------------------------- Threads -------------------------------------------------

(mu/defn thread
  "The ExplorationThread with `thread-id`, or nil."
  [thread-id :- ms/PositiveInt]
  (t2/select-one :model/ExplorationThread :id thread-id))

(mu/defn thread-exploration-id-row
  "The `:exploration_id` row of the ExplorationThread with `thread-id`, or nil."
  [thread-id :- ms/PositiveInt]
  (t2/select-one [:model/ExplorationThread :exploration_id] :id thread-id))

(mu/defn thread-terminal-state
  "The ID, cancel time, and completion time of the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (t2/select-one [:model/ExplorationThread :id :canceled_at :completed_at] :id thread-id))

(mu/defn thread-planning-state
  "The ID, cancel time, and analysis start time of the ExplorationThread with `thread-id`, or nil."
  [thread-id :- ms/PositiveInt]
  (t2/select-one [:model/ExplorationThread :id :canceled_at :analysis_started_at] :id thread-id))

(mu/defn thread-exploration-id
  "The Exploration ID of the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (t2/select-one-fn :exploration_id :model/ExplorationThread :id thread-id))

(mu/defn thread-prompt
  "The prompt of the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (t2/select-one-fn :prompt :model/ExplorationThread :id thread-id))

(mu/defn thread-transcript
  "The query-plan transcript of the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (t2/select-one-fn :query_plan_transcript :model/ExplorationThread :id thread-id))

(mu/defn thread-in-exploration?
  "Whether the ExplorationThread with `thread-id` belongs to the Exploration with `exploration-id`."
  [thread-id      :- ms/PositiveInt
   exploration-id :- ms/PositiveInt]
  (t2/exists? :model/ExplorationThread :id thread-id :exploration_id exploration-id))

(mu/defn thread-canceled?
  "Whether the ExplorationThread with `thread-id` has been canceled."
  [thread-id :- ms/PositiveInt]
  (t2/exists? :model/ExplorationThread :id thread-id :canceled_at [:not= nil]))

(mu/defn threads-for-explorations
  "The ExplorationThreads of the Explorations with `exploration-ids`, in position order."
  [exploration-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/ExplorationThread
             :exploration_id [:in exploration-ids]
             {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn thread-ids-for-exploration
  "The IDs of the ExplorationThreads of the Exploration with `exploration-id`."
  [exploration-id :- ms/PositiveInt]
  (t2/select-pks-set :model/ExplorationThread :exploration_id exploration-id))

(mu/defn lens-stamped-threads
  "The ID and data-access token of the ExplorationThreads among `thread-ids` that carry a token."
  [thread-ids :- [:set ms/PositiveInt]]
  (t2/select [:model/ExplorationThread :id :data_access_token]
             :id [:in thread-ids]
             :data_access_token [:not= nil]))

(mu/defn last-thread-position
  "The highest position among the ExplorationThreads of the Exploration with `exploration-id`."
  [exploration-id :- ms/PositiveInt]
  (t2/select-one-fn :position :model/ExplorationThread
                    :exploration_id exploration-id
                    {:order-by [[:position :desc] [:id :desc]]}))

(mu/defn lock-thread
  "The `:id` row of the ExplorationThread with `thread-id`, locked for update."
  [thread-id :- ms/PositiveInt]
  (t2/query {:select [:id]
             :from   [:exploration_thread]
             :where  [:= :id thread-id]
             :for    [:update]}))

(mu/defn insert-thread!
  "Insert `thread` and return the new instance."
  [thread :- ::explorations.schema/exploration-thread.update]
  (first (t2/insert-returning-instances! :model/ExplorationThread thread)))

(mu/defn update-thread!
  "Apply `changes` to the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt
   changes   :- (mut/select-keys ::explorations.schema/exploration-thread.update [:started_at :analysis_started_at :completed_at :query_plan_transcript])]
  (t2/update! :model/ExplorationThread thread-id changes))

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

(mu/defn block
  "The ExplorationBlock with `block-id`, or nil."
  [block-id :- ms/PositiveInt]
  (t2/select-one :model/ExplorationBlock :id block-id))

(mu/defn block-thread-id-row
  "The `:exploration_thread_id` row of the ExplorationBlock with `block-id`, or nil."
  [block-id :- ms/PositiveInt]
  (t2/select-one [:model/ExplorationBlock :exploration_thread_id] :id block-id))

(mu/defn block-metrics
  "The metric selections of the ExplorationBlock with `block-id`."
  [block-id :- ms/PositiveInt]
  (t2/select-one-fn :metrics :model/ExplorationBlock :id block-id))

(mu/defn block-for-page
  "The ExplorationBlock owning the ExplorationPage with `page-id`, or nil."
  [page-id :- ms/PositiveInt]
  (t2/select-one :model/ExplorationBlock
                 {:select [:exploration_block.*]
                  :join   [[:exploration_page :p] [:= :p.exploration_block_id :exploration_block.id]]
                  :where  [:= :p.id page-id]}))

(mu/defn blocks-for-thread
  "The ExplorationBlocks of the ExplorationThread with `thread-id`, in position order."
  [thread-id :- ms/PositiveInt]
  (t2/select :model/ExplorationBlock :exploration_thread_id thread-id {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn blocks-for-threads
  "The ExplorationBlocks of the ExplorationThreads with `thread-ids`, in position order."
  [thread-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/ExplorationBlock
             :exploration_thread_id [:in thread-ids]
             {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn block-metrics-for-threads-newest-first
  "The thread ID and metric selections of the ExplorationBlocks of the ExplorationThreads with `thread-ids`, in
  reverse position order."
  [thread-ids :- [:sequential ms/PositiveInt]]
  (t2/select [:model/ExplorationBlock :exploration_thread_id :metrics]
             :exploration_thread_id [:in thread-ids]
             {:order-by [[:position :desc] [:id :desc]]}))

(mu/defn block-ids-for-thread
  "The IDs of the ExplorationBlocks of the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (t2/select-pks-vec :model/ExplorationBlock :exploration_thread_id thread-id))

(mu/defn insert-blocks!
  "Insert one ExplorationBlock map or a sequence of them."
  [blocks :- (let [row [:map {:closed true}
                        [:id                    {:optional true} ms/PositiveInt]
                        [:exploration_thread_id {:optional true} [:maybe ms/PositiveInt]]
                        [:metrics               {:optional true} [:maybe [:sequential :map]]]
                        [:dimensions            {:optional true} [:maybe [:sequential :map]]]
                        [:position              {:optional true} [:maybe :int]]
                        [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
                        [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]]]
               [:or row [:sequential row]])]
  (t2/insert! :model/ExplorationBlock blocks))

;;; -------------------------------------------------- Pages --------------------------------------------------

(mu/defn page
  "The ExplorationPage with `page-id`, or nil."
  [page-id :- ms/PositiveInt]
  (t2/select-one :model/ExplorationPage :id page-id))

(mu/defn page-block-id-row
  "The `:exploration_block_id` row of the ExplorationPage with `page-id`, or nil."
  [page-id :- ms/PositiveInt]
  (t2/select-one [:model/ExplorationPage :exploration_block_id] :id page-id))

(mu/defn page-block-id
  "The block ID of the ExplorationPage with `page-id`."
  [page-id :- ms/PositiveInt]
  (t2/select-one-fn :exploration_block_id :model/ExplorationPage :id page-id))

(mu/defn page-id-for-key
  "The ID of the ExplorationPage of the given block, Card, dimension, and query type, or nil."
  [block-id     :- ms/PositiveInt
   card-id      :- [:maybe ::lib.schema.id/card]
   dimension-id :- [:or :string :int]
   query-type   :- [:maybe :string]]
  (t2/select-one-pk :model/ExplorationPage
                    :exploration_block_id block-id
                    :card_id              card-id
                    :dimension_id         dimension-id
                    :query_type           query-type))

(mu/defn pages-for-blocks
  "The ExplorationPages of the ExplorationBlocks with `block-ids`."
  [block-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/ExplorationPage :exploration_block_id [:in block-ids]))

(mu/defn page-ids-for-blocks
  "The IDs of the ExplorationPages of the ExplorationBlocks with `block-ids`."
  [block-ids :- [:sequential ms/PositiveInt]]
  (t2/select-pks-vec :model/ExplorationPage :exploration_block_id [:in block-ids]))

(mu/defn starred-page-ids
  "The IDs of the starred ExplorationPages among `page-ids`."
  [page-ids :- [:sequential ms/PositiveInt]]
  (t2/select-pks-set :model/ExplorationPage :id [:in page-ids] :starred true))

(mu/defn page-thread-ids
  "Rows of ExplorationPage `:id` and the `:thread_id` of its block, for the ExplorationThreads with `thread-ids`."
  [thread-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select [[:p.id :id] [:b.exploration_thread_id :thread_id]]
             :from   [[:exploration_page :p]]
             :join   [[:exploration_block :b] [:= :b.id :p.exploration_block_id]]
             :where  [:in :b.exploration_thread_id thread-ids]}))

(mu/defn insert-page!
  "Insert `page` and return its ID."
  [page :- ::explorations.schema/exploration-page.update]
  (t2/insert-returning-pk! :model/ExplorationPage page))

(mu/defn update-page!
  "Apply `changes` to the ExplorationPage with `page-id`."
  [page-id :- ms/PositiveInt
   changes :- (mut/select-keys ::explorations.schema/exploration-page.update [:starred])]
  (t2/update! :model/ExplorationPage page-id changes))

(mu/defn update-pages!
  "Apply `changes` to the ExplorationPages with `page-ids`."
  [page-ids :- [:sequential ms/PositiveInt]
   changes  :- (mut/select-keys ::explorations.schema/exploration-page.update [:hidden])]
  (t2/update! :model/ExplorationPage :id [:in page-ids] changes))

(mu/defn delete-pages!
  "Delete the ExplorationPages with `page-ids`."
  [page-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/ExplorationPage :id [:in page-ids]))

;;; ------------------------------------------------- Queries -------------------------------------------------

(mu/defn query
  "The ExplorationQuery with `query-id`, or nil."
  [query-id :- ms/PositiveInt]
  (t2/select-one :model/ExplorationQuery :id query-id))

(mu/defn query-thread-id-row
  "The `:exploration_thread_id` row of the ExplorationQuery with `query-id`, or nil."
  [query-id :- ms/PositiveInt]
  (t2/select-one [:model/ExplorationQuery :exploration_thread_id] :id query-id))

(mu/defn query-thread-id
  "The thread ID of the ExplorationQuery with `query-id`."
  [query-id :- ms/PositiveInt]
  (t2/select-one-fn :exploration_thread_id :model/ExplorationQuery :id query-id))

(mu/defn finished-query-thread-id
  "The thread ID of the ExplorationQuery with `query-id` if it has finished, or nil."
  [query-id :- ms/PositiveInt]
  (t2/select-one-fn :exploration_thread_id :model/ExplorationQuery
                    :id query-id :status [:in ["done" "error" "canceled"]]))

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

(mu/defn queries-for-threads
  "The ExplorationQueries of the ExplorationThreads with `thread-ids`, in position order."
  [thread-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/ExplorationQuery
             :exploration_thread_id [:in thread-ids]
             {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn lens-stamped-queries
  "The ID, thread, Database, query, and data-access token of the ExplorationQueries with a query on the
  ExplorationThreads with `thread-ids`, in ID order."
  [thread-ids :- [:set ms/PositiveInt]]
  (t2/select [:model/ExplorationQuery :id :exploration_thread_id :database_id :dataset_query :data_access_token]
             :exploration_thread_id [:in thread-ids]
             :dataset_query [:not= nil]
             {:order-by [[:id :asc]]}))

(mu/defn thread-has-queries?
  "Whether the ExplorationThread with `thread-id` has any ExplorationQuery."
  [thread-id :- ms/PositiveInt]
  (t2/exists? :model/ExplorationQuery :exploration_thread_id thread-id))

(mu/defn query-count-in-exploration
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

(mu/defn pending-query-count
  "The number of pending ExplorationQueries."
  []
  (t2/count :model/ExplorationQuery :status "pending"))

(mu/defn oldest-pending-query-created-at
  "The creation time of the oldest pending ExplorationQuery, or nil."
  []
  (t2/select-one-fn :created_at :model/ExplorationQuery
                    {:where    [:= :status "pending"]
                     :order-by [[:created_at :asc]]
                     :limit    1}))

(mu/defn pending-query-ids-for-thread
  "The IDs of the pending ExplorationQueries of the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (t2/select-pks-vec :model/ExplorationQuery :exploration_thread_id thread-id :status "pending"))

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

(mu/defn page-ids-with-queries
  "The subset of `page-ids` that some ExplorationQuery points at."
  [page-ids :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :page_id :model/ExplorationQuery :page_id [:in page-ids]))

(mu/defn insert-queries!
  "Insert the ExplorationQuery `rows`."
  [rows :- [:sequential
            ::explorations.schema/exploration-query.update]]
  (t2/insert! :model/ExplorationQuery rows))

(mu/defn update-query!
  "Apply `changes` to the ExplorationQuery with `query-id`."
  [query-id :- ms/PositiveInt
   changes  :- (mut/select-keys ::explorations.schema/exploration-query.update [:dataset_query :name :data_access_token :status :started_at :finished_at])]
  (t2/update! :model/ExplorationQuery query-id changes))

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

(mu/defn cancel-queries!
  "Mark the ExplorationQueries with `query-ids` canceled, returning the affected-row count in a one-element vector."
  [query-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:update (t2/table-name :model/ExplorationQuery)
             :set    {:status "canceled"}
             :where  [:in :id query-ids]}))

(mu/defn delete-queries-for-thread!
  "Delete the ExplorationQueries of the ExplorationThread with `thread-id`."
  [thread-id :- ms/PositiveInt]
  (t2/delete! :model/ExplorationQuery :exploration_thread_id thread-id))

;;; ---------------------------------------------- Query results ----------------------------------------------

(mu/defn query-result
  "The ExplorationQueryResult of the ExplorationQuery with `query-id`, or nil."
  [query-id :- ms/PositiveInt]
  (t2/select-one :model/ExplorationQueryResult :exploration_query_id query-id))

(mu/defn query-result-stored-result-id
  "The stored result ID of the ExplorationQueryResult of the ExplorationQuery with `query-id`."
  [query-id :- ms/PositiveInt]
  (t2/select-one-fn :stored_result_id :model/ExplorationQueryResult :exploration_query_id query-id))

(mu/defn query-result-exists?
  "Whether the ExplorationQuery with `query-id` has an ExplorationQueryResult."
  [query-id :- ms/PositiveInt]
  (t2/exists? :model/ExplorationQueryResult :exploration_query_id query-id))

(mu/defn query-result-scores
  "The query ID and `score-column` of the ExplorationQueryResults of the ExplorationQueries with `query-ids`."
  [score-column :- :keyword
   query-ids    :- [:sequential ms/PositiveInt]]
  (t2/select [:model/ExplorationQueryResult :exploration_query_id score-column]
             :exploration_query_id [:in query-ids]))

(mu/defn query-result-row-counts
  "The query ID and stored row count of the ExplorationQueryResults of the ExplorationQueries with `query-ids`."
  [query-ids :- [:sequential ms/PositiveInt]]
  (t2/select [:model/ExplorationQueryResult
              :exploration_query_result.exploration_query_id
              [:stored_result.row_count :row_count]]
             {:join  [:stored_result [:= :stored_result.id :exploration_query_result.stored_result_id]]
              :where [:in :exploration_query_result.exploration_query_id query-ids]}))

(mu/defn insert-query-result!
  "Insert `query-result`."
  [query-result :- [:map {:closed true}
                    [:id                                {:optional true} ms/PositiveInt]
                    [:exploration_query_id               {:optional true} [:maybe ms/PositiveInt]]
                    [:stored_result_id                   {:optional true} [:maybe ms/PositiveInt]]
                    [:created_at                         {:optional true} [:maybe ms/TemporalInstant]]
                    [:interestingness_score               {:optional true} [:maybe number?]]
                    [:contextual_interestingness_score    {:optional true} [:maybe number?]]
                    [:chart_stats                         {:optional true} [:maybe :map]]
                    [:metric_description                  {:optional true} [:maybe :string]]
                    [:chart_description                   {:optional true} [:maybe :string]]]]
  (t2/insert! :model/ExplorationQueryResult query-result))

;;; ---------------------------------------------- Stored results ----------------------------------------------

(mu/defn stored-result
  "The StoredResult with `stored-result-id`, or nil."
  [stored-result-id :- ms/PositiveInt]
  (t2/select-one :model/StoredResult :id stored-result-id))

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
  [stored-result :- ::queries.schema/stored-result.update]
  (first (t2/insert-returning-pks! :model/StoredResult stored-result)))

(mu/defn insert-stored-result-use!
  "Insert `stored-result-use`."
  [stored-result-use :- [:map {:closed true}
                         [:id                {:optional true} ms/PositiveInt]
                         [:stored_result_id   {:optional true} [:maybe ms/PositiveInt]]
                         [:exploration_id     {:optional true} [:maybe ms/PositiveInt]]
                         [:created_at         {:optional true} [:maybe ms/TemporalInstant]]
                         [:updated_at         {:optional true} [:maybe ms/TemporalInstant]]
                         [:card_id            {:optional true} [:maybe ::lib.schema.id/card]]]]
  (t2/insert! :model/StoredResultUse stored-result-use))

(mu/defn delete-stored-results!
  "Delete the StoredResults with `stored-result-ids`, returning the number deleted."
  [stored-result-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/StoredResult :id [:in stored-result-ids]))

;;; ------------------------------------------------ Timelines ------------------------------------------------

(mu/defn timelines
  "The Timelines with `timeline-ids`."
  [timeline-ids :- [:set ms/PositiveInt]]
  (t2/select :model/Timeline :id [:in timeline-ids]))

(mu/defn thread-timelines-for-threads
  "The ExplorationThreadTimelines of the ExplorationThreads with `thread-ids`, in position order."
  [thread-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/ExplorationThreadTimeline
             :exploration_thread_id [:in thread-ids]
             {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn thread-timeline-ids
  "The Timeline IDs selected on the ExplorationThread with `thread-id`, in position order."
  [thread-id :- ms/PositiveInt]
  (t2/select-fn-vec :timeline_id :model/ExplorationThreadTimeline
                    :exploration_thread_id thread-id
                    {:order-by [[:position :asc] [:id :asc]]}))

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

(mu/defn insert-thread-timelines!
  "Insert the ExplorationThreadTimeline `rows`."
  [rows :- [:sequential
            [:map {:closed true}
             [:id                    {:optional true} ms/PositiveInt]
             [:exploration_thread_id {:optional true} [:maybe ms/PositiveInt]]
             [:timeline_id           {:optional true} [:maybe ms/PositiveInt]]
             [:position              {:optional true} [:maybe :int]]
             [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
             [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]]]]
  (t2/insert! :model/ExplorationThreadTimeline rows))

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
  [document :- ::documents.schema/document.update]
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
