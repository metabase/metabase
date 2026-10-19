(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.hooks`: a write marks the statuses it makes stale in its own
  transaction, and triggers the background jobs once it commits."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.dependency :as task.dependency]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private job-triggers
  "The functions that trigger the jobs: the dependency job, the analysis finding job, and the result metadata job."
  [#'task.dependency/trigger-dependency-job!
   #'task.analysis-finding/trigger-analysis-finding-job!
   #'task.result-metadata/trigger-result-metadata-job!])

(mu/defn- trigger-jobs-now!
  "Trigger every job, logging rather than throwing a failure."
  []
  (doseq [trigger! job-triggers]
    (try
      (trigger!)
      (catch Throwable e
        (log/warnf "Failed to trigger %s: %s" (name (symbol trigger!)) (ex-message e))))))

(def ^:private writes-queue
  (delay (grouper/start! (fn [_writes] (trigger-jobs-now!)) :capacity 500 :interval 1000)))

(mu/defn- trigger-jobs!
  "Have every job triggered once the current transaction commits, together with the other writes in its batch."
  []
  (mdb/do-after-commit #(grouper/submit! @writes-queue {:dependency-jobs true})))

(def ^:private Row
  "A row a hook is given, a Toucan instance."
  [:fn {:error/message "a row"} map?])

(def ^:private Columns
  "The columns a write of a model has to change, or `:any`."
  [:maybe [:or [:= :any] [:set :keyword]]])

(def ^:private Entity
  "An entity as `[entity-type entity-id]`, the ID nil when unknown."
  [:maybe [:tuple ::deps.dependency-types/dependency-types [:maybe ms/PositiveInt]]])

(mu/defn- changed? :- :boolean
  "Whether the Toucan update of `instance` changes any of `columns`, or any column at all when `columns` is `:any`."
  [instance :- Row
   columns  :- Columns]
  (let [changes (t2/changes instance)]
    (if (= :any columns)
      (boolean (seq changes))
      (boolean (some #(contains? changes %) columns)))))

(def ^:private dependency-columns
  "For each model, the columns whose update has the dependency job compute the entity's dependencies again."
  {:model/Action             #{:model_id :type}
   :model/Card               #{:type :dataset_query :dimension_mappings :parameters}
   :model/Dashboard          #{:parameters}
   :model/Document           #{:content_type :document}
   :model/Measure            #{:definition :table_id}
   :model/NativeQuerySnippet #{:content :template_tags}
   :model/Sandbox            #{:card_id}
   :model/Segment            #{:definition :table_id}
   :model/Transform          #{:source :target}})

(def ^:private analysis-columns
  "For each model, the columns whose update has the analysis job analyze the entity itself again."
  {:model/Card      #{:type :dataset_query}
   :model/Segment   #{:definition :table_id}
   :model/Transform #{:source :target}})

(def ^:private output-columns
  "For each model, the columns whose update changes what the entities directly depending on it read, so their result
  metadata is re-derived and they are analyzed again."
  {:model/Card               #{:name :type :result_metadata}
   :model/Measure            #{:definition :table_id}
   :model/NativeQuerySnippet #{:content :template_tags}
   :model/Segment            #{:definition :table_id}
   :model/Table              #{:name :schema :display_name :active :visibility_type}})

(def ^:private field-columns
  "The Field columns whose update changes what the entities using the Field's Table read."
  #{:name :display_name :description :active :visibility_type :settings :base_type :effective_type :database_type
    :semantic_type :coercion_strategy :fk_target_field_id :position})

(mu/defn- part-owner :- Entity
  "The entity, as `[entity-type entity-id]`, that the `model` row `instance` is a part of, or nil."
  [model    :- :keyword
   instance :- [:maybe Row]]
  (case model
    (:model/DashboardCard :model/DashboardTab)    [:dashboard (:dashboard_id instance)]
    :model/DashboardCardSeries                    [:dashboard (some-> (:dashboardcard_id instance)
                                                                      dependencies.db/dashcard-dashboard-id)]
    :model/QueryAction                            [:action (:action_id instance)]
    (:model/Field :model/TableUserSettings)       [:table (:table_id instance)]
    (:model/FieldUserSettings :model/Dimension)   [:table (some-> (:field_id instance) dependencies.db/field-table-id)]
    nil))

(def ^:private part-columns
  "For each model whose rows are parts of an entity, the columns whose update changes the entity."
  {:model/DashboardCard       #{:card_id :dashboard_id :visualization_settings}
   :model/DashboardCardSeries #{:card_id :dashboardcard_id}
   :model/DashboardTab        #{}
   :model/QueryAction         #{:dataset_query}
   :model/Field               field-columns
   :model/TableUserSettings   #{:display_name :visibility_type :data_layer :field_order}
   :model/FieldUserSettings   (conj field-columns :custom_position :nfc_path :json_unfolding)
   :model/Dimension           :any})

(mu/defn- mark-dependents!
  "Mark the result metadata and analysis statuses of the entities directly depending on the entity `entity-type`
  `entity-id` stale."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt]
  (dependencies.db/mark-dependents-result-metadata-stale! entity-type entity-id)
  (dependencies.db/mark-dependents-analysis-findings-stale! entity-type entity-id))

(mu/defn- mark-output-changed!
  "Mark what reads the output of the entity `entity-type` `instance` stale: the direct dependents, or every transitive
  dependent of a measure or a snippet, which their dependents expand and nothing between them stores."
  [entity-type :- ::deps.dependency-types/dependency-types
   instance    :- Row]
  (case entity-type
    :measure (let [dependents (models.dependency/transitive-dependents {:measure [instance]})]
               (dependencies.db/mark-result-metadata-statuses-stale! dependents)
               (dependencies.db/mark-analysis-finding-statuses-stale! dependents))
    :snippet (let [dependents (models.dependency/transitive-dependents {:snippet [instance]})]
               (dependencies.db/mark-dependency-statuses-stale! dependents)
               (dependencies.db/mark-analysis-finding-statuses-stale! dependents))
    (mark-dependents! entity-type (:id instance))))

(mu/defn- mark-part-owner!
  "Mark what a write of a part of the `[owner-type owner-id]` entity changes: the dependencies of a dashboard or an
  action, or what the entities depending on a table read."
  [[owner-type owner-id] :- Entity]
  (when owner-id
    (if (= :table owner-type)
      (mark-dependents! :table owner-id)
      (dependencies.db/mark-dependency-statuses-stale! {owner-type #{owner-id}}))))

(mu/defn- mark-update! :- :boolean
  "Mark the statuses an update of the `model` row `instance` makes stale: the entity's own, by the columns each job
  reads, and what reads its output when that changes, returning whether it marked any."
  [model    :- :keyword
   instance :- Row]
  (let [entity-type (deps.dependency-types/model->dependency-type model)
        own         {entity-type #{(:id instance)}}
        dependency? (changed? instance (dependency-columns model))
        analysis?   (changed? instance (analysis-columns model))
        output?     (changed? instance (output-columns model))
        part?       (changed? instance (part-columns model))]
    (when dependency?
      (dependencies.db/mark-dependency-statuses-stale! own))
    (when analysis?
      (dependencies.db/mark-analysis-finding-statuses-stale! own))
    (when output?
      (mark-output-changed! entity-type instance))
    (when part?
      (run! mark-part-owner! (distinct [(part-owner model (t2/original instance)) (part-owner model instance)])))
    (or dependency? analysis? output? part?)))

(defenterprise before-insert
  "Mark what inserting the `model` row `instance` changes, and trigger the jobs once it commits; a new entity has no
  status, which has the jobs process it."
  :feature :dependencies
  [model instance]
  (when (contains? part-columns model)
    (mark-part-owner! (part-owner model instance)))
  (trigger-jobs!))

(defenterprise before-update
  "Mark what updating the `model` row `instance` changes, and trigger the jobs once it commits when it marked any."
  :feature :dependencies
  [model instance]
  (when (mark-update! model instance)
    (trigger-jobs!)))

(defenterprise before-delete
  "Mark what deleting the `model` row `instance` changes: the entity it is a part of, what reads a deleted entity, or
  the transforms reading a deleted Database; and trigger the jobs once it commits."
  :feature :dependencies
  [model instance]
  (when (contains? part-columns model)
    (mark-part-owner! (part-owner model instance)))
  (when-let [entity-type (deps.dependency-types/model->dependency-type model)]
    (mark-output-changed! entity-type instance))
  (when (= model :model/Database)
    (when-let [transform-ids (not-empty (set (dependencies.db/source-database-transform-ids (:id instance))))]
      (dependencies.db/mark-dependency-statuses-stale! {:transform transform-ids})
      (dependencies.db/mark-analysis-finding-statuses-stale! {:transform transform-ids})))
  (trigger-jobs!))

(defenterprise after-transform-run
  "Make the output Table with `table-id` depend on the transform with `transform-id`."
  :feature :dependencies
  [transform-id table-id]
  (when table-id
    (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))
  (trigger-jobs!))

(defenterprise after-premium-token-update
  "Restart every job, since they stop while the dependencies feature is disabled."
  :feature :dependencies
  []
  (trigger-jobs-now!))
