(ns metabase.transforms.db
  "Application database queries for the transforms module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions.

  The queries below follow [[::transform-opts]] and its per-model siblings; queries that do not fit live in the
  transforms-only section at the bottom of this namespace."
  (:require
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
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

(mr/def ::transform-filters
  "Which Transforms a query applies to. Keys mirror the columns of `transform`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:id                 {:optional true} [:or ::lib.schema.id/transform [:set ::lib.schema.id/transform]]]
   [:source_type        {:optional true} [:or :keyword :string [:set [:or :keyword :string]]]]
   [:source_database_id {:optional true} ::lib.schema.id/database]])

(mr/def ::transform-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::transform-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::transforms.schema/transform.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::transforms.schema/transform.column
                                              [:tuple ::transforms.schema/transform.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->transform-model
  [columns]
  (u.query/model-with-columns :model/Transform columns))

(defn- ->transform-args
  [opts]
  (u.query/opts->args opts))

(defn- ->transform-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(mu/defn select-transforms :- [:sequential ::transforms.schema/transform.partial]
  "The Transforms matching `opts`."
  ([]
   (select-transforms nil))
  ([{:keys [columns] :as opts} :- [:maybe ::transform-opts]]
   (apply t2/select (->transform-model columns) (->transform-args opts))))

(mu/defn select-one-transform :- [:maybe ::transforms.schema/transform.partial]
  "The first Transform matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::transform-opts]]
  (apply t2/select-one (->transform-model columns) (->transform-args opts)))

(mu/defn insert-transform! :- ::transforms.schema/transform
  "Insert the Transform `row` and return the inserted instance."
  [row :- ::transforms.schema/transform.create]
  (t2/insert-returning-instance! :model/Transform row))

(mu/defn update-transforms! :- :int
  "Apply `changes` to every Transform matching `opts`, returning the number updated."
  [opts    :- [:maybe ::transform-opts]
   changes :- ::transforms.schema/transform.update]
  (apply t2/update! :model/Transform (conj (->transform-kv-args opts) changes)))

(mu/defn delete-transforms! :- :int
  "Delete every Transform matching `opts`, returning the number deleted."
  [opts :- [:maybe ::transform-opts]]
  (apply t2/delete! :model/Transform (->transform-args opts)))

(mu/defn select-transforms-of-source-types
  "The Transforms whose source type is one of `source-types`, optionally narrowed to `database-id`, ordered by ID."
  [source-types :- [:set :string]
   database-id  :- [:maybe ::lib.schema.id/database]]
  (select-transforms (cond-> {:source_type source-types, :order-by [:id]}
                       database-id (assoc :source_database_id database-id))))

(mu/defn select-transform-summaries-by-id
  "A map of ID to the ID, name, and Collection ID of the Transforms with `transform-ids`."
  [transform-ids :- [:set ::lib.schema.id/transform]]
  (t2/select-pk->fn identity [:model/Transform :id :name :collection_id] :id [:in transform-ids]))

(mu/defn select-transform-names-by-id
  "A map of ID to name for the Transforms with `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (t2/select-pk->fn :name :model/Transform :id [:in transform-ids]))

;;; ---------------------------------------------- Transform tags ----------------------------------------------

(mr/def ::transform-tag-filters
  "Which TransformTags a query applies to. Keys mirror the columns of `transform_tag`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id   {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:name {:optional true} :string]])

(mr/def ::transform-tag-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::transform-tag-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::transforms.schema/transform-tag.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::transforms.schema/transform-tag.column
                                              [:tuple ::transforms.schema/transform-tag.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->transform-tag-model
  [columns]
  (u.query/model-with-columns :model/TransformTag columns))

(defn- ->transform-tag-args
  [opts]
  (u.query/opts->args opts))

(mu/defn select-one-transform-tag :- [:maybe ::transforms.schema/transform-tag.partial]
  "The first TransformTag matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::transform-tag-opts]]
  (apply t2/select-one (->transform-tag-model columns) (->transform-tag-args opts)))

(mu/defn select-transform-tag-pks :- [:set ms/PositiveInt]
  "The ids of the TransformTags matching `opts`."
  [opts :- [:maybe ::transform-tag-opts]]
  (or (apply t2/select-pks-set :model/TransformTag (->transform-tag-args opts)) #{}))

(mu/defn transform-tag-exists? :- :boolean
  "Whether a TransformTag matching `opts` exists."
  [opts :- [:maybe ::transform-tag-opts]]
  (apply t2/exists? :model/TransformTag (->transform-tag-args opts)))

(mu/defn tag-name-exists-excluding?
  "Whether a TransformTag named `tag-name` other than `tag-id` exists."
  [tag-name :- :string
   tag-id   :- ms/PositiveInt]
  (t2/exists? :model/TransformTag :name tag-name :id [:not= tag-id]))

;;; ------------------------------------------- Transform/TransformTag links -------------------------------------

(mr/def ::transform-transform-tag-filters
  "Which TransformTransformTags a query applies to. Keys mirror the columns of `transform_transform_tag`: a scalar
  matches that value and a set matches any of its values."
  [:map {:closed true}
   [:transform_id {:optional true} [:or ::lib.schema.id/transform [:set ::lib.schema.id/transform]]]
   [:tag_id       {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::transform-transform-tag-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::transform-transform-tag-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::transforms.schema/transform-transform-tag.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::transforms.schema/transform-transform-tag.column
                                              [:tuple ::transforms.schema/transform-transform-tag.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->transform-transform-tag-model
  [columns]
  (u.query/model-with-columns :model/TransformTransformTag columns))

(defn- ->transform-transform-tag-args
  [opts]
  (u.query/opts->args opts))

(defn- ->transform-transform-tag-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(mu/defn select-transform-transform-tags :- [:sequential ::transforms.schema/transform-transform-tag.partial]
  "The TransformTransformTags matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::transform-transform-tag-opts]]
  (apply t2/select (->transform-transform-tag-model columns) (->transform-transform-tag-args opts)))

(mu/defn insert-transform-transform-tags!
  "Insert the TransformTransformTag `rows`."
  [rows :- [:sequential ::transforms.schema/transform-transform-tag.create]]
  (t2/insert! :model/TransformTransformTag rows))

(mu/defn update-transform-transform-tags! :- :int
  "Apply `changes` to every TransformTransformTag matching `opts`, returning the number updated."
  [opts    :- [:maybe ::transform-transform-tag-opts]
   changes :- ::transforms.schema/transform-transform-tag.update]
  (apply t2/update! :model/TransformTransformTag (conj (->transform-transform-tag-kv-args opts) changes)))

(mu/defn delete-transform-transform-tags! :- :int
  "Delete every TransformTransformTag matching `opts`, returning the number deleted."
  [opts :- [:maybe ::transform-transform-tag-filters]]
  (apply t2/delete! :model/TransformTransformTag (->transform-transform-tag-args opts)))

(mu/defn select-transform-ids-with-tags :- [:set ::lib.schema.id/transform]
  "The IDs of the Transforms tagged with one of `tag-ids`."
  [tag-ids :- [:or [:set ms/PositiveInt] [:sequential ms/PositiveInt]]]
  (or (t2/select-fn-set :transform_id :model/TransformTransformTag :tag_id [:in tag-ids]) #{}))

(mu/defn select-active-job-schedules-for-transforms
  "Rows of Transform ID and the schedule of each active TransformJob that runs it through a shared tag."
  [transform-ids :- [:set ::lib.schema.id/transform]]
  (t2/select :model/TransformTransformTag
             {:select [:ttt.transform_id [:job.schedule :schedule]]
              :from   [[:transform_transform_tag :ttt]]
              :join   [[:transform_job_transform_tag :jtt] [:= :ttt.tag_id :jtt.tag_id]
                       [:transform_job :job] [:= :jtt.job_id :job.id]]
              :where  [:and
                       [:in :ttt.transform_id transform-ids]
                       [:= :job.active true]]}))

;;; ---------------------------------------------- Transform jobs ----------------------------------------------

(mr/def ::transform-job-filters
  "Which TransformJobs a query applies to. Keys mirror the columns of `transform_job`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id     {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:active {:optional true} :boolean]])

(mr/def ::transform-job-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::transform-job-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::transforms.schema/transform-job.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::transforms.schema/transform-job.column
                                              [:tuple ::transforms.schema/transform-job.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->transform-job-model
  [columns]
  (u.query/model-with-columns :model/TransformJob columns))

(defn- ->transform-job-args
  [opts]
  (u.query/opts->args opts))

(defn- ->transform-job-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(mu/defn select-transform-jobs :- [:sequential ::transforms.schema/transform-job.partial]
  "The TransformJobs matching `opts`."
  ([]
   (select-transform-jobs nil))
  ([{:keys [columns] :as opts} :- [:maybe ::transform-job-opts]]
   (apply t2/select (->transform-job-model columns) (->transform-job-args opts))))

(mu/defn select-one-transform-job :- [:maybe ::transforms.schema/transform-job.partial]
  "The first TransformJob matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::transform-job-opts]]
  (apply t2/select-one (->transform-job-model columns) (->transform-job-args opts)))

(mu/defn update-transform-jobs! :- :int
  "Apply `changes` to every TransformJob matching `opts`, returning the number updated."
  [opts    :- [:maybe ::transform-job-opts]
   changes :- ::transforms.schema/transform-job.update]
  (apply t2/update! :model/TransformJob (conj (->transform-job-kv-args opts) changes)))

(mu/defn select-job-names-by-id
  "A map of ID to name for the TransformJobs with `job-ids`."
  [job-ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :name :model/TransformJob :id [:in job-ids]))

;;; ------------------------------------------- Job/TransformTag links -------------------------------------------

(mr/def ::transform-job-transform-tag-filters
  "Which TransformJobTransformTags a query applies to. Keys mirror the columns of
  `transform_job_transform_tag`: a scalar matches that value and a set matches any of its values."
  [:map {:closed true}
   [:job_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:tag_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::transform-job-transform-tag-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::transform-job-transform-tag-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::transforms.schema/transform-job-transform-tag.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::transforms.schema/transform-job-transform-tag.column
                                              [:tuple ::transforms.schema/transform-job-transform-tag.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->transform-job-transform-tag-model
  [columns]
  (u.query/model-with-columns :model/TransformJobTransformTag columns))

(defn- ->transform-job-transform-tag-args
  [opts]
  (u.query/opts->args opts))

(defn- ->transform-job-transform-tag-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(mu/defn select-transform-job-transform-tags :- [:sequential ::transforms.schema/transform-job-transform-tag.partial]
  "The TransformJobTransformTags matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::transform-job-transform-tag-opts]]
  (apply t2/select (->transform-job-transform-tag-model columns) (->transform-job-transform-tag-args opts)))

(mu/defn insert-transform-job-transform-tags!
  "Insert the TransformJobTransformTag `rows`."
  [rows :- [:sequential ::transforms.schema/transform-job-transform-tag.create]]
  (t2/insert! :model/TransformJobTransformTag rows))

(mu/defn update-transform-job-transform-tags! :- :int
  "Apply `changes` to every TransformJobTransformTag matching `opts`, returning the number updated."
  [opts    :- [:maybe ::transform-job-transform-tag-opts]
   changes :- ::transforms.schema/transform-job-transform-tag.update]
  (apply t2/update! :model/TransformJobTransformTag (conj (->transform-job-transform-tag-kv-args opts) changes)))

(mu/defn delete-transform-job-transform-tags! :- :int
  "Delete every TransformJobTransformTag matching `opts`, returning the number deleted."
  [opts :- [:maybe ::transform-job-transform-tag-filters]]
  (apply t2/delete! :model/TransformJobTransformTag (->transform-job-transform-tag-args opts)))

(mu/defn select-job-tag-ids
  "The IDs of the tags of the TransformJob with `job-id`."
  [job-id :- ms/PositiveInt]
  (t2/select-fn-set :tag_id :model/TransformJobTransformTag :job_id job-id))

;;; ---------------------------------------------- Transform runs ----------------------------------------------

(mr/def ::transform-run-filters
  "Which TransformRuns a query applies to. Keys mirror the columns of `transform_run`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id            {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:transform_id  {:optional true} ::lib.schema.id/transform]
   [:job_run_id    {:optional true} ms/PositiveInt]
   [:dag_run_id    {:optional true} ms/PositiveInt]
   [:is_active     {:optional true} :boolean]])

(mr/def ::transform-run-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::transform-run-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::transforms.schema/transform-run.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::transforms.schema/transform-run.column
                                              [:tuple ::transforms.schema/transform-run.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->transform-run-model
  [columns]
  (u.query/model-with-columns :model/TransformRun columns))

(defn- ->transform-run-args
  [opts]
  (u.query/opts->args opts))

(defn- ->transform-run-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(mu/defn select-transform-runs :- [:sequential ::transforms.schema/transform-run.partial]
  "The TransformRuns matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::transform-run-opts]]
  (apply t2/select (->transform-run-model columns) (->transform-run-args opts)))

(mu/defn select-one-transform-run :- [:maybe ::transforms.schema/transform-run.partial]
  "The first TransformRun matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::transform-run-opts]]
  (apply t2/select-one (->transform-run-model columns) (->transform-run-args opts)))

(mu/defn select-transform-run-pks :- [:set ms/PositiveInt]
  "The ids of the TransformRuns matching `opts`."
  [opts :- [:maybe ::transform-run-opts]]
  (or (apply t2/select-pks-set :model/TransformRun (->transform-run-args opts)) #{}))

(mu/defn insert-transform-run! :- ::transforms.schema/transform-run
  "Insert the TransformRun `row` and return the inserted instance."
  [row :- ::transforms.schema/transform-run.create]
  (t2/insert-returning-instance! :model/TransformRun row))

(mu/defn update-transform-runs! :- :int
  "Apply `changes` to every TransformRun matching `opts`, returning the number updated."
  [opts    :- [:maybe ::transform-run-opts]
   changes :- ::transforms.schema/transform-run.update]
  (apply t2/update! :model/TransformRun (conj (->transform-run-kv-args opts) changes)))

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
   [:run-methods       [:maybe [:sequential :string]]]
   [:transform-ids     [:maybe [:or [:set ::lib.schema.id/transform] [:sequential ::lib.schema.id/transform]]]]
   [:transform-tag-ids [:maybe [:or [:set ms/PositiveInt] [:sequential ms/PositiveInt]]]]
   [:statuses          [:maybe [:sequential :string]]]
   [:user-id           [:maybe ::lib.schema.id/user]]])

(mu/defn select-paged-transform-runs
  "Up to `limit` (offset by `offset`) TransformRuns matching `filters` (see [[paged-runs-where]] for the supported
  keys), sorted by `sort-column`/`sort-direction` (translating `status`, `run-method`, and `transform-tags` sort
  columns per `status-labels`/`run-method-labels`/`tag-name-labels`)."
  [filters            :- RunFilters
   sort-column        :- [:maybe [:or :keyword :string]]
   sort-direction     :- [:maybe [:or :keyword :string]]
   status-labels      :- [:map-of :string :string]
   run-method-labels  :- [:map-of :string :string]
   tag-name-labels    :- [:map-of :string :string]
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

(mu/defn count-paged-transform-runs
  "The number of TransformRuns matching `filters` (see [[paged-runs-where]] for the supported keys)."
  [filters :- RunFilters]
  (t2/count :model/TransformRun (m/assoc-some {} :where (paged-runs-where filters))))

(mu/defn reducible-select-latest-transform-runs
  "Reducible latest TransformRun of each Transform with `transform-ids`."
  [transform-ids :- [:set ::lib.schema.id/transform]]
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

(mu/defn lock-active-transform-runs
  "The active TransformRuns among `run-ids`, locked for update."
  [run-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/TransformRun {:where [:and [:= :is_active true] [:in :id run-ids]]
                                  :for   :update}))

(mu/defn select-last-transform-success-times
  "Rows of Transform ID and the latest `end_time` of its succeeded runs for `transform-ids`."
  [transform-ids :- [:set ::lib.schema.id/transform]]
  (t2/select :model/TransformRun
             {:select   [:transform_id [[:max :end_time] :last_success]]
              :where    [:and
                         [:in :transform_id transform-ids]
                         [:= :status "succeeded"]]
              :group-by [:transform_id]}))

;;; -------------------------------------------- Run cancelations --------------------------------------------

(mu/defn insert-transform-run-cancelation-for-active-run!
  "Record a cancelation request for the TransformRun with `run-id` if it is active and none exists yet."
  [run-id :- ms/PositiveInt]
  (t2/query-one [(str "INSERT INTO transform_run_cancelation (run_id) "
                      "SELECT transform_run.id "
                      "FROM transform_run "
                      "WHERE transform_run.id = ? "
                      "AND transform_run.is_active "
                      "AND NOT EXISTS (SELECT 1 FROM transform_run_cancelation WHERE run_id = ?)")
                 run-id run-id]))

(mu/defn reducible-select-transform-run-cancelations
  "Reducible TransformRunCancelations."
  []
  (t2/reducible-select :model/TransformRunCancelation))

(mu/defn select-transform-run-cancelations-requested-before
  "The run ID and request time of the TransformRunCancelations requested more than `age` `unit`s ago."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (t2/select [:model/TransformRunCancelation :run_id :time]
             :time [:< (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]))

(mu/defn delete-transform-run-cancelation-for-inactive-run!
  "Delete the TransformRunCancelation of the TransformRun with `run-id` if that run is no longer active."
  [run-id :- ms/PositiveInt]
  (t2/delete! :model/TransformRunCancelation {:where [:and [:= :run_id run-id] no-active-run-clause]}))

(mu/defn delete-transform-run-cancelations-for-inactive-runs!
  "Delete every TransformRunCancelation whose run is no longer active."
  []
  (t2/delete! :model/TransformRunCancelation {:where no-active-run-clause}))

;;; ------------------------------------------- Job and DAG runs -------------------------------------------

(mr/def ::transform-job-run-filters
  "Which TransformJobRuns a query applies to. Keys mirror the columns of `transform_job_run`: a scalar matches
  that value and a set matches any of its values."
  [:map {:closed true}
   [:id         {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:job_id     {:optional true} ms/PositiveInt]
   [:is_active  {:optional true} :boolean]])

(mr/def ::transform-job-run-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::transform-job-run-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::transforms.schema/transform-job-run.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::transforms.schema/transform-job-run.column
                                              [:tuple ::transforms.schema/transform-job-run.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->transform-job-run-model
  [columns]
  (u.query/model-with-columns :model/TransformJobRun columns))

(defn- ->transform-job-run-args
  [opts]
  (u.query/opts->args opts))

(defn- ->transform-job-run-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(mu/defn select-one-transform-job-run :- [:maybe ::transforms.schema/transform-job-run.partial]
  "The first TransformJobRun matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::transform-job-run-opts]]
  (apply t2/select-one (->transform-job-run-model columns) (->transform-job-run-args opts)))

(mu/defn insert-transform-job-run! :- ::transforms.schema/transform-job-run
  "Insert the TransformJobRun `row` and return the inserted instance."
  [row :- ::transforms.schema/transform-job-run.create]
  (t2/insert-returning-instance! :model/TransformJobRun row))

(mu/defn update-transform-job-runs! :- :int
  "Apply `changes` to every TransformJobRun matching `opts`, returning the number updated."
  [opts    :- [:maybe ::transform-job-run-opts]
   changes :- ::transforms.schema/transform-job-run.update]
  (apply t2/update! :model/TransformJobRun (conj (->transform-job-run-kv-args opts) changes)))

(mr/def ::transform-dag-run-filters
  "Which TransformDagRuns a query applies to. Keys mirror the columns of `transform_dag_run`: a scalar matches
  that value and a set matches any of its values."
  [:map {:closed true}
   [:id                  {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:source_transform_id {:optional true} ::lib.schema.id/transform]
   [:is_active           {:optional true} :boolean]])

(mr/def ::transform-dag-run-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::transform-dag-run-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::transforms.schema/transform-dag-run.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::transforms.schema/transform-dag-run.column
                                              [:tuple ::transforms.schema/transform-dag-run.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->transform-dag-run-model
  [columns]
  (u.query/model-with-columns :model/TransformDagRun columns))

(defn- ->transform-dag-run-args
  [opts]
  (u.query/opts->args opts))

(defn- ->transform-dag-run-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(mu/defn select-one-transform-dag-run :- [:maybe ::transforms.schema/transform-dag-run.partial]
  "The first TransformDagRun matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::transform-dag-run-opts]]
  (apply t2/select-one (->transform-dag-run-model columns) (->transform-dag-run-args opts)))

(mu/defn insert-transform-dag-run! :- ::transforms.schema/transform-dag-run
  "Insert the TransformDagRun `row` and return the inserted instance."
  [row :- ::transforms.schema/transform-dag-run.create]
  (t2/insert-returning-instance! :model/TransformDagRun row))

(mu/defn update-transform-dag-runs! :- :int
  "Apply `changes` to every TransformDagRun matching `opts`, returning the number updated."
  [opts    :- [:maybe ::transform-dag-run-opts]
   changes :- ::transforms.schema/transform-dag-run.update]
  (apply t2/update! :model/TransformDagRun (conj (->transform-dag-run-kv-args opts) changes)))

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

(mu/defn select-paged-transform-job-runs
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

(mu/defn count-paged-transform-job-runs
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

(mu/defn reducible-select-latest-transform-job-runs
  "Reducible latest TransformJobRun of each TransformJob with `job-ids`."
  [job-ids :- [:set ms/PositiveInt]]
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

(mu/defn select-failed-cron-transform-job-runs-between
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

(mu/defn select-root-run-summaries-page
  "Up to `limit` (offset by `offset`) root-run summary rows -- see [[metabase.transforms.run-listing]] -- of `types`
  (a subset of `#{:job :dag :transform}`, or all three when empty), optionally narrowed to `statuses`,
  `run-methods`, started in [`started-at-start`, `started-at-end`), ended in [`ended-at-start`, `ended-at-end`),
  and/or touching one of `transform-ids`, sorted by `sort-column`/`sort-direction`."
  [types             :- [:maybe [:sequential :keyword]]
   statuses          :- [:maybe [:sequential :string]]
   run-methods       :- [:maybe [:sequential :string]]
   started-at-start  :- [:maybe ms/TemporalInstant]
   started-at-end    :- [:maybe ms/TemporalInstant]
   ended-at-start    :- [:maybe ms/TemporalInstant]
   ended-at-end      :- [:maybe ms/TemporalInstant]
   transform-ids     :- [:maybe [:sequential ::lib.schema.id/transform]]
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

(mu/defn count-root-run-summaries
  "The number of root-run summary rows matching the same filters as [[select-root-run-summaries-page]]."
  [types             :- [:maybe [:sequential :keyword]]
   statuses          :- [:maybe [:sequential :string]]
   run-methods       :- [:maybe [:sequential :string]]
   started-at-start  :- [:maybe ms/TemporalInstant]
   started-at-end    :- [:maybe ms/TemporalInstant]
   ended-at-start    :- [:maybe ms/TemporalInstant]
   ended-at-end      :- [:maybe ms/TemporalInstant]
   transform-ids     :- [:maybe [:sequential ::lib.schema.id/transform]]]
  (let [where (root-run-summaries-where statuses run-methods started-at-start started-at-end ended-at-start
                                        ended-at-end)
        base  (cond-> {:from [[(union-subquery types transform-ids) :runs]]}
                where (assoc :where where))]
    (:count (first (t2/query (merge base {:select [[[:count :*] :count]]}))))))

(mu/defn select-app-db-now
  "The current time according to the application database."
  []
  (:now (t2/query-one {:select [[(h2x/current-datetime-honeysql-form (mdb/db-type)) :now]]})))

;;; ----------------------------------------------- Other models -----------------------------------------------

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table-indexes-for-transforms
  "The TableIndexes of the Transforms with `transform-ids`, ordered by index name."
  [transform-ids :- [:set ::lib.schema.id/transform]]
  (t2/select :model/TableIndex :transform_id [:in transform-ids] {:order-by [[:index_name :asc]]}))

(mu/defn field
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn field-exists?
  "Whether a Field with `field-id` exists."
  [field-id :- ::lib.schema.id/field]
  (t2/exists? :model/Field :id field-id {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn active-field-ids-by-name
  "A map of name to ID for the active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn->fn :name :id [:model/Field :name :id] :table_id table-id :active true {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn active-users
  "The active Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select :model/User :id [:in user-ids] :is_active true))

(mu/defn active-admins
  "The active superusers."
  []
  (t2/select :model/User :is_superuser true :is_active true))

(mu/defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))
