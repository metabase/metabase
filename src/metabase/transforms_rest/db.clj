(ns metabase.transforms-rest.db
  "Application database queries for the transforms-rest module. Every function here is a direct Toucan 2 call
  with no additional logic, so no other namespace in the module runs a query itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Transforms -------------------------------------------------

(mu/defn transforms-by-id
  "A map of id to Transform, for every Transform."
  []
  (t2/select-pk->fn identity :model/Transform))

(mu/defn reset-checkpoint!
  "Clear the stored checkpoint value of the Transform with `id`."
  [id :- ::lib.schema.id/transform]
  (t2/update! :model/Transform id {:last_checkpoint_value nil}))

;;; ---------------------------------------------------- Tags ------------------------------------------------------

(mu/defn existing-tag-ids
  "The subset of `tag-ids` that are ids of existing TransformTags."
  [tag-ids :- [:sequential ms/PositiveInt]]
  (set (t2/select-pks-vec :model/TransformTag :id [:in tag-ids])))

(mu/defn tag
  "The TransformTag with `tag-id`, or nil."
  [tag-id :- ms/PositiveInt]
  (t2/select-one :model/TransformTag :id tag-id))

(mu/defn insert-tag!
  "Insert a TransformTag named `name` and return the inserted instance."
  [name :- :string]
  (t2/insert-returning-instance! :model/TransformTag {:name name}))

(mu/defn update-tag!
  "Set the name of the TransformTag with `tag-id`."
  [tag-id :- ms/PositiveInt
   name   :- :string]
  (t2/update! :model/TransformTag tag-id {:name name}))

(mu/defn delete-tag!
  "Delete the TransformTag with `tag-id`."
  [tag-id :- ms/PositiveInt]
  (t2/delete! :model/TransformTag :id tag-id))

(mu/defn tags
  "Every TransformTag, in name order."
  []
  (t2/select :model/TransformTag {:order-by [[:name :asc]]}))

;;; ---------------------------------------------------- Jobs ------------------------------------------------------

(mu/defn insert-job!
  "Insert the TransformJob `job-data` and return the inserted instance."
  [job-data :- ::transforms.schema/transform-job.update]
  (t2/insert-returning-instance! :model/TransformJob job-data))

(mu/defn insert-job-tags!
  "Insert the TransformJobTransformTag `rows`."
  [rows :- [:sequential
            (mut/select-keys ::transforms.schema/transform-job-transform-tag.update [:job_id :tag_id :entity_id :position])]]
  (t2/insert! :model/TransformJobTransformTag rows))

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

(mu/defn update-job!
  "Apply `updates` to the TransformJob with `job-id`."
  [job-id  :- ms/PositiveInt
   updates :- (mut/select-keys ::transforms.schema/transform-job.update [:name :description :schedule :ui_display_type])]
  (t2/update! :model/TransformJob job-id updates))

(mu/defn delete-job!
  "Delete the TransformJob with `job-id`."
  [job-id :- ms/PositiveInt]
  (t2/delete! :model/TransformJob :id job-id))

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
