(ns metabase.transforms.db
  "Application database queries for the transforms module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(def ^:private no-active-run-clause
  "Honey SQL clause matching TransformRunCancelation rows whose run is no longer active."
  [:not [:exists ^:allow-subquery
         {:select [1]
          :from   [[:transform_run :wr]]
          :where  [:and
                   [:= :wr.id :transform_run_cancelation.run_id]
                   :wr.is_active]}]])

;;; ------------------------------------------------ Transform ------------------------------------------------

(defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id]
  (t2/select-one :model/Transform :id transform-id))

(defn transforms
  "The Transforms with `transform-ids`."
  [transform-ids]
  (t2/select :model/Transform :id [:in transform-ids]))

(defn transforms-of-source-types
  "The Transforms whose source type is one of `source-types`, optionally narrowed to `database-id`, ordered by ID."
  [source-types database-id]
  (t2/select :model/Transform {:where    [:and
                                          [:in :source_type source-types]
                                          (when database-id [:= :source_database_id database-id])]
                               :order-by [[:id :asc]]}))

(defn transform-dependency-rows
  "The ID, target, target Table ID, creation time, and table dependencies of every Transform."
  []
  (t2/select [:model/Transform :id :target :target_table_id :created_at :table_dependencies]))

(defn transform-snapshot
  "The name, entity ID, and source type of the Transform with `transform-id`."
  [transform-id]
  (t2/select-one [:model/Transform :name :entity_id :source_type] :id transform-id))

(defn transform-summaries-by-id
  "A map of ID to the ID, name, and Collection ID of the Transforms with `transform-ids`."
  [transform-ids]
  (t2/select-pk->fn identity [:model/Transform :id :name :collection_id] :id [:in transform-ids]))

(defn transform-names-by-id
  "A map of ID to name for the Transforms with `transform-ids`."
  [transform-ids]
  (t2/select-pk->fn :name :model/Transform :id [:in transform-ids]))

(defn transform-last-checkpoint-value
  "The last checkpoint value of the Transform with `transform-id`."
  [transform-id]
  (t2/select-one-fn :last_checkpoint_value [:model/Transform :last_checkpoint_value] transform-id))

(defn transform-collection-id
  "The Collection ID of the Transform with `transform-id`."
  [transform-id]
  (t2/select-one-fn :collection_id :model/Transform :id transform-id))

(defn insert-transform!
  "Insert `transform` and return the new instance."
  [transform]
  (t2/insert-returning-instance! :model/Transform transform))

(defn update-transform!
  "Apply `changes` to the Transform with `transform-id`."
  [transform-id changes]
  (t2/update! :model/Transform transform-id changes))

(defn delete-transform!
  "Delete the Transform with `transform-id`."
  [transform-id]
  (t2/delete! :model/Transform transform-id))

;;; ---------------------------------------------- Transform tags ----------------------------------------------

(defn tag
  "The TransformTag with `tag-id`, or nil."
  [tag-id]
  (t2/select-one :model/TransformTag :id tag-id))

(defn existing-tag-ids
  "The subset of `tag-ids` that exist."
  [tag-ids]
  (t2/select-fn-set :id :model/TransformTag :id [:in tag-ids]))

(defn tag-name-exists?
  "Whether a TransformTag named `tag-name` exists."
  [tag-name]
  (t2/exists? :model/TransformTag :name tag-name))

(defn tag-name-exists-excluding?
  "Whether a TransformTag named `tag-name` other than `tag-id` exists."
  [tag-name tag-id]
  (t2/exists? :model/TransformTag :name tag-name :id [:not= tag-id]))

(defn transform-tag-links
  "The tag links of the Transforms with `transform-ids`, ordered by position."
  [transform-ids]
  (t2/select :model/TransformTransformTag :transform_id [:in transform-ids] {:order-by [[:position :asc]]}))

