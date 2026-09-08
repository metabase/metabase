(ns metabase.transforms.db
  "Application database queries for the transforms module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private TransformRow
  "Closed whole-row schema for `t2/insert!`/`t2/update!` against the `transform` table."
  [:map {:closed true}
   [:name                {:optional true} :any]
   [:description          {:optional true} :any]
   [:source               {:optional true} :any]
   [:target               {:optional true} :any]
   [:entity_id            {:optional true} :any]
   [:created_at           {:optional true} :any]
   [:updated_at           {:optional true} :any]
   [:source_type          {:optional true} :any]
   [:creator_id           {:optional true} :any]
   [:source_database_id   {:optional true} :any]
   [:collection_id        {:optional true} :any]
   [:owner_user_id        {:optional true} :any]
   [:owner_email          {:optional true} :any]
   [:target_db_id         {:optional true} :any]
   [:last_checkpoint_value {:optional true} :any]
   [:target_table_id      {:optional true} :any]
   [:table_dependencies   {:optional true} :any]
   [:run_trigger          {:optional true} :any]])

(def ^:private no-active-run-clause
  "Honey SQL clause matching TransformRunCancelation rows whose run is no longer active."
  [:not [:exists ^:allow-subquery
         {:select [1]
          :from   [[:transform_run :wr]]
          :where  [:and
                   [:= :wr.id :transform_run_cancelation.run_id]
                   :wr.is_active]}]])

;;; ------------------------------------------------ Transform ------------------------------------------------

(mu/defn transform :- [:maybe (ms/InstanceOf :model/Transform)]
  "The Transform with `transform-id`, or nil."
  [transform-id :- ms/PositiveInt]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn transforms :- [:sequential (ms/InstanceOf :model/Transform)]
  "The Transforms with `transform-ids`."
  [transform-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Transform :id [:in transform-ids]))

(mu/defn transforms-of-source-types :- [:sequential (ms/InstanceOf :model/Transform)]
  "The Transforms whose source type is one of `source-types`, optionally narrowed to `database-id`, ordered by ID."
  [source-types :- [:seqable :string]
   database-id  :- [:maybe ms/PositiveInt]]
  (t2/select :model/Transform {:where    [:and
                                          [:in :source_type source-types]
                                          (when database-id [:= :source_database_id database-id])]
                               :order-by [[:id :asc]]}))

(mu/defn transform-dependency-rows :- [:sequential (ms/InstanceOf :model/Transform)]
  "The ID, target, target Table ID, creation time, and table dependencies of every Transform."
  []
  (t2/select [:model/Transform :id :target :target_table_id :created_at :table_dependencies]))

(mu/defn transform-snapshot :- [:maybe (ms/InstanceOf :model/Transform)]
  "The name, entity ID, and source type of the Transform with `transform-id`."
  [transform-id :- ms/PositiveInt]
  (t2/select-one [:model/Transform :name :entity_id :source_type] :id transform-id))

(mu/defn transform-summaries-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Transform)]
  "A map of ID to the ID, name, and Collection ID of the Transforms with `transform-ids`."
  [transform-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity [:model/Transform :id :name :collection_id] :id [:in transform-ids]))

(mu/defn transform-names-by-id :- [:map-of ms/PositiveInt :string]
  "A map of ID to name for the Transforms with `transform-ids`."
  [transform-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :name :model/Transform :id [:in transform-ids]))

(mu/defn transform-last-checkpoint-value :- :any
  "The last checkpoint value of the Transform with `transform-id`."
  [transform-id :- ms/PositiveInt]
  (t2/select-one-fn :last_checkpoint_value [:model/Transform :last_checkpoint_value] transform-id))

(mu/defn transform-collection-id :- [:maybe ms/PositiveInt]
  "The Collection ID of the Transform with `transform-id`."
  [transform-id :- ms/PositiveInt]
  (t2/select-one-fn :collection_id :model/Transform :id transform-id))

