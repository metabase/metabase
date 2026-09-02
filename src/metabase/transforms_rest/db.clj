(ns metabase.transforms-rest.db
  "Application database queries for the transforms-rest module. Every function here is a direct Toucan 2 call
  with no additional logic, so no other namespace in the module runs a query itself."
  (:require
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Transforms -------------------------------------------------

(defn transforms-by-id
  "A map of id to Transform, for every Transform."
  []
  (t2/select-pk->fn identity :model/Transform))

(defn reset-checkpoint!
  "Clear the stored checkpoint value of the Transform with `id`."
  [id]
  (t2/update! :model/Transform id {:last_checkpoint_value nil}))

;;; ---------------------------------------------------- Tags ------------------------------------------------------

(defn existing-tag-ids
  "The subset of `tag-ids` that are ids of existing TransformTags."
  [tag-ids]
  (set (t2/select-pks-vec :model/TransformTag :id [:in tag-ids])))

(defn tag
  "The TransformTag with `tag-id`, or nil."
  [tag-id]
  (t2/select-one :model/TransformTag :id tag-id))

(defn insert-tag!
  "Insert a TransformTag named `name` and return the inserted instance."
  [name]
  (t2/insert-returning-instance! :model/TransformTag {:name name}))

(defn update-tag!
  "Set the name of the TransformTag with `tag-id`."
  [tag-id name]
  (t2/update! :model/TransformTag tag-id {:name name}))

(defn delete-tag!
  "Delete the TransformTag with `tag-id`."
  [tag-id]
  (t2/delete! :model/TransformTag :id tag-id))

(defn tags
  "Every TransformTag, in name order."
  []
  (t2/select :model/TransformTag {:order-by [[:name :asc]]}))

;;; ---------------------------------------------------- Jobs ------------------------------------------------------

(defn insert-job!
  "Insert the TransformJob `job-data` and return the inserted instance."
  [job-data]
  (t2/insert-returning-instance! :model/TransformJob job-data))

(defn insert-job-tags!
  "Insert the TransformJobTransformTag `rows`."
  [rows]
  (t2/insert! :model/TransformJobTransformTag rows))

(defn jobs-with-active-flag
  "The TransformJobs whose `:active` flag is `active`."
  [active]
  (t2/select :model/TransformJob :active active))

(defn job
  "The TransformJob with `job-id`, or nil."
  [job-id]
  (t2/select-one :model/TransformJob :id job-id))

(defn job-pk
  "The primary key of the TransformJob with `job-id`, or nil."
  [job-id]
  (t2/select-one-pk :model/TransformJob :id job-id))

(defn update-job!
  "Apply `updates` to the TransformJob with `job-id`."
  [job-id updates]
  (t2/update! :model/TransformJob job-id updates))

(defn delete-job!
  "Delete the TransformJob with `job-id`."
  [job-id]
  (t2/delete! :model/TransformJob :id job-id))

(defn jobs
  "Every TransformJob, newest first."
  []
  (t2/select :model/TransformJob {:order-by [[:created_at :desc]]}))

(defn job-run
  "The TransformJobRun with `run-id` belonging to the TransformJob with `job-id`, or nil."
  [run-id job-id]
  (t2/select-one :model/TransformJobRun :id run-id :job_id job-id))

;;; -------------------------------------------------- DAG runs -----------------------------------------------------

(defn dag-run
  "The TransformDagRun with `run-id`, or nil."
  [run-id]
  (t2/select-one :model/TransformDagRun :id run-id))