(defn transform-tag-links-for-tags
  "The tag ID and Transform ID of the tag links of the TransformTags with `tag-ids`."
  [tag-ids]
  (t2/select [:model/TransformTransformTag :tag_id :transform_id] :tag_id [:in tag-ids]))

(defn transform-ids-with-tags
  "The IDs of the Transforms tagged with one of `tag-ids`."
  [tag-ids]
  (t2/select-fn-set :transform_id :model/TransformTransformTag :tag_id [:in tag-ids]))

(defn active-job-schedules-for-transforms
  "Rows of Transform ID and the schedule of each active TransformJob that runs it through a shared tag."
  [transform-ids]
  (t2/select :model/TransformTransformTag
             {:select [:ttt.transform_id [:job.schedule :schedule]]
              :from   [[:transform_transform_tag :ttt]]
              :join   [[:transform_job_transform_tag :jtt] [:= :ttt.tag_id :jtt.tag_id]
                       [:transform_job :job] [:= :jtt.job_id :job.id]]
              :where  [:and
                       [:in :ttt.transform_id transform-ids]
                       [:= :job.active true]]}))

(defn insert-transform-tag-links!
  "Insert the TransformTransformTag `rows`."
  [rows]
  (t2/insert! :model/TransformTransformTag rows))

(defn set-transform-tag-position!
  "Set the position of the tag link between the Transform with `transform-id` and the tag with `tag-id`."
  [transform-id tag-id position]
  (t2/update! :model/TransformTransformTag {:transform_id transform-id, :tag_id tag-id} {:position position}))

(defn delete-transform-tag-links!
  "Delete the links between the Transform with `transform-id` and the tags with `tag-ids`."
  [transform-id tag-ids]
  (t2/delete! :model/TransformTransformTag :transform_id transform-id :tag_id [:in tag-ids]))

;;; ---------------------------------------------- Transform jobs ----------------------------------------------

(defn job
  "The TransformJob with `job-id`, or nil."
  [job-id]
  (t2/select-one :model/TransformJob :id job-id))

(defn active-jobs
  "The active TransformJobs."
  []
  (t2/select :model/TransformJob :active true))

(defn job-snapshot
  "The name, entity ID, and built-in type of the TransformJob with `job-id`."
  [job-id]
  (t2/select-one [:model/TransformJob :name :entity_id :built_in_type] :id job-id))

(defn job-names-by-id
  "A map of ID to name for the TransformJobs with `job-ids`."
  [job-ids]
  (t2/select-pk->fn :name :model/TransformJob :id [:in job-ids]))

(defn activate-job!
  "Mark the inactive TransformJob with `job-id` active, returning the number of rows updated."
  [job-id]
  (t2/update! :model/TransformJob {:id job-id, :active false} {:active true}))

(defn deactivate-job!
  "Mark the active TransformJob with `job-id` inactive, returning the number of rows updated."
  [job-id]
  (t2/update! :model/TransformJob {:id job-id, :active true} {:active false}))

(defn job-tag-ids
  "The IDs of the tags of the TransformJob with `job-id`."
  [job-id]
  (t2/select-fn-set :tag_id :model/TransformJobTransformTag :job_id job-id))

(defn job-tag-links
  "The tag links of the TransformJobs with `job-ids`, ordered by position."
  [job-ids]
  (t2/select :model/TransformJobTransformTag :job_id [:in job-ids] {:order-by [[:position :asc]]}))

(defn insert-job-tag-links!
  "Insert the TransformJobTransformTag `rows`."
  [rows]
  (t2/insert! :model/TransformJobTransformTag rows))

(defn set-job-tag-position!
  "Set the position of the tag link between the TransformJob with `job-id` and the tag with `tag-id`."
  [job-id tag-id position]
  (t2/update! :model/TransformJobTransformTag {:job_id job-id, :tag_id tag-id} {:position position}))

