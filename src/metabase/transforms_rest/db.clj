(ns metabase.transforms-rest.db
  "Application database queries for the transforms-rest module. Every function here is a direct Toucan 2 call
  with no additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Transforms -------------------------------------------------

(mu/defn transforms-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Transform)]
  "A map of id to Transform, for every Transform."
  []
  (t2/select-pk->fn identity :model/Transform))

(mu/defn reset-checkpoint! :- :int
  "Clear the stored checkpoint value of the Transform with `id`."
  [id :- ms/PositiveInt]
  (t2/update! :model/Transform id {:last_checkpoint_value nil}))

;;; ---------------------------------------------------- Tags ------------------------------------------------------

(mu/defn existing-tag-ids :- [:set ms/PositiveInt]
  "The subset of `tag-ids` that are ids of existing TransformTags."
  [tag-ids :- [:seqable ms/PositiveInt]]
  (set (t2/select-pks-vec :model/TransformTag :id [:in tag-ids])))

(mu/defn tag :- [:maybe (ms/InstanceOf :model/TransformTag)]
  "The TransformTag with `tag-id`, or nil."
  [tag-id :- ms/PositiveInt]
  (t2/select-one :model/TransformTag :id tag-id))

(mu/defn insert-tag! :- (ms/InstanceOf :model/TransformTag)
  "Insert a TransformTag named `name` and return the inserted instance."
  [name :- :string]
  (t2/insert-returning-instance! :model/TransformTag {:name name}))

(mu/defn update-tag! :- :int
  "Set the name of the TransformTag with `tag-id`."
  [tag-id :- ms/PositiveInt
   name   :- :string]
  (t2/update! :model/TransformTag tag-id {:name name}))

(mu/defn delete-tag! :- :int
  "Delete the TransformTag with `tag-id`."
  [tag-id :- ms/PositiveInt]
  (t2/delete! :model/TransformTag :id tag-id))

(mu/defn tags :- [:sequential (ms/InstanceOf :model/TransformTag)]
  "Every TransformTag, in name order."
  []
  (t2/select :model/TransformTag {:order-by [[:name :asc]]}))

;;; ---------------------------------------------------- Jobs ------------------------------------------------------

(mu/defn insert-job! :- (ms/InstanceOf :model/TransformJob)
  "Insert the TransformJob `job-data` and return the inserted instance."
  [job-data :- [:map {:closed true}
                [:name            {:optional true} :any]
                [:description     {:optional true} :any]
                [:schedule        {:optional true} :any]
                [:entity_id       {:optional true} :any]
                [:created_at      {:optional true} :any]
                [:updated_at      {:optional true} :any]
                [:built_in_type   {:optional true} :any]
                [:ui_display_type {:optional true} :any]
                [:active          {:optional true} :any]]]
  (t2/insert-returning-instance! :model/TransformJob job-data))

(mu/defn insert-job-tags! :- :int
  "Insert the TransformJobTransformTag `rows`."
  [rows :- [:seqable
            [:map {:closed true}
             [:job_id    {:optional true} :any]
             [:tag_id    {:optional true} :any]
             [:entity_id {:optional true} :any]
             [:position  {:optional true} :any]]]]
  (t2/insert! :model/TransformJobTransformTag rows))

(mu/defn jobs-with-active-flag :- [:sequential (ms/InstanceOf :model/TransformJob)]
  "The TransformJobs whose `:active` flag is `active`."
  [active :- :boolean]
  (t2/select :model/TransformJob :active active))

(mu/defn job :- [:maybe (ms/InstanceOf :model/TransformJob)]
  "The TransformJob with `job-id`, or nil."
  [job-id :- ms/PositiveInt]
  (t2/select-one :model/TransformJob :id job-id))

(mu/defn job-pk :- [:maybe ms/PositiveInt]
  "The primary key of the TransformJob with `job-id`, or nil."
  [job-id :- ms/PositiveInt]
  (t2/select-one-pk :model/TransformJob :id job-id))

(mu/defn update-job! :- :int
  "Apply `updates` to the TransformJob with `job-id`."
  [job-id  :- ms/PositiveInt
   updates :- [:map {:closed true}
               [:name            {:optional true} :string]
               [:description     {:optional true} [:maybe :string]]
               [:schedule        {:optional true} :string]
               [:ui_display_type {:optional true} :keyword]]]
  (t2/update! :model/TransformJob job-id updates))

(mu/defn delete-job! :- :int
  "Delete the TransformJob with `job-id`."
  [job-id :- ms/PositiveInt]
  (t2/delete! :model/TransformJob :id job-id))

(mu/defn jobs :- [:sequential (ms/InstanceOf :model/TransformJob)]
  "Every TransformJob, newest first."
  []
  (t2/select :model/TransformJob {:order-by [[:created_at :desc]]}))

(mu/defn job-run :- [:maybe (ms/InstanceOf :model/TransformJobRun)]
  "The TransformJobRun with `run-id` belonging to the TransformJob with `job-id`, or nil."
  [run-id :- ms/PositiveInt
   job-id :- ms/PositiveInt]
  (t2/select-one :model/TransformJobRun :id run-id :job_id job-id))

;;; -------------------------------------------------- DAG runs -----------------------------------------------------

(mu/defn dag-run :- [:maybe (ms/InstanceOf :model/TransformDagRun)]
  "The TransformDagRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one :model/TransformDagRun :id run-id))