(mu/defn insert-transform! :- (ms/InstanceOf :model/Transform)
  "Insert `transform` and return the new instance."
  [transform :- TransformRow]
  (t2/insert-returning-instance! :model/Transform transform))

(mu/defn update-transform! :- :int
  "Apply `changes` to the Transform with `transform-id`."
  [transform-id :- ms/PositiveInt
   changes      :- TransformRow]
  (t2/update! :model/Transform transform-id changes))

(mu/defn delete-transform! :- :int
  "Delete the Transform with `transform-id`."
  [transform-id :- ms/PositiveInt]
  (t2/delete! :model/Transform transform-id))

;;; ---------------------------------------------- Transform tags ----------------------------------------------

(mu/defn tag :- [:maybe (ms/InstanceOf :model/TransformTag)]
  "The TransformTag with `tag-id`, or nil."
  [tag-id :- ms/PositiveInt]
  (t2/select-one :model/TransformTag :id tag-id))

(mu/defn existing-tag-ids :- [:maybe [:set ms/PositiveInt]]
  "The subset of `tag-ids` that exist."
  [tag-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn-set :id :model/TransformTag :id [:in tag-ids]))

(mu/defn tag-name-exists? :- :boolean
  "Whether a TransformTag named `tag-name` exists."
  [tag-name :- :string]
  (t2/exists? :model/TransformTag :name tag-name))

(mu/defn tag-name-exists-excluding? :- :boolean
  "Whether a TransformTag named `tag-name` other than `tag-id` exists."
  [tag-name :- :string
   tag-id   :- ms/PositiveInt]
  (t2/exists? :model/TransformTag :name tag-name :id [:not= tag-id]))

(mu/defn transform-tag-links :- [:sequential (ms/InstanceOf :model/TransformTransformTag)]
  "The tag links of the Transforms with `transform-ids`, ordered by position."
  [transform-ids :- [:seqable [:maybe ms/PositiveInt]]]
  (t2/select :model/TransformTransformTag :transform_id [:in transform-ids] {:order-by [[:position :asc]]}))

(mu/defn transform-tag-links-for-tags :- [:sequential (ms/InstanceOf :model/TransformTransformTag)]
  "The tag ID and Transform ID of the tag links of the TransformTags with `tag-ids`."
  [tag-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/TransformTransformTag :tag_id :transform_id] :tag_id [:in tag-ids]))

(mu/defn transform-ids-with-tags :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Transforms tagged with one of `tag-ids`."
  [tag-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn-set :transform_id :model/TransformTransformTag :tag_id [:in tag-ids]))

(mu/defn active-job-schedules-for-transforms :- [:sequential (ms/InstanceOf :model/TransformTransformTag)]
  "Rows of Transform ID and the schedule of each active TransformJob that runs it through a shared tag."
  [transform-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/TransformTransformTag
             {:select [:ttt.transform_id [:job.schedule :schedule]]
              :from   [[:transform_transform_tag :ttt]]
              :join   [[:transform_job_transform_tag :jtt] [:= :ttt.tag_id :jtt.tag_id]
                       [:transform_job :job] [:= :jtt.job_id :job.id]]
              :where  [:and
                       [:in :ttt.transform_id transform-ids]
                       [:= :job.active true]]}))

(mu/defn insert-transform-tag-links! :- :int
  "Insert the TransformTransformTag `rows`."
  [rows :- [:seqable
            [:map {:closed true}
             [:transform_id {:optional true} :any]
             [:tag_id       {:optional true} :any]
             [:entity_id    {:optional true} :any]
             [:position     {:optional true} :any]]]]
  (t2/insert! :model/TransformTransformTag rows))

(mu/defn set-transform-tag-position! :- :int
  "Set the position of the tag link between the Transform with `transform-id` and the tag with `tag-id`."
  [transform-id :- ms/PositiveInt
   tag-id       :- ms/PositiveInt
   position     :- ms/IntGreaterThanOrEqualToZero]
  (t2/update! :model/TransformTransformTag {:transform_id transform-id, :tag_id tag-id} {:position position}))