(defn delete-job-tag-links!
  "Delete the links between the TransformJob with `job-id` and the tags with `tag-ids`."
  [job-id tag-ids]
  (t2/delete! :model/TransformJobTransformTag :job_id job-id :tag_id [:in tag-ids]))

;;; ---------------------------------------------- Transform runs ----------------------------------------------

(defn run
  "The TransformRun with `run-id`, or nil."
  [run-id]
  (t2/select-one :model/TransformRun :id run-id))

(defn runs
  "The TransformRuns with `run-ids`."
  [run-ids]
  (t2/select :model/TransformRun :id [:in run-ids]))

(defn runs-for-transform
  "The TransformRuns of the Transform with `transform-id`, newest first."
  [transform-id]
  (t2/select :model/TransformRun :transform_id transform-id {:order-by [[:start_time :desc] [:end_time :desc]]}))

(defn runs-for-job-run
  "The TransformRuns of the TransformJobRun with `job-run-id`, oldest first."
  [job-run-id]
  (t2/select :model/TransformRun {:where [:= :job_run_id job-run-id], :order-by [[:start_time :asc]]}))

(defn runs-for-dag-run
  "The TransformRuns of the TransformDagRun with `dag-run-id`, oldest first."
  [dag-run-id]
  (t2/select :model/TransformRun {:where [:= :dag_run_id dag-run-id], :order-by [[:start_time :asc]]}))

(defn- paged-runs-where
  "Builds a `:where` clause for the paged run listing from plain filter data. `started-at-start`/`started-at-end`
  and `ended-at-start`/`ended-at-end` are instant bounds (as returned by parsing a date-range string at the call
  site); either half of a pair may be nil."
  [{:keys [started-at-start started-at-end ended-at-start ended-at-end run-methods transform-ids
           transform-tag-ids statuses user-id]}]
  (let [where-cond (cond-> []
                     started-at-start (conj [:>= :start_time started-at-start])
                     started-at-end   (conj [:<  :start_time started-at-end])
                     ended-at-start   (conj [:>= :end_time ended-at-start])
                     ended-at-end     (conj [:<  :end_time ended-at-end])

                     (seq run-methods)
                     (conj [:in :run_method (set run-methods)])

                     (seq transform-ids)
                     (conj [:in :transform_id transform-ids])

                     (seq transform-tag-ids)
                     (conj [:in :transform_id ^:allow-subquery
                            {:select [:transform_id]
                             :from   [:transform_transform_tag]
                             :where  [:in :tag_id transform-tag-ids]}])

                     (seq statuses)
                     (conj [:in :status (set statuses)])

                     ;; optimization: is_active condition for started status
                     (and (= (first statuses) "started")
                          (nil? (next statuses)))
                     (conj [:= :is_active true])

                     (some? user-id)
                     (conj [:= :user_id user-id]))]
    (when (seq where-cond)
      (into [:and] where-cond))))

(defn- paged-runs-join
  "Returns a `:left-join` clause for run listing sort columns that require joining other tables."
  [sort-column]
  (case (keyword sort-column)
    :transform-name [:transform [:= :transform_run.transform_id :transform.id]]
    nil))

(defn- label-case
  "A Honey SQL `:case` expression translating each value of `test-column` per `labels` (a map of raw value to
  display label), falling back to `fallback` (`test-column` itself, by default) when it matches none of them."
  ([test-column labels] (label-case test-column labels test-column))
  ([test-column labels fallback]
   (-> [:case]
       (into (mapcat (fn [[value label]] [[:= test-column value] label])) labels)
       (conj :else fallback))))

