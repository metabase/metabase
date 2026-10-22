(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.hooks`: a write marks the statuses it makes stale in its own
  transaction, and triggers the background jobs once it commits."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
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

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *batched-marks*
  "Within [[do-with-batched-marks]], an atom of what the batch marks when it ends: the `:dependents` of
  `{entity-type #{entity-id}}`, the `:remapped-tables` and the `:remap-targets` fields, the only way the hooks of a
  batch can mark each of them once."
  nil)

(mu/defn- trigger-jobs!
  "Have every job triggered once the current transaction commits, together with the other writes in its batch."
  []
  (when-not *batched-marks*
    (mdb/do-after-commit #(grouper/submit! @writes-queue {:dependency-jobs true}))))

(def ^:private Row
  "A row a hook is given, a Toucan instance."
  [:fn {:error/message "a row"} map?])

(def ^:private Columns
  "The columns a write of a model has to change, or `:any`."
  [:maybe [:or [:= :any] [:set :keyword]]])

(def ^:private Node
  "An entity as `[entity-type entity-id]`, the ID nil when unknown."
  [:maybe [:tuple ::deps.dependency-types/dependency-types [:maybe ms/PositiveInt]]])

(mu/defn- changed? :- :boolean
  "Whether the Toucan update of `row` changes any of `columns`, or any column at all when `columns` is `:any`."
  [row     :- Row
   columns :- Columns]
  (let [changes (t2/changes row)]
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

(def ^:private model-output-columns
  "For each model, the columns whose update changes what the entities directly depending on it read, so their statuses
  are marked."
  {:model/Card               #{:type :result_metadata}
   :model/Measure            #{:definition :table_id}
   :model/NativeQuerySnippet #{:content :template_tags}
   :model/Segment            #{:definition :table_id}
   :model/Table              #{:name :schema :display_name :active :visibility_type}})

(mu/defn- output-columns :- Columns
  "The [[model-output-columns]] of `row` of `model`, with the name of a metric, which the cards aggregating it show."
  [model :- :keyword
   row   :- Row]
  (cond-> (get model-output-columns model)
    (and (= :model/Card model) (= :metric (keyword (:type row)))) (conj :name)))

(def ^:private field-columns
  "The Field columns whose update changes what the entities using the Field's Table read."
  #{:name :display_name :description :active :visibility_type :settings :base_type :effective_type :database_type
    :semantic_type :coercion_strategy :fk_target_field_id :position})

(mu/defn- part-owner :- Node
  "The entity, as `[entity-type entity-id]`, that `row` of `model` is a part of, or nil."
  [model :- :keyword
   row   :- [:maybe Row]]
  (case model
    (:model/DashboardCard :model/DashboardTab)    [:dashboard (:dashboard_id row)]
    :model/DashboardCardSeries                    [:dashboard (some-> (:dashboardcard_id row)
                                                                      dependencies.db/dashcard-dashboard-id)]
    :model/QueryAction                            [:action (:action_id row)]
    (:model/Field :model/TableUserSettings)       [:table (:table_id row)]
    :model/FieldUserSettings                      [:table (some-> (:field_id row) dependencies.db/field-table-id)]
    nil))

(def ^:private part-columns
  "For each model whose rows are parts of an entity, the columns whose update changes the entity."
  {:model/DashboardCard       #{:card_id :dashboard_id :visualization_settings}
   :model/DashboardCardSeries #{:card_id :dashboardcard_id}
   :model/DashboardTab        #{}
   :model/QueryAction         #{:dataset_query}
   :model/Field               field-columns
   :model/TableUserSettings   #{:display_name :visibility_type :data_layer :field_order}
   :model/FieldUserSettings   (conj field-columns :custom_position :nfc_path :json_unfolding)})

(mu/defn- mark-dependents!
  "Mark the result metadata and analysis statuses of the entities directly depending on the entity `entity-type`
  `entity-id` stale."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt]
  (if-let [batched *batched-marks*]
    (swap! batched update-in [:dependents entity-type] (fnil conj #{}) entity-id)
    (do
      (dependencies.db/mark-dependents-result-metadata-statuses-stale! entity-type #{entity-id})
      (dependencies.db/mark-dependents-analysis-finding-statuses-stale! entity-type #{entity-id}))))

(mu/defn- mark-remapped-tables!
  "Mark the result metadata and analysis statuses of every entity transitively depending on the Tables with `table-ids`
  stale, whose remapped columns their stored metadata carries down."
  [table-ids :- [:set ms/PositiveInt]]
  (when (seq table-ids)
    (if-let [batched *batched-marks*]
      (swap! batched update :remapped-tables (fnil into #{}) table-ids)
      (let [dependents (models.dependency/transitive-dependents {:table (mapv #(hash-map :id %) table-ids)})]
        (dependencies.db/mark-result-metadata-statuses-stale! dependents)
        (dependencies.db/mark-analysis-finding-statuses-stale! dependents)))))

(mu/defn- mark-remap-targets!
  "Mark what reads the remaps whose human-readable field is one of the Fields with `field-ids`, a change of which the
  remapped columns show."
  [field-ids :- [:set ms/PositiveInt]]
  (when (seq field-ids)
    (if-let [batched *batched-marks*]
      (swap! batched update :remap-targets (fnil into #{}) field-ids)
      (mark-remapped-tables! (dependencies.db/remapped-table-ids field-ids)))))

(mu/defn- mark-dimension!
  "Mark what reads the remap of the Dimension `row`, whose Field's Table's entities show it."
  [row :- [:maybe Row]]
  (when-let [table-id (some-> (:field_id row) dependencies.db/field-table-id)]
    (mark-remapped-tables! #{table-id})))

(mu/defn- mark-field-values! :- :boolean
  "Mark what reads the internal remap of the Field of the FieldValues, which shows only while they have human-readable
  values, when a write of them as `before` and `after` adds or removes those."
  [before :- [:maybe Row]
   after  :- [:maybe Row]]
  (let [row      (or after before)
        readable (comp boolean seq :human_readable_values)]
    (boolean
     (when (and (= :full (keyword (:type row)))
                (not= (readable before) (readable after))
                (dependencies.db/internal-remap? (:field_id row)))
       (mark-dimension! row)
       true))))

(mu/defn- mark-output-changed!
  "Mark what reads the output of the entity `entity-type` `entity` stale: the direct dependents, or every transitive
  dependent of a measure or a snippet, which their dependents expand and nothing between them stores."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity      :- Row]
  (case entity-type
    :measure (let [dependents (models.dependency/transitive-dependents {:measure [entity]})]
               (dependencies.db/mark-result-metadata-statuses-stale! dependents)
               (dependencies.db/mark-analysis-finding-statuses-stale! dependents))
    :snippet (let [dependents (models.dependency/transitive-dependents {:snippet [entity]})]
               (dependencies.db/mark-dependency-statuses-stale! dependents)
               (dependencies.db/mark-analysis-finding-statuses-stale! dependents))
    (mark-dependents! entity-type (:id entity))))

(mu/defn- mark-part-owner!
  "Mark what a write of a part of the `[owner-type owner-id]` entity changes: the dependencies of a dashboard or an
  action, or what the entities depending on a table read."
  [[owner-type owner-id] :- Node]
  (when owner-id
    (if (= :table owner-type)
      (mark-dependents! :table owner-id)
      (dependencies.db/mark-dependency-statuses-stale! {owner-type #{owner-id}}))))

(mu/defn- output-changed? :- :boolean
  "Whether the update of `row` of `model` changes what the entities directly depending on it read, ignoring a card's
  result metadata changes they don't see, such as a run's new fingerprints."
  [model :- :keyword
   row   :- Row]
  (let [columns (output-columns model row)]
    (and (changed? row columns)
         (or (not= :model/Card model)
             (changed? row (disj columns :result_metadata))
             (not (deps.result-metadata/same-output? (:result_metadata (t2/original row)) (:result_metadata row)))))))

(mu/defn- mark-update! :- :boolean
  "Mark the statuses an update of `row` of `model` makes stale: the entity's own, by the columns each job
  reads, and what reads its output when that changes, returning whether a column some job reads changed."
  [model :- :keyword
   row   :- Row]
  (let [entity-type (deps.dependency-types/model->dependency-type model)
        own         {entity-type #{(:id row)}}
        dependency? (changed? row (dependency-columns model))
        analysis?   (changed? row (analysis-columns model))
        output?     (output-changed? model row)
        part?       (changed? row (part-columns model))]
    (when dependency?
      (dependencies.db/mark-dependency-statuses-stale! own))
    (when analysis?
      (dependencies.db/mark-analysis-finding-statuses-stale! own))
    (when output?
      (mark-output-changed! entity-type row))
    (when part?
      (run! mark-part-owner! (distinct [(part-owner model (t2/original row)) (part-owner model row)])))
    (when part?
      (case model
        :model/Field             (mark-remap-targets! #{(:id row)})
        :model/FieldUserSettings (mark-remap-targets! #{(:field_id row)})
        nil))
    (or dependency? analysis? output? part?
        (case model
          :model/Dimension   (do (run! mark-dimension! (distinct [(t2/original row) row])) true)
          :model/FieldValues (mark-field-values! (t2/original row) row)
          false))))

(defenterprise do-with-batched-marks
  "Run `thunk`, marking what its writes change once per entity after it ends, even when it throws, instead of once per
  row in each write's transaction, and triggering the jobs once."
  :feature :dependencies
  [thunk]
  (if *batched-marks*
    (thunk)
    (let [batched (atom {})]
      (try
        (binding [*batched-marks* batched]
          (thunk))
        (finally
          (let [{:keys [dependents remapped-tables remap-targets]} @batched]
            (doseq [[entity-type entity-ids] dependents]
              (dependencies.db/mark-dependents-result-metadata-statuses-stale! entity-type entity-ids)
              (dependencies.db/mark-dependents-analysis-finding-statuses-stale! entity-type entity-ids))
            (mark-remapped-tables! (into (set remapped-tables)
                                         (when (seq remap-targets)
                                           (dependencies.db/remapped-table-ids remap-targets)))))
          (trigger-jobs!))))))

(defenterprise before-insert
  "Mark what inserting `row` of `model` changes, and trigger the jobs once it commits; a new entity has no
  status, which has the jobs process it."
  :feature :dependencies
  [model row]
  (when (contains? part-columns model)
    (mark-part-owner! (part-owner model row)))
  (case model
    :model/Dimension         (mark-dimension! row)
    :model/FieldValues       (mark-field-values! nil row)
    :model/FieldUserSettings (mark-remap-targets! #{(:field_id row)})
    nil)
  (trigger-jobs!))

(defenterprise before-update
  "Mark what updating `row` of `model` changes, and trigger the jobs once it commits when it marked any."
  :feature :dependencies
  [model row]
  (when (mark-update! model row)
    (trigger-jobs!)))

(defenterprise before-delete
  "Mark what deleting `row` of `model` changes: the entity it is a part of, what reads a deleted entity, or
  the transforms reading a deleted Database; and trigger the jobs once it commits."
  :feature :dependencies
  [model row]
  (when (contains? part-columns model)
    (mark-part-owner! (part-owner model row)))
  (case model
    :model/Dimension         (mark-dimension! row)
    :model/FieldValues       (mark-field-values! row nil)
    :model/Field             (mark-remap-targets! #{(:id row)})
    :model/FieldUserSettings (mark-remap-targets! #{(:field_id row)})
    nil)
  (when-let [entity-type (deps.dependency-types/model->dependency-type model)]
    (mark-output-changed! entity-type row))
  (when (= model :model/Database)
    (when-let [transform-ids (not-empty (dependencies.db/source-database-transform-ids (:id row)))]
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
