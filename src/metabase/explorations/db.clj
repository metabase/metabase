(ns metabase.explorations.db
  "Application database queries for the explorations module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Exploration -----------------------------------------------

(defn exploration
  "The Exploration with `exploration-id`, or nil."
  [exploration-id]
  (t2/select-one :model/Exploration :id exploration-id))

(defn explorations-where
  "The Explorations of the Honey SQL `query`."
  [query]
  (t2/select :model/Exploration query))

(defn exploration-creator-id-for-thread
  "The creator of the Exploration owning the ExplorationThread with `thread-id`."
  [thread-id]
  (t2/select-one-fn :creator_id :model/Exploration
                    {:join  [:exploration_thread [:= :exploration_thread.exploration_id :exploration.id]]
                     :where [:= :exploration_thread.id thread-id]}))

(defn insert-exploration!
  "Insert `exploration` and return the new instance."
  [exploration]
  (first (t2/insert-returning-instances! :model/Exploration exploration)))

(defn update-exploration!
  "Apply `changes` to the Exploration with `exploration-id`."
  [exploration-id changes]
  (t2/update! :model/Exploration exploration-id changes))

(defn delete-exploration!
  "Delete the Exploration with `exploration-id`."
  [exploration-id]
  (t2/delete! :model/Exploration :id exploration-id))

(defn hydrate-exploration-details
  "Hydrate the creator, write permission, Collection, Summary document, and threads with their queries and
  timelines onto `exploration`."
  [exploration]
  (t2/hydrate exploration :creator :can_write :collection :document [:threads :queries :timelines]))

(defn hydrate-creator-and-collection
  "Hydrate `:creator` and `:collection` onto `explorations`."
  [explorations]
  (t2/hydrate explorations :creator :collection))

;;; ------------------------------------------------- Threads -------------------------------------------------

(defn thread
  "The ExplorationThread with `thread-id`, or nil."
  [thread-id]
  (t2/select-one :model/ExplorationThread :id thread-id))

(defn thread-exploration-id-row
  "The `:exploration_id` row of the ExplorationThread with `thread-id`, or nil."
  [thread-id]
  (t2/select-one [:model/ExplorationThread :exploration_id] :id thread-id))

(defn thread-terminal-state
  "The ID, cancel time, and completion time of the ExplorationThread with `thread-id`."
  [thread-id]
  (t2/select-one [:model/ExplorationThread :id :canceled_at :completed_at] :id thread-id))

(defn thread-planning-state
  "The ID, cancel time, and analysis start time of the ExplorationThread with `thread-id`, or nil."
  [thread-id]
  (t2/select-one [:model/ExplorationThread :id :canceled_at :analysis_started_at] :id thread-id))

(defn thread-exploration-id
  "The Exploration ID of the ExplorationThread with `thread-id`."
  [thread-id]
  (t2/select-one-fn :exploration_id :model/ExplorationThread :id thread-id))

(defn thread-prompt
  "The prompt of the ExplorationThread with `thread-id`."
  [thread-id]
  (t2/select-one-fn :prompt :model/ExplorationThread :id thread-id))

(defn thread-transcript
  "The query-plan transcript of the ExplorationThread with `thread-id`."
  [thread-id]
  (t2/select-one-fn :query_plan_transcript :model/ExplorationThread :id thread-id))

(defn thread-in-exploration?
  "Whether the ExplorationThread with `thread-id` belongs to the Exploration with `exploration-id`."
  [thread-id exploration-id]
  (t2/exists? :model/ExplorationThread :id thread-id :exploration_id exploration-id))

(defn thread-canceled?
  "Whether the ExplorationThread with `thread-id` has been canceled."
  [thread-id]
  (t2/exists? :model/ExplorationThread :id thread-id :canceled_at [:not= nil]))

(defn threads-for-explorations
  "The ExplorationThreads of the Explorations with `exploration-ids`, in position order."
  [exploration-ids]
  (t2/select :model/ExplorationThread
             :exploration_id [:in exploration-ids]
             {:order-by [[:position :asc] [:id :asc]]}))

(defn thread-ids-for-exploration
  "The IDs of the ExplorationThreads of the Exploration with `exploration-id`."
  [exploration-id]
  (t2/select-pks-set :model/ExplorationThread :exploration_id exploration-id))

(defn lens-stamped-threads
  "The ID and data-access token of the ExplorationThreads among `thread-ids` that carry a token."
  [thread-ids]
  (t2/select [:model/ExplorationThread :id :data_access_token]
             :id [:in thread-ids]
             :data_access_token [:not= nil]))

(defn last-thread-position
  "The highest position among the ExplorationThreads of the Exploration with `exploration-id`."
  [exploration-id]
  (t2/select-one-fn :position :model/ExplorationThread
                    :exploration_id exploration-id
                    {:order-by [[:position :desc] [:id :desc]]}))

(defn lock-thread
  "The `:id` row of the ExplorationThread with `thread-id`, locked for update."
  [thread-id]
  (t2/query {:select [:id]
             :from   [:exploration_thread]
             :where  [:= :id thread-id]
             :for    [:update]}))

(defn insert-thread!
  "Insert `thread` and return the new instance."
  [thread]
  (first (t2/insert-returning-instances! :model/ExplorationThread thread)))

(defn update-thread!
  "Apply `changes` to the ExplorationThread with `thread-id`."
  [thread-id changes]
  (t2/update! :model/ExplorationThread thread-id changes))

(defn cancel-thread!
  "Mark the uncompleted ExplorationThread with `thread-id` canceled and completed at `now`, returning the number of
  rows updated."
  [thread-id now]
  (t2/update! :model/ExplorationThread
              :id           thread-id
              :completed_at nil
              {:canceled_at  now
               :completed_at now}))

(defn reset-terminal-thread!
  "Reset the terminal ExplorationThread with `thread-id` to freshly started at `started-at`, if no query of it is
  still running. Returns the number of rows updated."
  [thread-id started-at]
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

(defn claim-thread-analysis!
  "Stamp the analysis start and completion of the ExplorationThread with `thread-id` at `now` if it has not been
  claimed, canceled, or left with pending queries. Returns the number of rows updated."
  [thread-id now]
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

(defn block
  "The ExplorationBlock with `block-id`, or nil."
  [block-id]
  (t2/select-one :model/ExplorationBlock :id block-id))

(defn block-thread-id-row
  "The `:exploration_thread_id` row of the ExplorationBlock with `block-id`, or nil."
  [block-id]
  (t2/select-one [:model/ExplorationBlock :exploration_thread_id] :id block-id))

(defn block-metrics
  "The metric selections of the ExplorationBlock with `block-id`."
  [block-id]
  (t2/select-one-fn :metrics :model/ExplorationBlock :id block-id))

(defn block-for-page
  "The ExplorationBlock owning the ExplorationPage with `page-id`, or nil."
  [page-id]
  (t2/select-one :model/ExplorationBlock
                 {:join  [[:exploration_page :p] [:= :p.exploration_block_id :exploration_block.id]]
                  :where [:= :p.id page-id]}))

(defn blocks-for-thread
  "The ExplorationBlocks of the ExplorationThread with `thread-id`, in position order."
  [thread-id]
  (t2/select :model/ExplorationBlock :exploration_thread_id thread-id {:order-by [[:position :asc] [:id :asc]]}))

(defn blocks-for-threads
  "The ExplorationBlocks of the ExplorationThreads with `thread-ids`, in position order."
  [thread-ids]
  (t2/select :model/ExplorationBlock
             :exploration_thread_id [:in thread-ids]
             {:order-by [[:position :asc] [:id :asc]]}))

(defn block-metrics-for-threads-newest-first
  "The thread ID and metric selections of the ExplorationBlocks of the ExplorationThreads with `thread-ids`, in
  reverse position order."
  [thread-ids]
  (t2/select [:model/ExplorationBlock :exploration_thread_id :metrics]
             :exploration_thread_id [:in thread-ids]
             {:order-by [[:position :desc] [:id :desc]]}))

(defn block-ids-for-thread
  "The IDs of the ExplorationBlocks of the ExplorationThread with `thread-id`."
  [thread-id]
  (t2/select-pks-vec :model/ExplorationBlock :exploration_thread_id thread-id))

(defn insert-blocks!
  "Insert one ExplorationBlock map or a sequence of them."
  [blocks]
  (t2/insert! :model/ExplorationBlock blocks))

;;; -------------------------------------------------- Pages --------------------------------------------------

(defn page
  "The ExplorationPage with `page-id`, or nil."
  [page-id]
  (t2/select-one :model/ExplorationPage :id page-id))

(defn page-block-id-row
  "The `:exploration_block_id` row of the ExplorationPage with `page-id`, or nil."
  [page-id]
  (t2/select-one [:model/ExplorationPage :exploration_block_id] :id page-id))

(defn page-block-id
  "The block ID of the ExplorationPage with `page-id`."
  [page-id]
  (t2/select-one-fn :exploration_block_id :model/ExplorationPage :id page-id))

(defn page-id-for-key
  "The ID of the ExplorationPage of the given block, Card, dimension, and query type, or nil."
  [block-id card-id dimension-id query-type]
  (t2/select-one-pk :model/ExplorationPage
                    :exploration_block_id block-id
                    :card_id              card-id
                    :dimension_id         dimension-id
                    :query_type           query-type))

(defn pages-for-blocks
  "The ExplorationPages of the ExplorationBlocks with `block-ids`."
  [block-ids]
  (t2/select :model/ExplorationPage :exploration_block_id [:in block-ids]))

(defn page-ids-for-blocks
  "The IDs of the ExplorationPages of the ExplorationBlocks with `block-ids`."
  [block-ids]
  (t2/select-pks-vec :model/ExplorationPage :exploration_block_id [:in block-ids]))

(defn starred-page-ids
  "The IDs of the starred ExplorationPages among `page-ids`."
  [page-ids]
  (t2/select-pks-set :model/ExplorationPage :id [:in page-ids] :starred true))

(defn page-thread-ids
  "Rows of ExplorationPage `:id` and the `:thread_id` of its block, for the ExplorationThreads with `thread-ids`."
  [thread-ids]
  (t2/query {:select [[:p.id :id] [:b.exploration_thread_id :thread_id]]
             :from   [[:exploration_page :p]]
             :join   [[:exploration_block :b] [:= :b.id :p.exploration_block_id]]
             :where  [:in :b.exploration_thread_id thread-ids]}))

(defn insert-page!
  "Insert `page` and return its ID."
  [page]
  (t2/insert-returning-pk! :model/ExplorationPage page))

(defn update-page!
  "Apply `changes` to the ExplorationPage with `page-id`."
  [page-id changes]
  (t2/update! :model/ExplorationPage page-id changes))

(defn update-pages!
  "Apply `changes` to the ExplorationPages with `page-ids`."
  [page-ids changes]
  (t2/update! :model/ExplorationPage :id [:in page-ids] changes))

(defn delete-pages!
  "Delete the ExplorationPages with `page-ids`."
  [page-ids]
  (t2/delete! :model/ExplorationPage :id [:in page-ids]))

;;; ------------------------------------------------- Queries -------------------------------------------------

(defn query
  "The ExplorationQuery with `query-id`, or nil."
  [query-id]
  (t2/select-one :model/ExplorationQuery :id query-id))

(defn query-thread-id-row
  "The `:exploration_thread_id` row of the ExplorationQuery with `query-id`, or nil."
  [query-id]
  (t2/select-one [:model/ExplorationQuery :exploration_thread_id] :id query-id))

(defn query-thread-id
  "The thread ID of the ExplorationQuery with `query-id`."
  [query-id]
  (t2/select-one-fn :exploration_thread_id :model/ExplorationQuery :id query-id))

(defn finished-query-thread-id
  "The thread ID of the ExplorationQuery with `query-id` if it has finished, or nil."
  [query-id]
  (t2/select-one-fn :exploration_thread_id :model/ExplorationQuery
                    :id query-id :status [:in ["done" "error" "canceled"]]))

(defn runnable-query
  "The pending ExplorationQuery with `query-id` on an uncanceled thread, or nil."
  [query-id]
  (t2/select-one :model/ExplorationQuery
                 {:select [:eq.*]
                  :from   [[:exploration_query :eq]]
                  :join   [[:exploration_thread :et] [:= :et.id :eq.exploration_thread_id]]
                  :where  [:and
                           [:= :eq.id query-id]
                           [:= :eq.status "pending"]
                           [:= :et.canceled_at nil]]}))

(defn queries-for-threads
  "The ExplorationQueries of the ExplorationThreads with `thread-ids`, in position order."
  [thread-ids]
  (t2/select :model/ExplorationQuery
             :exploration_thread_id [:in thread-ids]
             {:order-by [[:position :asc] [:id :asc]]}))

(defn lens-stamped-queries
  "The ID, thread, Database, query, and data-access token of the ExplorationQueries with a query on the
  ExplorationThreads with `thread-ids`, in ID order."
  [thread-ids]
  (t2/select [:model/ExplorationQuery :id :exploration_thread_id :database_id :dataset_query :data_access_token]
             :exploration_thread_id [:in thread-ids]
             :dataset_query [:not= nil]
             {:order-by [[:id :asc]]}))

(defn thread-has-queries?
  "Whether the ExplorationThread with `thread-id` has any ExplorationQuery."
  [thread-id]
  (t2/exists? :model/ExplorationQuery :exploration_thread_id thread-id))

(defn query-count-in-exploration
  "The number of ExplorationQueries among `query-ids` belonging to the Exploration with `exploration-id`."
  [exploration-id query-ids]
  (t2/count :model/ExplorationQuery
            {:where [:and
                     [:in :id query-ids]
                     [:in :exploration_thread_id
                      ^:allow-subquery {:select [:id]
                                        :from   [:exploration_thread]
                                        :where  [:= :exploration_id exploration-id]}]]}))

(defn pending-query-count
  "The number of pending ExplorationQueries."
  []
  (t2/count :model/ExplorationQuery :status "pending"))

(defn oldest-pending-query-created-at
  "The creation time of the oldest pending ExplorationQuery, or nil."
  []
  (t2/select-one-fn :created_at :model/ExplorationQuery
                    {:where    [:= :status "pending"]
                     :order-by [[:created_at :asc]]
                     :limit    1}))

(defn pending-query-ids-for-thread
  "The IDs of the pending ExplorationQueries of the ExplorationThread with `thread-id`."
  [thread-id]
  (t2/select-pks-vec :model/ExplorationQuery :exploration_thread_id thread-id :status "pending"))

(defn pending-query-id-rows-for-thread
  "The `:id` rows of the pending ExplorationQueries of the ExplorationThread with `thread-id`, matching the Honey SQL
  `query`."
  [query]
  (t2/query query))

(defn page-ids-with-queries
  "The subset of `page-ids` that some ExplorationQuery points at."
  [page-ids]
  (t2/select-fn-set :page_id :model/ExplorationQuery :page_id [:in page-ids]))

(defn insert-queries!
  "Insert the ExplorationQuery `rows`."
  [rows]
  (t2/insert! :model/ExplorationQuery rows))

(defn update-query!
  "Apply `changes` to the ExplorationQuery with `query-id`."
  [query-id changes]
  (t2/update! :model/ExplorationQuery query-id changes))

(defn fail-pending-query!
  "Mark the pending ExplorationQuery with `query-id` as errored with `message` at `finished-at`, returning the number
  of rows updated."
  [query-id message finished-at]
  (t2/update! :model/ExplorationQuery
              {:id query-id, :status "pending"}
              {:status        "error"
               :error_message message
               :finished_at   finished-at}))

(defn cancel-pending-queries-for-thread!
  "Mark the pending ExplorationQueries of the ExplorationThread with `thread-id` canceled."
  [thread-id]
  (t2/update! :model/ExplorationQuery
              {:exploration_thread_id thread-id, :status "pending"}
              {:status "canceled"}))

(defn cancel-queries!
  "Mark the ExplorationQueries with `query-ids` canceled."
  [query-ids]
  (t2/query {:update (t2/table-name :model/ExplorationQuery)
             :set    {:status "canceled"}
             :where  [:in :id query-ids]}))

(defn delete-queries-for-thread!
  "Delete the ExplorationQueries of the ExplorationThread with `thread-id`."
  [thread-id]
  (t2/delete! :model/ExplorationQuery :exploration_thread_id thread-id))

(defn hydrate-segment-name
  "Hydrate `:segment_name` onto `query`."
  [query]
  (t2/hydrate query :segment_name))

(defn hydrate-query-scores
  "Hydrate the interestingness scores, row count, and segment name onto `queries`."
  [queries]
  (t2/hydrate queries :interestingness_score :contextual_interestingness_score :row_count :segment_name))

;;; ---------------------------------------------- Query results ----------------------------------------------

(defn query-result
  "The ExplorationQueryResult of the ExplorationQuery with `query-id`, or nil."
  [query-id]
  (t2/select-one :model/ExplorationQueryResult :exploration_query_id query-id))

(defn query-result-stored-result-id
  "The stored result ID of the ExplorationQueryResult of the ExplorationQuery with `query-id`."
  [query-id]
  (t2/select-one-fn :stored_result_id :model/ExplorationQueryResult :exploration_query_id query-id))

(defn query-result-exists?
  "Whether the ExplorationQuery with `query-id` has an ExplorationQueryResult."
  [query-id]
  (t2/exists? :model/ExplorationQueryResult :exploration_query_id query-id))

(defn query-result-scores
  "The query ID and `score-column` of the ExplorationQueryResults of the ExplorationQueries with `query-ids`."
  [score-column query-ids]
  (t2/select [:model/ExplorationQueryResult :exploration_query_id score-column]
             :exploration_query_id [:in query-ids]))

(defn query-result-row-counts
  "The query ID and stored row count of the ExplorationQueryResults of the ExplorationQueries with `query-ids`."
  [query-ids]
  (t2/select [:model/ExplorationQueryResult
              :exploration_query_result.exploration_query_id
              [:stored_result.row_count :row_count]]
             {:join  [:stored_result [:= :stored_result.id :exploration_query_result.stored_result_id]]
              :where [:in :exploration_query_result.exploration_query_id query-ids]}))

(defn insert-query-result!
  "Insert `query-result`."
  [query-result]
  (t2/insert! :model/ExplorationQueryResult query-result))

;;; ---------------------------------------------- Stored results ----------------------------------------------

(defn stored-result
  "The StoredResult with `stored-result-id`, or nil."
  [stored-result-id]
  (t2/select-one :model/StoredResult :id stored-result-id))

(defn orphaned-stored-result-ids
  "Up to `limit` `:id` rows of the StoredResults created before `created-before` that no ExplorationQueryResult or
  Card embed reaches, in ID order."
  [created-before limit]
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

(defn insert-stored-result!
  "Insert `stored-result` and return its ID."
  [stored-result]
  (first (t2/insert-returning-pks! :model/StoredResult stored-result)))

(defn insert-stored-result-use!
  "Insert `stored-result-use`."
  [stored-result-use]
  (t2/insert! :model/StoredResultUse stored-result-use))

(defn delete-stored-results!
  "Delete the StoredResults with `stored-result-ids`, returning the number deleted."
  [stored-result-ids]
  (t2/delete! :model/StoredResult :id [:in stored-result-ids]))

;;; ------------------------------------------------ Timelines ------------------------------------------------

(defn timelines
  "The Timelines with `timeline-ids`."
  [timeline-ids]
  (t2/select :model/Timeline :id [:in timeline-ids]))

(defn thread-timelines-for-threads
  "The ExplorationThreadTimelines of the ExplorationThreads with `thread-ids`, in position order."
  [thread-ids]
  (t2/select :model/ExplorationThreadTimeline
             :exploration_thread_id [:in thread-ids]
             {:order-by [[:position :asc] [:id :asc]]}))

(defn thread-timeline-ids
  "The Timeline IDs selected on the ExplorationThread with `thread-id`, in position order."
  [thread-id]
  (t2/select-fn-vec :timeline_id :model/ExplorationThreadTimeline
                    :exploration_thread_id thread-id
                    {:order-by [[:position :asc] [:id :asc]]}))

(defn thread-timeline-names
  "The `:name` rows of the Timelines selected on the ExplorationThread with `thread-id`, in position order."
  [thread-id]
  (t2/query {:select    [[:t.name :name]]
             :from      [[:exploration_thread_timeline :ett]]
             :left-join [[:timeline :t] [:= :t.id :ett.timeline_id]]
             :where     [:= :ett.exploration_thread_id thread-id]
             :order-by  [[:ett.position :asc]]}))

(defn thread-timeline-event-rows
  "The Timelines selected on the ExplorationThread with `thread-id` joined to their unarchived events, ordered by
  position and event timestamp."
  [thread-id]
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

(defn insert-thread-timelines!
  "Insert the ExplorationThreadTimeline `rows`."
  [rows]
  (t2/insert! :model/ExplorationThreadTimeline rows))

(defn hydrate-timeline
  "Hydrate `:timeline` onto `thread-timelines`."
  [thread-timelines]
  (t2/hydrate thread-timelines :timeline))

;;; ------------------------------------------------ Documents ------------------------------------------------

(defn summary-document-columns
  "The wire-shape columns of the Document with `document-id`, or nil."
  [document-id]
  (t2/select-one [:model/Document
                  :id :name :exploration_id :creator_id :content_type
                  :created_at :updated_at :archived :is_placeholder]
                 :id document-id))

(defn summary-documents-for-explorations
  "The wire-shape columns of the Summary Documents of the Explorations with `exploration-ids`, oldest first."
  [exploration-ids]
  (t2/select [:model/Document
              :id :name :exploration_id :creator_id :content_type
              :created_at :updated_at :archived :is_placeholder]
             :exploration_id [:in exploration-ids]
             {:order-by [[:created_at :asc] [:id :asc]]}))

(defn unarchived-summary-document
  "The unarchived Summary Document of the Exploration with `exploration-id`, or nil."
  [exploration-id]
  (t2/select-one :model/Document :exploration_id exploration-id :archived false))

(defn document-exploration-id
  "The Exploration ID of the Document with `document-id`."
  [document-id]
  (t2/select-one-fn :exploration_id :model/Document :id document-id))

(defn insert-document!
  "Insert `document`."
  [document]
  (t2/insert! :model/Document document))

(defn move-summary-documents!
  "Move the Summary Documents of the Exploration with `exploration-id` to the Collection with `collection-id`."
  [exploration-id collection-id]
  (t2/update! :model/Document :exploration_id exploration-id {:collection_id collection-id}))

(defn archive-summary-documents!
  "Archive the unarchived Summary Documents of the Exploration with `exploration-id` as not archived directly."
  [exploration-id]
  (t2/update! :model/Document
              :exploration_id exploration-id
              :archived       false
              {:archived true, :archived_directly false}))

(defn unarchive-summary-documents!
  "Unarchive the Summary Documents of the Exploration with `exploration-id` that were archived with it."
  [exploration-id]
  (t2/update! :model/Document
              :exploration_id    exploration-id
              :archived          true
              :archived_directly false
              {:archived false}))

;;; ------------------------------------------------ Other models ------------------------------------------------

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn card-names
  "The ID and name of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :name] :id [:in card-ids]))

(defn card-description
  "The description of the Card with `card-id`."
  [card-id]
  (t2/select-one-fn :description :model/Card :id card-id))

(defn card-presentation
  "The name, description, display, and visualization settings of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :name :description :display :visualization_settings] :id card-id))

(defn card-queries
  "The ID, schema, Database, and query of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :card_schema :database_id :dataset_query] :id [:in card-ids]))

(defn metric-cards-by-id
  "A map of ID to the planner columns of the Cards with `card-ids`."
  [card-ids]
  (t2/select-pk->fn identity
                    [:model/Card :id :name :description :database_id :dataset_query :card_schema :dimensions
                     :dimension_mappings]
                    :id [:in card-ids]))

(defn metric-card-ids-where
  "The `:id` rows of the Cards matching the Honey SQL `where`, library metrics first and then by name."
  [where library-collection-ids]
  (t2/select [:model/Card :id]
             {:where    where
              :order-by [[[:case
                           [:in :collection_id library-collection-ids] 0
                           :else 1] :asc]
                         [:name :asc]]}))

(defn metric-cards-with-columns
  "The `columns` of the metric Cards with `card-ids`."
  [columns card-ids]
  (t2/select columns :id [:in card-ids] :type "metric"))

(defn cards-with-columns
  "The `columns` of the Cards with `card-ids`."
  [columns card-ids]
  (t2/select columns :id [:in card-ids]))

(defn library-metrics-root-collection
  "The ID and location of the library metrics Collection of `type`, or nil."
  [type]
  (t2/select-one [:model/Collection :id :location] :type type))

(defn segment-names
  "A map of ID to name for the Segments with `segment-ids`."
  [segment-ids]
  (t2/select-pk->fn :name [:model/Segment :id :name] :id [:in segment-ids]))

(defn segment-name
  "The name of the Segment with `segment-id`."
  [segment-id]
  (t2/select-one-fn :name :model/Segment :id segment-id))

(defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(defn live-comment-targets
  "The child target IDs of the live exploration Comments anchored to one of `child-target-ids`."
  [child-target-ids]
  (t2/select-fn-set :child_target_id :model/Comment
                    :target_type     "exploration"
                    :child_target_id [:in child-target-ids]
                    :deleted_at      nil))