(defn- first-tag-name-subquery
  "A correlated subquery selecting the translated name of the first tag (by minimum position) assigned to the
  transform for a transform run. `tag-name-labels` translates built-in tag names (e.g. `\"hourly\"`); a tag with no
  matching built-in type displays its own name."
  [tag-name-labels]
  ^:allow-subquery
  {:select [[(label-case :tt.built_in_type tag-name-labels :tt.name) :tag_name]]
   :from   [[:transform_transform_tag :ttt]]
   :join   [[:transform_tag :tt] [:= :ttt.tag_id :tt.id]]
   :where  [:and
            [:= :ttt.transform_id :transform_run.transform_id]
            [:= :ttt.position ^:allow-subquery
             {:select [[[:min :ttt2.position]]]
              :from   [[:transform_transform_tag :ttt2]]
              :where  [:= :ttt2.transform_id :transform_run.transform_id]}]]})

(defn- paged-runs-order-by
  "Builds a `:order-by` clause for the paged run listing, translating display values for sortable columns per
  `status-labels`/`run-method-labels`/`tag-name-labels` (maps of raw value to display label)."
  [sort-column sort-direction status-labels run-method-labels tag-name-labels]
  (let [sort-column    (or (keyword sort-column) :start-time)
        sort-direction (or (keyword sort-direction) :desc)
        nulls-sort     (if (= sort-direction :asc)
                         :nulls-last
                         :nulls-first)]
    (conj
     (case sort-column
       :transform-name  [[:transform.name sort-direction]]
       :start-time      [[:start_time sort-direction]]
       :end-time        [[:end_time sort-direction nulls-sort]]
       :status          [[(label-case :status status-labels) sort-direction]]
       :run-method      [[(label-case :run_method run-method-labels) sort-direction]]
       :transform-tags  [[(first-tag-name-subquery tag-name-labels) sort-direction nulls-sort]]
       ;; In-progress runs (end_time = nil) sink to the bottom in BOTH
       ;; directions — null means "no measurable duration yet," not
       ;; "longest duration."
       :duration        [[[:is :end_time nil] :asc]
                         [(h2x/calculate-interval-honeysql-form
                           (mdb/db-type) :end_time :start_time)
                          sort-direction]]
       [[:start_time sort-direction]
        [:end_time   sort-direction nulls-sort]])
     [:transform_run.id sort-direction])))

(defn paged-runs
  "Up to `limit` (offset by `offset`) TransformRuns matching `filters` (see [[paged-runs-where]] for the supported
  keys), sorted by `sort-column`/`sort-direction` (translating `status`, `run-method`, and `transform-tags` sort
  columns per `status-labels`/`run-method-labels`/`tag-name-labels`)."
  [filters sort-column sort-direction status-labels run-method-labels tag-name-labels limit offset]
  (let [where-clause (paged-runs-where filters)
        join-clause  (paged-runs-join sort-column)]
    (t2/select :model/TransformRun
               (m/assoc-some {:order-by (paged-runs-order-by sort-column sort-direction status-labels
                                                             run-method-labels tag-name-labels)
                              :offset   offset
                              :limit    limit}
                             :select (when join-clause [:transform_run.*])
                             :where where-clause
                             :left-join join-clause))))

(defn paged-run-count
  "The number of TransformRuns matching `filters` (see [[paged-runs-where]] for the supported keys)."
  [filters]
  (t2/count :model/TransformRun (m/assoc-some {} :where (paged-runs-where filters))))

(defn latest-runs-reducible
  "Reducible latest TransformRun of each Transform with `transform-ids`."
  [transform-ids]
  (t2/reducible-select :model/TransformRun
                       {:with   [[:latest_runs
                                  ^:allow-subquery
                                  {:select [:*
                                            [[:over [[:row_number]
                                                     ^:allow-subquery {:partition-by :transform_id
                                                                       :order-by     [[:start_time :desc]]}]]
                                             :rn]]
                                   :from   [:transform_run]
                                   :where  [:in :transform_id transform-ids]}]]
                        :select [:*]
                        :from   [:latest_runs]
                        :where  [:= :rn [:inline 1]]}))

(defn active-run-for-transform
  "The active TransformRun of the Transform with `transform-id`, or nil."
  [transform-id]
  (t2/select-one :model/TransformRun :transform_id transform-id :is_active true))