(mu/defn delete-transform-tag-links! :- :int
  "Delete the links between the Transform with `transform-id` and the tags with `tag-ids`."
  [transform-id :- ms/PositiveInt
   tag-ids      :- [:seqable ms/PositiveInt]]
  (t2/delete! :model/TransformTransformTag :transform_id transform-id :tag_id [:in tag-ids]))

;;; ---------------------------------------------- Transform jobs ----------------------------------------------

(mu/defn job :- [:maybe (ms/InstanceOf :model/TransformJob)]
  "The TransformJob with `job-id`, or nil."
  [job-id :- ms/PositiveInt]
  (t2/select-one :model/TransformJob :id job-id))

(mu/defn active-jobs :- [:sequential (ms/InstanceOf :model/TransformJob)]
  "The active TransformJobs."
  []
  (t2/select :model/TransformJob :active true))

(mu/defn job-snapshot :- [:maybe (ms/InstanceOf :model/TransformJob)]
  "The name, entity ID, and built-in type of the TransformJob with `job-id`."
  [job-id :- ms/PositiveInt]
  (t2/select-one [:model/TransformJob :name :entity_id :built_in_type] :id job-id))

(mu/defn job-names-by-id :- [:map-of ms/PositiveInt :string]
  "A map of ID to name for the TransformJobs with `job-ids`."
  [job-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :name :model/TransformJob :id [:in job-ids]))

(mu/defn activate-job! :- :int
  "Mark the inactive TransformJob with `job-id` active, returning the number of rows updated."
  [job-id :- ms/PositiveInt]
  (t2/update! :model/TransformJob {:id job-id, :active false} {:active true}))

(mu/defn deactivate-job! :- :int
  "Mark the active TransformJob with `job-id` inactive, returning the number of rows updated."
  [job-id :- ms/PositiveInt]
  (t2/update! :model/TransformJob {:id job-id, :active true} {:active false}))

(mu/defn job-tag-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the tags of the TransformJob with `job-id`."
  [job-id :- ms/PositiveInt]
  (t2/select-fn-set :tag_id :model/TransformJobTransformTag :job_id job-id))

(mu/defn job-tag-links :- [:sequential (ms/InstanceOf :model/TransformJobTransformTag)]
  "The tag links of the TransformJobs with `job-ids`, ordered by position."
  [job-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/TransformJobTransformTag :job_id [:in job-ids] {:order-by [[:position :asc]]}))

(mu/defn insert-job-tag-links! :- :int
  "Insert the TransformJobTransformTag `rows`."
  [rows :- [:seqable
            [:map {:closed true}
             [:job_id    {:optional true} :any]
             [:tag_id    {:optional true} :any]
             [:entity_id {:optional true} :any]
             [:position  {:optional true} :any]]]]
  (t2/insert! :model/TransformJobTransformTag rows))

(mu/defn set-job-tag-position! :- :int
  "Set the position of the tag link between the TransformJob with `job-id` and the tag with `tag-id`."
  [job-id   :- ms/PositiveInt
   tag-id   :- ms/PositiveInt
   position :- ms/IntGreaterThanOrEqualToZero]
  (t2/update! :model/TransformJobTransformTag {:job_id job-id, :tag_id tag-id} {:position position}))

(mu/defn delete-job-tag-links! :- :int
  "Delete the links between the TransformJob with `job-id` and the tags with `tag-ids`."
  [job-id  :- ms/PositiveInt
   tag-ids :- [:seqable ms/PositiveInt]]
  (t2/delete! :model/TransformJobTransformTag :job_id job-id :tag_id [:in tag-ids]))

;;; ---------------------------------------------- Transform runs ----------------------------------------------

