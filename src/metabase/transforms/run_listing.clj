(ns metabase.transforms.run-listing
  "The unified, collection-level \"Runs\" listing that backs the default tab of the Runs page. A single
  paged view over the three kinds of *root* run:

  - a scheduled/manual **job run**       (`transform_job_run`)
  - a manual **DAG-reprocess run**       (`transform_dag_run`)
  - a standalone **transform run**       (`transform_run` not belonging to a job or DAG run — i.e.
                                          a \"DAG with a single node\", triggered from one transform)

  Member transform runs that belong to a job or DAG run are deliberately excluded here — they surface
  only when you drill into their parent run. Because ids are per-table, a row is identified by the
  `(run_type, id)` pair, and `entity_id` points at the associated job/transform so the FE can build
  the drill-down URL."
  (:require
   [medley.core :as m]
   [metabase.transforms.models.util :as transforms.models.u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def run-types
  "The `run_type` discriminator values the unified listing can return."
  [:job :dag :transform])

;;; ---------------------------------------------- Per-source subqueries ----------------------------------------------

;; Every branch projects the SAME column list in the SAME order so they union cleanly. `entity_id` is
;; the associated job/transform id; `direction` is DAG-only; job runs have no `user_id` column and
;; standalone transform runs / DAG runs are surfaced with their `run_method` (DAG runs are always
;; manual). Timestamps and status/run_method/direction come back raw (strings) and are keywordized in
;; the API layer via `present-run-summary`.

(defn- job-run-subquery [transform-id]
  {:select [[[:inline "job"] :run_type]
            :id
            [:job_id :entity_id]
            [nil :direction]
            :run_method
            :status :is_active :start_time :end_time :message
            [nil :user_id]]
   :from   [:transform_job_run]
   :where  (if transform-id
             ;; only job runs that actually ran this transform
             [:exists {:select [[[:inline 1]]]
                       :from   [[:transform_run :member]]
                       :where  [:and
                                [:= :member.job_run_id :transform_job_run.id]
                                [:= :member.transform_id transform-id]]}]
             true)})

(defn- dag-run-subquery [transform-id]
  {:select [[[:inline "dag"] :run_type]
            :id
            [:source_transform_id :entity_id]
            :direction
            [[:inline "manual"] :run_method]
            :status :is_active :start_time :end_time :message
            :user_id]
   :from   [:transform_dag_run]
   :where  (if transform-id
             [:exists {:select [[[:inline 1]]]
                       :from   [[:transform_run :member]]
                       :where  [:and
                                [:= :member.dag_run_id :transform_dag_run.id]
                                [:= :member.transform_id transform-id]]}]
             true)})

(defn- transform-run-subquery [transform-id]
  {:select [[[:inline "transform"] :run_type]
            :id
            [:transform_id :entity_id]
            [nil :direction]
            :run_method
            :status :is_active :start_time :end_time :message
            :user_id]
   :from   [:transform_run]
   ;; standalone runs only: those not coordinated by a job or DAG run
   :where  [:and
            [:= :job_run_id nil]
            [:= :dag_run_id nil]
            (if transform-id [:= :transform_id transform-id] true)]})

(defn- union-subquery
  "The UNION ALL of the branches selected by `types` (a subset of [[run-types]]), each optionally
  narrowed to runs touching `transform-id`."
  [types transform-id]
  (let [types (set (or (seq types) run-types))]
    {:union-all (cond-> []
                  (:job types)       (conj (job-run-subquery transform-id))
                  (:dag types)       (conj (dag-run-subquery transform-id))
                  (:transform types) (conj (transform-run-subquery transform-id)))}))

(defn paged-run-summaries
  "Return a page of the unified collection-level run listing, in the FE-conventional
  `{:data :limit :offset :total}` envelope. Rows are raw (see the ns docstring); the API layer
  keywordizes and hydrates run names.

  Options:
  - `:types`          subset of [[run-types]] (as keywords) to include; nil/empty means all three
  - `:status`         restrict to a single status string
  - `:start-time`     QP-style date range string constraining `start_time`
  - `:transform-id`   only runs that ran this transform (job/DAG runs whose members include it, or the
                      standalone run of it)
  - `:sort-column`    `\"start_time\"` / `\"end_time\"`
  - `:sort-direction` `\"asc\"` / `\"desc\"`
  - `:offset`/`:limit` pagination (default 0 / 20)"
  [{:keys [types status start-time transform-id sort-column sort-direction offset limit]}]
  (let [offset     (or offset 0)
        limit      (or limit 20)
        inner      (union-subquery types transform-id)
        where      (into [:and] (remove nil?)
                         [(when status               [:= :status status])
                          (when (= status "started") [:= :is_active true])
                          (when start-time           (transforms.models.u/timestamp-constraint :start_time start-time))])
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

(defn hydrate-run-names
  "Assoc a `:name` on each raw summary row (from [[paged-run-summaries]]): the job name for job runs,
  else the seed/target transform name. Names may be nil when the underlying job/transform was deleted."
  [rows]
  (let [by-type   (group-by :run_type rows)
        job-ids   (seq (map :entity_id (get by-type "job")))
        xform-ids (seq (map :entity_id (concat (get by-type "dag") (get by-type "transform"))))
        job->name   (when job-ids   (t2/select-pk->fn :name :model/TransformJob :id [:in job-ids]))
        xform->name (when xform-ids (t2/select-pk->fn :name :model/Transform :id [:in xform-ids]))]
    (map (fn [{:keys [run_type entity_id] :as row}]
           (assoc row :name (if (= run_type "job")
                              (get job->name entity_id)
                              (get xform->name entity_id))))
         rows)))

(defn present-run-summary
  "Keywordize the discriminator columns of a raw summary row. Timestamp localization is left to the
  API layer (via `transforms-base.util/localize-run-timestamps`) to keep this model namespace free of
  a cross-module dependency."
  [row]
  (-> row
      (update :run_type keyword)
      (update :status keyword)
      (m/update-existing :run_method #(some-> % keyword))
      (m/update-existing :direction #(some-> % keyword))))