(defn active-run-ids-of-parent
  "The IDs of the active TransformRuns whose `parent-column` is `parent-run-id`."
  [parent-column parent-run-id]
  (t2/select-pks-vec :model/TransformRun parent-column parent-run-id :is_active true))

(defn lock-active-runs
  "The active TransformRuns among `run-ids`, locked for update."
  [run-ids]
  (t2/select :model/TransformRun {:where [:and [:= :is_active true] [:in :id run-ids]]
                                  :for   :update}))

(defn last-success-times
  "Rows of Transform ID and the latest `end_time` of its succeeded runs for `transform-ids`."
  [transform-ids]
  (t2/select :model/TransformRun
             {:select   [:transform_id [[:max :end_time] :last_success]]
              :where    [:and
                         [:in :transform_id transform-ids]
                         [:= :status "succeeded"]]
              :group-by [:transform_id]}))

(defn insert-run!
  "Insert `run` and return the new instance."
  [run]
  (t2/insert-returning-instance! :model/TransformRun run))

(defn finish-active-run!
  "Apply `changes` to the TransformRun with `run-id` if it is still active, returning the number of rows updated."
  [run-id changes]
  (t2/update! :model/TransformRun :id run-id :is_active true changes))

(defn cancel-active-runs!
  "Mark the active TransformRuns among `run-ids` canceled because the user asked but the run could not be stopped."
  [run-ids]
  (t2/update! :model/TransformRun
              :id [:in run-ids]
              :is_active true
              {:status    :canceled
               :end_time  :%now
               :is_active nil
               :message   "Canceled by user but could not guarantee run stopped."}))

(defn mark-run-canceling!
  "Set the status of the TransformRun with `run-id` to canceling."
  [run-id]
  (t2/update! :model/TransformRun :id run-id {:status "canceling"}))

;;; -------------------------------------------- Run cancelations --------------------------------------------

(defn insert-cancelation-for-active-run!
  "Record a cancelation request for the TransformRun with `run-id` if it is active and none exists yet."
  [run-id]
  (t2/query-one [(str "INSERT INTO transform_run_cancelation (run_id) "
                      "SELECT transform_run.id "
                      "FROM transform_run "
                      "WHERE transform_run.id = ? "
                      "AND transform_run.is_active "
                      "AND NOT EXISTS (SELECT 1 FROM transform_run_cancelation WHERE run_id = ?)")
                 run-id run-id]))

(defn cancelations-reducible
  "Reducible TransformRunCancelations."
  []
  (t2/reducible-select :model/TransformRunCancelation))

(defn cancelations-requested-before
  "The run ID and request time of the TransformRunCancelations requested before `cutoff`."
  [cutoff]
  (t2/select [:model/TransformRunCancelation :run_id :time] :time [:< cutoff]))

(defn delete-cancelation-for-inactive-run!
  "Delete the TransformRunCancelation of the TransformRun with `run-id` if that run is no longer active."
  [run-id]
  (t2/delete! :model/TransformRunCancelation {:where [:and [:= :run_id run-id] no-active-run-clause]}))

(defn delete-cancelations-for-inactive-runs!
  "Delete every TransformRunCancelation whose run is no longer active."
  []
  (t2/delete! :model/TransformRunCancelation {:where no-active-run-clause}))

;;; ------------------------------------------- Job and DAG runs -------------------------------------------

(defn touch-active-job-run!
  "Stamp `updated_at` on the active TransformJobRun with `run-id`."
  [run-id]
  (t2/update! :model/TransformJobRun :id run-id :is_active true {:updated_at :%now}))

(defn touch-active-dag-run!
  "Stamp `updated_at` on the active TransformDagRun with `run-id`."
  [run-id]
  (t2/update! :model/TransformDagRun :id run-id :is_active true {:updated_at :%now}))

(defn finish-active-job-run!
  "Apply `changes` to the TransformJobRun with `run-id` if it is still active, returning the number of rows
  updated."
  [run-id changes]
  (t2/update! :model/TransformJobRun :id run-id :is_active true changes))

