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
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.util :as transforms.models.u]))

(set! *warn-on-reflection* true)

(def run-types
  "The `run_type` discriminator values a listing row can have."
  [:job :dag :transform])

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
  (let [offset              (or offset 0)
        limit               (or limit 20)
        [start-at end-at]   (when start-time (transforms.models.u/timestamp-range start-time))
        [ended-at end-end]  (when end-time (transforms.models.u/timestamp-range end-time))
        order-by            (transforms.models.u/run-order-by sort-column sort-direction)]
    {:data   (transforms.db/root-run-summaries-page types statuses run-methods start-at end-at ended-at end-end
                                                    transform-ids order-by limit offset)
     :limit  limit
     :offset offset
     :total  (transforms.db/root-run-summaries-count types statuses run-methods start-at end-at ended-at end-end
                                                     transform-ids)}))

(defn present-run-summaries
  "Prepare raw summary rows for an API response: hydrate each row's `:name` (nil when the underlying
  job/transform was deleted), keywordize the discriminator columns, and localize timestamps."
  [rows]
  (let [by-type         (group-by :run_type rows)
        job-ids         (seq (keep :entity_id (get by-type "job")))
        transform-ids   (seq (keep :entity_id (concat (get by-type "dag") (get by-type "transform"))))
        job->name       (when job-ids (transforms.db/job-names-by-id job-ids))
        transform->name (when transform-ids (transforms.db/transform-names-by-id transform-ids))]
    (map (fn [{:keys [run_type entity_id entity_name] :as row}]
           (-> row
               (assoc :name (or (if (= run_type "job")
                                  (get job->name entity_id)
                                  (get transform->name entity_id))
                                entity_name))
               (dissoc :entity_name)
               (update :run_type keyword)
               (update :status keyword)
               (m/update-existing :run_method #(some-> % keyword))
               (m/update-existing :direction #(some-> % keyword))
               transforms-base.u/localize-run-timestamps))
         rows)))
