(ns metabase.transforms.db
  "Application database queries for the transforms module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
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
  "The Transforms whose source type is one of `source-types`, narrowed by the optional Honey SQL `database-clause`,
  ordered by ID."
  [source-types database-clause]
  (t2/select :model/Transform {:where    [:and [:in :source_type source-types] database-clause]
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

(defn hydrate-transform-details
  "Hydrate the last run, tag IDs, creator, owner, and permissions onto `transforms`."
  [transforms]
  (t2/hydrate transforms :last_run :transform_tag_ids :creator :owner :can_read :can_write :can_execute))

(defn hydrate-transform-associations
  "Hydrate the tag IDs, creator, owner, and permissions onto `transform`."
  [transform]
  (t2/hydrate transform :transform_tag_ids :creator :owner :can_read :can_write :can_execute))

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

(defn runs-where
  "The TransformRuns matching the Honey SQL `query`."
  [query]
  (t2/select :model/TransformRun query))

(defn run-count-where
  "The number of TransformRuns matching the Honey SQL `query`."
  [query]
  (t2/count :model/TransformRun query))

(defn latest-runs-reducible
  "Reducible TransformRuns of the Honey SQL `query`."
  [query]
  (t2/reducible-select :model/TransformRun query))

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

(defn hydrate-run-transforms
  "Hydrate the Transform with its Collection and tag IDs onto `runs`."
  [runs]
  (t2/hydrate runs [:transform :collection :transform_tag_ids]))

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

(defn touch-active-run!
  "Stamp `updated_at` on the active run of `model` with `run-id`."
  [model run-id]
  (t2/update! model :id run-id :is_active true {:updated_at :%now}))

(defn finish-active-coordinated-run!
  "Apply `changes` to the run of `model` with `run-id` if it is still active, returning the number of rows updated."
  [model run-id changes]
  (t2/update! model :id run-id :is_active true changes))

(defn job-runs-where
  "The TransformJobRuns matching the Honey SQL `query`."
  [query]
  (t2/select :model/TransformJobRun query))

(defn job-run-count-where
  "The number of TransformJobRuns matching the Honey SQL `query`."
  [query]
  (t2/count :model/TransformJobRun query))

(defn latest-job-runs-reducible
  "Reducible TransformJobRuns of the Honey SQL `query`."
  [query]
  (t2/reducible-select :model/TransformJobRun query))

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

(defn query-rows
  "The rows of the Honey SQL `query`."
  [query]
  (t2/query query))

(defn now-row
  "The `:now` row holding the SQL expression `now-expr`."
  [now-expr]
  (t2/query-one {:select [[now-expr :now]]}))

;;; ----------------------------------------------- Other models -----------------------------------------------

(defn instance
  "The instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one model id))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

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

(defn hydrate-db-and-fields
  "Hydrate `:db` and `:fields` onto `tables`."
  [tables]
  (t2/hydrate tables :db :fields))

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