(defn finish-active-dag-run!
  "Apply `changes` to the TransformDagRun with `run-id` if it is still active, returning the number of rows
  updated."
  [run-id changes]
  (t2/update! :model/TransformDagRun :id run-id :is_active true changes))

(defn- job-run-where
  [job-id status run-method started-at-start started-at-end]
  (let [conditions (cond-> []
                     job-id             (conj [:= :job_id job-id])
                     status             (conj [:= :status status])
                     (= status "started") (conj [:= :is_active true])
                     run-method         (conj [:= :run_method run-method])
                     started-at-start   (conj [:>= :start_time started-at-start])
                     started-at-end     (conj [:< :start_time started-at-end]))]
    (when (seq conditions)
      (into [:and] conditions))))

(defn- job-run-order-by
  [sort-column sort-direction]
  (let [sort-direction (or (keyword sort-direction) :desc)
        nulls-sort     (if (= sort-direction :asc) :nulls-last :nulls-first)]
    (case (keyword sort-column)
      :start_time [[:start_time sort-direction]]
      :end_time   [[:end_time sort-direction nulls-sort]]
      [[:start_time sort-direction]
       [:end_time   sort-direction nulls-sort]])))

(defn job-runs
  "Up to `limit` (offset by `offset`) TransformJobRuns, optionally narrowed to `job-id`, `status`, `run-method`, and
  started in [`started-at-start`, `started-at-end`), sorted by `sort-column`/`sort-direction`."
  [job-id status run-method started-at-start started-at-end sort-column sort-direction limit offset]
  (t2/select :model/TransformJobRun
             (cond-> {:order-by (job-run-order-by sort-column sort-direction)
                      :offset   offset
                      :limit    limit}
               (job-run-where job-id status run-method started-at-start started-at-end)
               (assoc :where (job-run-where job-id status run-method started-at-start started-at-end)))))

(defn job-run-count
  "The number of TransformJobRuns, optionally narrowed to `job-id`, `status`, `run-method`, and started in
  [`started-at-start`, `started-at-end`)."
  [job-id status run-method started-at-start started-at-end]
  (t2/count :model/TransformJobRun
            (if-let [where (job-run-where job-id status run-method started-at-start started-at-end)]
              {:where where}
              {})))

(defn latest-job-runs-reducible
  "Reducible latest TransformJobRun of each TransformJob with `job-ids`."
  [job-ids]
  (t2/reducible-select :model/TransformJobRun
                       {:with   [[:ranked_runs
                                  ^:allow-subquery
                                  {:select [:*
                                            [[:over [[:row_number]
                                                     ^:allow-subquery {:partition-by :job_id
                                                                       :order-by     [[:start_time :desc]]}]]
                                             :rn]]
                                   :from   [:transform_job_run]
                                   :where  [:in :job_id job-ids]}]]
                        :select [:*]
                        :from   [:ranked_runs]
                        :where  [:= :rn [:inline 1]]}))

(defn active-job-run-for-job
  "The active TransformJobRun of the TransformJob with `job-id`, or nil."
  [job-id]
  (t2/select-one :model/TransformJobRun :job_id job-id :is_active true))

(defn failed-cron-job-runs-between
  "The job ID, start time, and message of the cron TransformJobRuns that failed or timed out in `[start, end)`,
  oldest first."
  [start end]
  (t2/select [:model/TransformJobRun :job_id :start_time :message]
             {:where    [:and
                         [:= :run_method "cron"]
                         [:in :status ["failed" "timeout"]]
                         [:>= :start_time start]
                         [:< :start_time end]]
              :order-by [[:start_time :asc]]}))

(defn insert-job-run!
  "Insert `job-run` and return the new instance."
  [job-run]
  (t2/insert-returning-instance! :model/TransformJobRun job-run))