(mu/defn run :- [:maybe (ms/InstanceOf :model/TransformRun)]
  "The TransformRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one :model/TransformRun :id run-id))

(mu/defn runs :- [:sequential (ms/InstanceOf :model/TransformRun)]
  "The TransformRuns with `run-ids`."
  [run-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/TransformRun :id [:in run-ids]))

(mu/defn runs-for-transform :- [:sequential (ms/InstanceOf :model/TransformRun)]
  "The TransformRuns of the Transform with `transform-id`, newest first."
  [transform-id :- ms/PositiveInt]
  (t2/select :model/TransformRun :transform_id transform-id {:order-by [[:start_time :desc] [:end_time :desc]]}))

(mu/defn runs-for-job-run :- [:sequential (ms/InstanceOf :model/TransformRun)]
  "The TransformRuns of the TransformJobRun with `job-run-id`, oldest first."
  [job-run-id :- ms/PositiveInt]
  (t2/select :model/TransformRun {:where [:= :job_run_id job-run-id], :order-by [[:start_time :asc]]}))

(mu/defn runs-for-dag-run :- [:sequential (ms/InstanceOf :model/TransformRun)]
  "The TransformRuns of the TransformDagRun with `dag-run-id`, oldest first."
  [dag-run-id :- ms/PositiveInt]
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

(def ^:private RunFilters
  [:map {:closed true}
   [:started-at-start  [:maybe ms/TemporalInstant]]
   [:started-at-end    [:maybe ms/TemporalInstant]]
   [:ended-at-start    [:maybe ms/TemporalInstant]]
   [:ended-at-end      [:maybe ms/TemporalInstant]]
   [:run-methods       [:maybe [:seqable :string]]]
   [:transform-ids     [:maybe [:seqable ms/PositiveInt]]]
   [:transform-tag-ids [:maybe [:seqable ms/PositiveInt]]]
   [:statuses          [:maybe [:seqable :string]]]
   [:user-id           [:maybe ms/PositiveInt]]])

(mu/defn paged-runs :- [:sequential (ms/InstanceOf :model/TransformRun)]
  "Up to `limit` (offset by `offset`) TransformRuns matching `filters` (see [[paged-runs-where]] for the supported
  keys), sorted by `sort-column`/`sort-direction` (translating `status`, `run-method`, and `transform-tags` sort
  columns per `status-labels`/`run-method-labels`/`tag-name-labels`)."
  [filters            :- RunFilters
   sort-column        :- [:maybe [:or :keyword :string]]
   sort-direction     :- [:maybe [:or :keyword :string]]
   status-labels      :- [:map-of :string :any]
   run-method-labels  :- [:map-of :string :any]
   tag-name-labels    :- [:map-of :string :any]
   limit              :- ms/PositiveInt
   offset             :- ms/IntGreaterThanOrEqualToZero]
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

(mu/defn paged-run-count :- ms/IntGreaterThanOrEqualToZero
  "The number of TransformRuns matching `filters` (see [[paged-runs-where]] for the supported keys)."
  [filters :- RunFilters]
  (t2/count :model/TransformRun (m/assoc-some {} :where (paged-runs-where filters))))

(mu/defn latest-runs-reducible
  "Reducible latest TransformRun of each Transform with `transform-ids`."
  [transform-ids :- [:seqable ms/PositiveInt]]
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

(mu/defn active-run-for-transform :- [:maybe (ms/InstanceOf :model/TransformRun)]
  "The active TransformRun of the Transform with `transform-id`, or nil."
  [transform-id :- ms/PositiveInt]
  (t2/select-one :model/TransformRun :transform_id transform-id :is_active true))

(mu/defn active-run-ids-of-parent :- [:maybe [:sequential ms/PositiveInt]]
  "The IDs of the active TransformRuns whose `parent-column` is `parent-run-id`."
  [parent-column :- [:enum :job_run_id :dag_run_id]
   parent-run-id :- ms/PositiveInt]
  (t2/select-pks-vec :model/TransformRun parent-column parent-run-id :is_active true))

(mu/defn lock-active-runs :- [:sequential (ms/InstanceOf :model/TransformRun)]
  "The active TransformRuns among `run-ids`, locked for update."
  [run-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/TransformRun {:where [:and [:= :is_active true] [:in :id run-ids]]
                                  :for   :update}))

(mu/defn last-success-times :- [:sequential (ms/InstanceOf :model/TransformRun)]
  "Rows of Transform ID and the latest `end_time` of its succeeded runs for `transform-ids`."
  [transform-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/TransformRun
             {:select   [:transform_id [[:max :end_time] :last_success]]
              :where    [:and
                         [:in :transform_id transform-ids]
                         [:= :status "succeeded"]]
              :group-by [:transform_id]}))

(def ^:private TransformRunRow
  "Closed whole-row schema for `t2/insert!` against the `transform_run` table."
  [:map {:closed true}
   [:transform_id               {:optional true} :any]
   [:run_method                 {:optional true} :any]
   [:status                     {:optional true} :any]
   [:is_active                  {:optional true} :any]
   [:start_time                 {:optional true} :any]
   [:end_time                   {:optional true} :any]
   [:message                    {:optional true} :any]
   [:user_id                    {:optional true} :any]
   [:transform_name             {:optional true} :any]
   [:transform_entity_id        {:optional true} :any]
   [:checkpoint_filter_field_id {:optional true} :any]
   [:checkpoint_lo_value        {:optional true} :any]
   [:checkpoint_hi_value        {:optional true} :any]
   [:metered_as                 {:optional true} :any]
   [:last_heartbeat             {:optional true} :any]
   [:job_run_id                 {:optional true} :any]
   [:dag_run_id                 {:optional true} :any]])

(mu/defn insert-run! :- (ms/InstanceOf :model/TransformRun)
  "Insert `run` and return the new instance."
  [run :- TransformRunRow]
  (t2/insert-returning-instance! :model/TransformRun run))

(mu/defn finish-active-run! :- :int
  "Apply `changes` to the TransformRun with `run-id` if it is still active, returning the number of rows updated."
  [run-id  :- ms/PositiveInt
   changes :- :map]
  (t2/update! :model/TransformRun :id run-id :is_active true changes))

(mu/defn cancel-active-runs! :- :int
  "Mark the active TransformRuns among `run-ids` canceled because the user asked but the run could not be stopped."
  [run-ids :- [:seqable ms/PositiveInt]]
  (t2/update! :model/TransformRun
              :id [:in run-ids]
              :is_active true
              {:status    :canceled
               :end_time  :%now
               :is_active nil
               :message   "Canceled by user but could not guarantee run stopped."}))

(mu/defn mark-run-canceling! :- :int
  "Set the status of the TransformRun with `run-id` to canceling."
  [run-id :- ms/PositiveInt]
  (t2/update! :model/TransformRun :id run-id {:status "canceling"}))

;;; -------------------------------------------- Run cancelations --------------------------------------------

(mu/defn insert-cancelation-for-active-run! :- :any
  "Record a cancelation request for the TransformRun with `run-id` if it is active and none exists yet."
  [run-id :- ms/PositiveInt]
  (t2/query-one [(str "INSERT INTO transform_run_cancelation (run_id) "
                      "SELECT transform_run.id "
                      "FROM transform_run "
                      "WHERE transform_run.id = ? "
                      "AND transform_run.is_active "
                      "AND NOT EXISTS (SELECT 1 FROM transform_run_cancelation WHERE run_id = ?)")
                 run-id run-id]))

(mu/defn cancelations-reducible
  "Reducible TransformRunCancelations."
  []
  (t2/reducible-select :model/TransformRunCancelation))

(mu/defn cancelations-requested-before :- [:sequential (ms/InstanceOf :model/TransformRunCancelation)]
  "The run ID and request time of the TransformRunCancelations requested before `cutoff`."
  [cutoff :- :any]
  (t2/select [:model/TransformRunCancelation :run_id :time] :time [:< cutoff]))

(mu/defn delete-cancelation-for-inactive-run! :- :int
  "Delete the TransformRunCancelation of the TransformRun with `run-id` if that run is no longer active."
  [run-id :- ms/PositiveInt]
  (t2/delete! :model/TransformRunCancelation {:where [:and [:= :run_id run-id] no-active-run-clause]}))

(mu/defn delete-cancelations-for-inactive-runs! :- :int
  "Delete every TransformRunCancelation whose run is no longer active."
  []
  (t2/delete! :model/TransformRunCancelation {:where no-active-run-clause}))

;;; ------------------------------------------- Job and DAG runs -------------------------------------------

(mu/defn touch-active-job-run! :- :int
  "Stamp `updated_at` on the active TransformJobRun with `run-id`."
  [run-id :- ms/PositiveInt]
  (t2/update! :model/TransformJobRun :id run-id :is_active true {:updated_at :%now}))

(mu/defn touch-active-dag-run! :- :int
  "Stamp `updated_at` on the active TransformDagRun with `run-id`."
  [run-id :- ms/PositiveInt]
  (t2/update! :model/TransformDagRun :id run-id :is_active true {:updated_at :%now}))

(mu/defn finish-active-job-run! :- :int
  "Apply `changes` to the TransformJobRun with `run-id` if it is still active, returning the number of rows
  updated."
  [run-id  :- ms/PositiveInt
   changes :- :map]
  (t2/update! :model/TransformJobRun :id run-id :is_active true changes))

(mu/defn finish-active-dag-run! :- :int
  "Apply `changes` to the TransformDagRun with `run-id` if it is still active, returning the number of rows
  updated."
  [run-id  :- ms/PositiveInt
   changes :- :map]
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

(mu/defn job-runs :- [:sequential (ms/InstanceOf :model/TransformJobRun)]
  "Up to `limit` (offset by `offset`) TransformJobRuns, optionally narrowed to `job-id`, `status`, `run-method`, and
  started in [`started-at-start`, `started-at-end`), sorted by `sort-column`/`sort-direction`."
  [job-id            :- [:maybe ms/PositiveInt]
   status            :- [:maybe :string]
   run-method        :- [:maybe :string]
   started-at-start  :- [:maybe ms/TemporalInstant]
   started-at-end    :- [:maybe ms/TemporalInstant]
   sort-column       :- [:maybe [:or :keyword :string]]
   sort-direction    :- [:maybe [:or :keyword :string]]
   limit             :- ms/PositiveInt
   offset            :- ms/IntGreaterThanOrEqualToZero]
  (t2/select :model/TransformJobRun
             (cond-> {:order-by (job-run-order-by sort-column sort-direction)
                      :offset   offset
                      :limit    limit}
               (job-run-where job-id status run-method started-at-start started-at-end)
               (assoc :where (job-run-where job-id status run-method started-at-start started-at-end)))))

(mu/defn job-run-count :- ms/IntGreaterThanOrEqualToZero
  "The number of TransformJobRuns, optionally narrowed to `job-id`, `status`, `run-method`, and started in
  [`started-at-start`, `started-at-end`)."
  [job-id            :- [:maybe ms/PositiveInt]
   status            :- [:maybe :string]
   run-method        :- [:maybe :string]
   started-at-start  :- [:maybe ms/TemporalInstant]
   started-at-end    :- [:maybe ms/TemporalInstant]]
  (t2/count :model/TransformJobRun
            (if-let [where (job-run-where job-id status run-method started-at-start started-at-end)]
              {:where where}
              {})))

(mu/defn latest-job-runs-reducible
  "Reducible latest TransformJobRun of each TransformJob with `job-ids`."
  [job-ids :- [:seqable ms/PositiveInt]]
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

(mu/defn active-job-run-for-job :- [:maybe (ms/InstanceOf :model/TransformJobRun)]
  "The active TransformJobRun of the TransformJob with `job-id`, or nil."
  [job-id :- ms/PositiveInt]
  (t2/select-one :model/TransformJobRun :job_id job-id :is_active true))

(mu/defn failed-cron-job-runs-between :- [:sequential (ms/InstanceOf :model/TransformJobRun)]
  "The job ID, start time, and message of the cron TransformJobRuns that failed or timed out in `[start, end)`,
  oldest first."
  [start :- ms/TemporalInstant
   end   :- ms/TemporalInstant]
  (t2/select [:model/TransformJobRun :job_id :start_time :message]
             {:where    [:and
                         [:= :run_method "cron"]
                         [:in :status ["failed" "timeout"]]
                         [:>= :start_time start]
                         [:< :start_time end]]
              :order-by [[:start_time :asc]]}))

(def ^:private TransformJobRunRow
  "Closed whole-row schema for `t2/insert!` against the `transform_job_run` table."
  [:map {:closed true}
   [:job_id         {:optional true} :any]
   [:run_method     {:optional true} :any]
   [:status         {:optional true} :any]
   [:is_active      {:optional true} :any]
   [:start_time     {:optional true} :any]
   [:end_time       {:optional true} :any]
   [:message        {:optional true} :any]
   [:created_at     {:optional true} :any]
   [:updated_at     {:optional true} :any]
   [:last_heartbeat {:optional true} :any]
   [:job_name       {:optional true} :any]
   [:job_entity_id  {:optional true} :any]])

(mu/defn insert-job-run! :- (ms/InstanceOf :model/TransformJobRun)
  "Insert `job-run` and return the new instance."
  [job-run :- TransformJobRunRow]
  (t2/insert-returning-instance! :model/TransformJobRun job-run))

(mu/defn active-dag-run-for-transform :- [:maybe (ms/InstanceOf :model/TransformDagRun)]
  "The active TransformDagRun seeded from the Transform with `transform-id`, or nil."
  [transform-id :- ms/PositiveInt]
  (t2/select-one :model/TransformDagRun :source_transform_id transform-id :is_active true))

(def ^:private TransformDagRunRow
  "Closed whole-row schema for `t2/insert!` against the `transform_dag_run` table."
  [:map {:closed true}
   [:source_transform_id        {:optional true} :any]
   [:source_transform_name      {:optional true} :any]
   [:source_transform_entity_id {:optional true} :any]
   [:direction                  {:optional true} :any]
   [:transform_count            {:optional true} :any]
   [:status                     {:optional true} :any]
   [:is_active                  {:optional true} :any]
   [:start_time                 {:optional true} :any]
   [:end_time                   {:optional true} :any]
   [:message                    {:optional true} :any]
   [:user_id                    {:optional true} :any]
   [:last_heartbeat             {:optional true} :any]
   [:created_at                 {:optional true} :any]
   [:updated_at                 {:optional true} :any]])

(mu/defn insert-dag-run! :- (ms/InstanceOf :model/TransformDagRun)
  "Insert `dag-run` and return the new instance."
  [dag-run :- TransformDagRunRow]
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

(mu/defn root-run-summaries-page :- [:sequential :map]
  "Up to `limit` (offset by `offset`) root-run summary rows -- see [[metabase.transforms.run-listing]] -- of `types`
  (a subset of `#{:job :dag :transform}`, or all three when empty), optionally narrowed to `statuses`,
  `run-methods`, started in [`started-at-start`, `started-at-end`), ended in [`ended-at-start`, `ended-at-end`),
  and/or touching one of `transform-ids`, sorted by `sort-column`/`sort-direction`."
  [types             :- [:maybe [:seqable :keyword]]
   statuses          :- [:maybe [:seqable :string]]
   run-methods       :- [:maybe [:seqable :string]]
   started-at-start  :- [:maybe ms/TemporalInstant]
   started-at-end    :- [:maybe ms/TemporalInstant]
   ended-at-start    :- [:maybe ms/TemporalInstant]
   ended-at-end      :- [:maybe ms/TemporalInstant]
   transform-ids     :- [:maybe [:seqable ms/PositiveInt]]
   sort-column       :- [:maybe [:or :keyword :string]]
   sort-direction    :- [:maybe [:or :keyword :string]]
   limit             :- ms/PositiveInt
   offset            :- ms/IntGreaterThanOrEqualToZero]
  (let [where (root-run-summaries-where statuses run-methods started-at-start started-at-end ended-at-start
                                        ended-at-end)
        base  (cond-> {:from [[(union-subquery types transform-ids) :runs]]}
                where (assoc :where where))]
    (t2/query (merge base {:select   [:*]
                           :order-by (root-run-order-by sort-column sort-direction)
                           :limit    limit
                           :offset   offset}))))

(mu/defn root-run-summaries-count :- ms/IntGreaterThanOrEqualToZero
  "The number of root-run summary rows matching the same filters as [[root-run-summaries-page]]."
  [types             :- [:maybe [:seqable :keyword]]
   statuses          :- [:maybe [:seqable :string]]
   run-methods       :- [:maybe [:seqable :string]]
   started-at-start  :- [:maybe ms/TemporalInstant]
   started-at-end    :- [:maybe ms/TemporalInstant]
   ended-at-start    :- [:maybe ms/TemporalInstant]
   ended-at-end      :- [:maybe ms/TemporalInstant]
   transform-ids     :- [:maybe [:seqable ms/PositiveInt]]]
  (let [where (root-run-summaries-where statuses run-methods started-at-start started-at-end ended-at-start
                                        ended-at-end)
        base  (cond-> {:from [[(union-subquery types transform-ids) :runs]]}
                where (assoc :where where))]
    (:count (first (t2/query (merge base {:select [[[:count :*] :count]]}))))))

(mu/defn app-db-now :- ms/TemporalInstant
  "The current time according to the application database."
  []
  (:now (t2/query-one {:select [[(h2x/current-datetime-honeysql-form (mdb/db-type)) :now]]})))

;;; ----------------------------------------------- Other models -----------------------------------------------

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database database-id))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table table-id))

(mu/defn databases :- [:sequential (ms/InstanceOf :model/Database)]
  "The Databases with `database-ids`."
  [database-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn database-exists? :- :boolean
  "Whether a Database with `database-id` exists."
  [database-id :- ms/PositiveInt]
  (t2/exists? :model/Database :id database-id))

(mu/defn tables :- [:sequential (ms/InstanceOf :model/Table)]
  "The Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn table-indexes-for-transforms :- [:sequential (ms/InstanceOf :model/TableIndex)]
  "The TableIndexes of the Transforms with `transform-ids`, ordered by index name."
  [transform-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/TableIndex :transform_id [:in transform-ids] {:order-by [[:index_name :asc]]}))

(mu/defn field :- [:maybe (ms/InstanceOf :model/Field)]
  "The Field with `field-id`, or nil."
  [field-id :- ms/PositiveInt]
  (t2/select-one :model/Field field-id))

(mu/defn field-exists? :- :boolean
  "Whether a Field with `field-id` exists."
  [field-id :- ms/PositiveInt]
  (t2/exists? :model/Field :id field-id))

(mu/defn active-field-ids-by-name :- [:map-of :string ms/PositiveInt]
  "A map of name to ID for the active Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-fn->fn :name :id [:model/Field :name :id] :table_id table-id :active true))

(mu/defn active-users :- [:sequential (ms/InstanceOf :model/User)]
  "The active Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/User :id [:in user-ids] :is_active true))

(mu/defn active-admins :- [:sequential (ms/InstanceOf :model/User)]
  "The active superusers."
  []
  (t2/select :model/User :is_superuser true :is_active true))

(mu/defn user-summaries-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/User)]
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))
