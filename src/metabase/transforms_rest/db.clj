(ns metabase.transforms-rest.db
  "Application database queries for the transforms-rest module. Every function here is a direct Toucan 2 call
  with no additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Transforms -------------------------------------------------

(mu/defn transforms-by-id
  "A map of id to Transform, for every Transform."
  []
  (t2/select-pk->fn identity :model/Transform))

;;; ---------------------------------------------------- Tags ------------------------------------------------------

(mu/defn existing-tag-ids
  "The subset of `tag-ids` that are ids of existing TransformTags."
  [tag-ids :- [:sequential ms/PositiveInt]]
  (into #{} (mdb/select-batched #(t2/select-pks-vec :model/TransformTag :id [:in %]) tag-ids)))

(mu/defn tag
  "The TransformTag with `tag-id`, or nil."
  [tag-id :- ms/PositiveInt]
  (t2/select-one :model/TransformTag :id tag-id))

(mu/defn tags
  "Every TransformTag, in name order."
  []
  (t2/select :model/TransformTag {:order-by [[:name :asc]]}))

;;; ---------------------------------------------------- Jobs ------------------------------------------------------

(mu/defn jobs-with-active-flag
  "The TransformJobs whose `:active` flag is `active`."
  [active :- :boolean]
  (t2/select :model/TransformJob :active active))

(mu/defn job
  "The TransformJob with `job-id`, or nil."
  [job-id :- ms/PositiveInt]
  (t2/select-one :model/TransformJob :id job-id))

(mu/defn job-pk
  "The primary key of the TransformJob with `job-id`, or nil."
  [job-id :- ms/PositiveInt]
  (t2/select-one-pk :model/TransformJob :id job-id))

(mu/defn jobs
  "Every TransformJob, newest first."
  []
  (t2/select :model/TransformJob {:order-by [[:created_at :desc]]}))

(mu/defn job-run
  "The TransformJobRun with `run-id` belonging to the TransformJob with `job-id`, or nil."
  [run-id :- ms/PositiveInt
   job-id :- ms/PositiveInt]
  (t2/select-one :model/TransformJobRun :id run-id :job_id job-id))

;;; -------------------------------------------------- DAG runs -----------------------------------------------------

(mu/defn dag-run
  "The TransformDagRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one :model/TransformDagRun :id run-id))