(defn active-dag-run-for-transform
  "The active TransformDagRun seeded from the Transform with `transform-id`, or nil."
  [transform-id]
  (t2/select-one :model/TransformDagRun :source_transform_id transform-id :is_active true))

(defn insert-dag-run!
  "Insert `dag-run` and return the new instance."
  [dag-run]
  (t2/insert-returning-instance! :model/TransformDagRun dag-run))

;;; ------------------------------------------ Root run listing ------------------------------------------

;; Each branch must project the same columns in the same order for the UNION ALL to line up;
;; `[nil :col]` fills in columns a table lacks.

(defn- job-run-subquery [transform-ids]
  ^:allow-subquery
  {:select [[^:allow-raw-sql [:inline "job"] :run_type]
            :id
            [:job_id :entity_id]
            [:job_name :entity_name]
            [nil :direction]
            [nil :transform_count]
            :run_method
            :status :is_active :start_time :end_time :message
            [nil :user_id]]
   :from   [:transform_job_run]
   :where  (if (seq transform-ids)
             ;; only job runs that actually ran one of these transforms
             [:exists ^:allow-subquery {:select [[[:inline 1]]]
                                        :from   [[:transform_run :member]]
                                        :where  [:and
                                                 [:= :member.job_run_id :transform_job_run.id]
                                                 [:in :member.transform_id transform-ids]]}]
             true)})

(defn- dag-run-subquery [transform-ids]
  ^:allow-subquery
  {:select [[^:allow-raw-sql [:inline "dag"] :run_type]
            :id
            [:source_transform_id :entity_id]
            [:source_transform_name :entity_name]
            :direction
            :transform_count
            [^:allow-raw-sql [:inline "manual"] :run_method]
            :status :is_active :start_time :end_time :message
            :user_id]
   :from   [:transform_dag_run]
   :where  (if (seq transform-ids)
             [:exists ^:allow-subquery {:select [[[:inline 1]]]
                                        :from   [[:transform_run :member]]
                                        :where  [:and
                                                 [:= :member.dag_run_id :transform_dag_run.id]
                                                 [:in :member.transform_id transform-ids]]}]
             true)})

(defn- transform-run-subquery [transform-ids]
  ^:allow-subquery
  {:select [[^:allow-raw-sql [:inline "transform"] :run_type]
            :id
            [:transform_id :entity_id]
            [:transform_name :entity_name]
            [nil :direction]
            [nil :transform_count]
            :run_method
            :status :is_active :start_time :end_time :message
            :user_id]
   :from   [:transform_run]
   ;; standalone runs only: those not coordinated by a job or DAG run
   :where  (cond-> [:and
                    [:= :job_run_id nil]
                    [:= :dag_run_id nil]]
             (seq transform-ids) (conj [:in :transform_id transform-ids]))})

