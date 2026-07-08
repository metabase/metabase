(ns metabase.transforms.run-listing
  "A single paged listing over the three kinds of root run:

  - a job run                  (`transform_job_run`)
  - a manual DAG-reprocess run (`transform_dag_run`)
  - a standalone transform run (`transform_run` not belonging to a job or DAG run)

  Member transform runs that belong to a job or DAG run are excluded — they are reachable through
  their parent run. Because ids are per-table, a row is identified by the `(run_type, id)` pair;
  `entity_id` is the id of the associated job/transform."
  (:require
   [medley.core :as m]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.models.util :as transforms.models.u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def run-types
  "The `run_type` discriminator values a listing row can have."
  [:job :dag :transform])

;;; ---------------------------------------------- Per-source subqueries ----------------------------------------------

;; Each branch must project the same columns in the same order for the UNION ALL to line up;
;; `[nil :col]` fills in columns a table lacks.

(defn- job-run-subquery [transform-ids]
  {:select [[[:inline "job"] :run_type]
            :id
            [:job_id :entity_id]
            [nil :direction]
            :run_method
            :status :is_active :start_time :end_time :message
            [nil :user_id]]
   :from   [:transform_job_run]
   :where  (if (seq transform-ids)
             ;; only job runs that actually ran one of these transforms
             [:exists {:select [[[:inline 1]]]
                       :from   [[:transform_run :member]]
                       :where  [:and
                                [:= :member.job_run_id :transform_job_run.id]
                                [:in :member.transform_id transform-ids]]}]
             true)})

(defn- dag-run-subquery [transform-ids]
  {:select [[[:inline "dag"] :run_type]
            :id
            [:source_transform_id :entity_id]
            :direction
            [[:inline "manual"] :run_method]
            :status :is_active :start_time :end_time :message
            :user_id]
   :from   [:transform_dag_run]
   :where  (if (seq transform-ids)
             [:exists {:select [[[:inline 1]]]
                       :from   [[:transform_run :member]]
                       :where  [:and
                                [:= :member.dag_run_id :transform_dag_run.id]
                                [:in :member.transform_id transform-ids]]}]
             true)})

(defn- transform-run-subquery [transform-ids]
  {:select [[[:inline "transform"] :run_type]
            :id
            [:transform_id :entity_id]
            [nil :direction]
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
  "The UNION ALL of the branches selected by `types` (a subset of [[run-types]]), each optionally
  narrowed to runs touching one of `transform-ids`."
  [types transform-ids]
  (let [types (set (or (seq types) run-types))]
    {:union-all (cond-> []
                  (:job types)       (conj (job-run-subquery transform-ids))
                  (:dag types)       (conj (dag-run-subquery transform-ids))
                  (:transform types) (conj (transform-run-subquery transform-ids)))}))

(defn paged-run-summaries
  "Return a page of root runs as a `{:data :limit :offset :total}` envelope. Rows are raw — see
  [[present-run-summaries]].

  Options (filter semantics match [[metabase.transforms.models.transform-run/paged-runs]]):
  - `:types`          subset of [[run-types]] to include; nil/empty means all three
  - `:statuses`       match any of these status strings
  - `:run-methods`    match any of these triggers (`\"manual\"`/`\"cron\"`)
  - `:start-time`     date range string (as in the QP date parameters) constraining `start_time`
  - `:end-time`       likewise for `end_time`
  - `:transform-ids`  only runs that ran any of these transforms (job/DAG runs whose members include
                      one, or the standalone runs of them)
  - `:sort-column`    `\"start_time\"` / `\"end_time\"`
  - `:sort-direction` `\"asc\"` / `\"desc\"`
  - `:offset`/`:limit` pagination (default 0 / 20)"
  [{:keys [types statuses run-methods start-time end-time transform-ids sort-column sort-direction offset limit]}]
  (let [offset     (or offset 0)
        limit      (or limit 20)
        inner      (union-subquery types transform-ids)
        where      (into [:and] (remove nil?)
                         [(when (seq statuses)    [:in :status (set statuses)])
                          ;; started ⇒ still active, as in the per-table run listings
                          (when (= (set statuses) #{"started"}) [:= :is_active true])
                          (when (seq run-methods) [:in :run_method (set run-methods)])
                          (when start-time        (transforms.models.u/timestamp-constraint :start_time start-time))
                          (when end-time          (transforms.models.u/timestamp-constraint :end_time end-time))])
        where      (when (> (count where) 1) where)
        base       (cond-> {:from [[inner :runs]]}
                     where (assoc :where where))]
    {:data   (t2/query (merge base
                              {:select   [:*]
                               :order-by (transforms.models.u/run-order-by sort-column sort-direction)
                               :limit    limit
                               :offset   offset}))
     :limit  limit
     :offset offset
     :total  (:count (first (t2/query (merge base {:select [[[:count :*] :count]]}))))}))

(defn present-run-summaries
  "Prepare raw summary rows for an API response: hydrate each row's `:name` (nil when the underlying
  job/transform was deleted), keywordize the discriminator columns, and localize timestamps."
  [rows]
  (let [by-type     (group-by :run_type rows)
        job-ids     (seq (map :entity_id (get by-type "job")))
        transform-ids   (seq (map :entity_id (concat (get by-type "dag") (get by-type "transform"))))
        job->name   (when job-ids   (t2/select-pk->fn :name :model/TransformJob :id [:in job-ids]))
        transform->name (when transform-ids (t2/select-pk->fn :name :model/Transform :id [:in transform-ids]))]
    (map (fn [{:keys [run_type entity_id] :as row}]
           (-> row
               (assoc :name (if (= run_type "job")
                              (get job->name entity_id)
                              (get transform->name entity_id)))
               (update :run_type keyword)
               (update :status keyword)
               (m/update-existing :run_method #(some-> % keyword))
               (m/update-existing :direction #(some-> % keyword))
               transforms-base.u/localize-run-timestamps))
         rows)))