(defn- union-subquery
  "The UNION ALL of the branches selected by `types` (a subset of `#{:job :dag :transform}`), each optionally
  narrowed to runs touching one of `transform-ids`."
  [types transform-ids]
  (let [types (set (or (seq types) #{:job :dag :transform}))]
    ^:allow-subquery
    {:union-all (cond-> []
                  (:job types)       (conj (job-run-subquery transform-ids))
                  (:dag types)       (conj (dag-run-subquery transform-ids))
                  (:transform types) (conj (transform-run-subquery transform-ids)))}))

(defn- root-run-summaries-where
  [statuses run-methods started-at-start started-at-end ended-at-start ended-at-end]
  (let [where (into [:and] (remove nil?)
                    [(when (seq statuses)    [:in :status (set statuses)])
                     ;; started ⇒ still active, as in the per-table run listings
                     (when (= (set statuses) #{"started"}) [:= :is_active true])
                     (when (seq run-methods) [:in :run_method (set run-methods)])
                     (when started-at-start [:>= :start_time started-at-start])
                     (when started-at-end   [:<  :start_time started-at-end])
                     (when ended-at-start   [:>= :end_time ended-at-start])
                     (when ended-at-end     [:<  :end_time ended-at-end])])]
    (when (> (count where) 1) where)))

(defn- root-run-order-by
  "Standard `:order-by` clause for a paged root-run listing. Sorts by `sort-column` (`:start_time` or `:end_time`;
  anything else — including nil — falls back to ordering by start_time then end_time) in `sort-direction`
  (`:asc`/`:desc`, defaulting to `:desc`), with in-progress rows (null `end_time`) always ordered last."
  [sort-column sort-direction]
  (let [sort-direction (or (keyword sort-direction) :desc)
        nulls-sort     (if (= sort-direction :asc) :nulls-last :nulls-first)]
    (case (keyword sort-column)
      :start_time [[:start_time sort-direction]]
      :end_time   [[:end_time sort-direction nulls-sort]]
      [[:start_time sort-direction]
       [:end_time   sort-direction nulls-sort]])))

(defn root-run-summaries-page
  "Up to `limit` (offset by `offset`) root-run summary rows -- see [[metabase.transforms.run-listing]] -- of `types`
  (a subset of `#{:job :dag :transform}`, or all three when empty), optionally narrowed to `statuses`,
  `run-methods`, started in [`started-at-start`, `started-at-end`), ended in [`ended-at-start`, `ended-at-end`),
  and/or touching one of `transform-ids`, sorted by `sort-column`/`sort-direction`."
  [types statuses run-methods started-at-start started-at-end ended-at-start ended-at-end transform-ids
   sort-column sort-direction limit offset]
  (let [where (root-run-summaries-where statuses run-methods started-at-start started-at-end ended-at-start
                                        ended-at-end)
        base  (cond-> {:from [[(union-subquery types transform-ids) :runs]]}
                where (assoc :where where))]
    (t2/query (merge base {:select   [:*]
                           :order-by (root-run-order-by sort-column sort-direction)
                           :limit    limit
                           :offset   offset}))))

(defn root-run-summaries-count
  "The number of root-run summary rows matching the same filters as [[root-run-summaries-page]]."
  [types statuses run-methods started-at-start started-at-end ended-at-start ended-at-end transform-ids]
  (let [where (root-run-summaries-where statuses run-methods started-at-start started-at-end ended-at-start
                                        ended-at-end)
        base  (cond-> {:from [[(union-subquery types transform-ids) :runs]]}
                where (assoc :where where))]
    (:count (first (t2/query (merge base {:select [[[:count :*] :count]]}))))))

(defn app-db-now
  "The current time according to the application database."
  []
  (:now (t2/query-one {:select [[(h2x/current-datetime-honeysql-form (mdb/db-type)) :now]]})))

;;; ----------------------------------------------- Other models -----------------------------------------------

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table table-id))

(defn databases
  "The Databases with `database-ids`."
  [database-ids]
  (t2/select :model/Database :id [:in database-ids]))

(defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id]
  (t2/exists? :model/Database :id database-id))

(defn tables
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn table-indexes-for-transforms
  "The TableIndexes of the Transforms with `transform-ids`, ordered by index name."
  [transform-ids]
  (t2/select :model/TableIndex :transform_id [:in transform-ids] {:order-by [[:index_name :asc]]}))

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field field-id))

(defn field-exists?
  "Whether a Field with `field-id` exists."
  [field-id]
  (t2/exists? :model/Field :id field-id))

(defn active-field-ids-by-name
  "A map of name to ID for the active Fields of the Table with `table-id`."
  [table-id]
  (t2/select-fn->fn :name :id [:model/Field :name :id] :table_id table-id :active true))

(defn active-users
  "The active Users with `user-ids`."
  [user-ids]
  (t2/select :model/User :id [:in user-ids] :is_active true))

(defn active-admins
  "The active superusers."
  []
  (t2/select :model/User :is_superuser true :is_active true))

(defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))
