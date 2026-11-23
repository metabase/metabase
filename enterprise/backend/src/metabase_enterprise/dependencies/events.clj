(ns metabase-enterprise.dependencies.events
  "Handlers of the lifecycle events that mark the statuses the writes of a batch make stale, once per batch inside its
  transaction, and trigger the background jobs once it commits."
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
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.events :as u.events]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]))

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
  "Have every job triggered once the current transaction commits."
  []
  (mdb/do-after-commit #(grouper/submit! @writes-queue {:dependency-jobs true})))

(def ^:private Marks
  "An atom of what the writes of a batch mark when it ends."
  [:fn {:error/message "an atom"} #(instance? clojure.lang.IAtom %)])

(def ^:private Columns
  "The columns a write of a model has to change."
  [:maybe [:set :keyword]])

(def ^:private Node
  "An entity as `[entity-type entity-id]`, the ID nil when unknown."
  [:maybe [:tuple ::deps.dependency-types/dependency-types [:maybe ms/PositiveInt]]])

(def ^:private dimension-columns
  "The columns of a Dimension whose update changes the remap it describes."
  #{:field_id :human_readable_field_id :name :type})

(mu/defn- output-columns :- Columns
  "The `:output-columns` of the spec of `model`, with the name of a metric `row`, which the cards aggregating it show."
  [model :- :keyword
   row   :- [:map]]
  (cond-> (:output-columns (dependencies/spec model))
    (and (= :model/Card model) (= :metric (keyword (:type row)))) (conj :name)))

(mu/defn- part-owner :- Node
  "The entity, as `[entity-type entity-id]`, that `row` of `model` is a part of, as the `:part-of` of its spec says,
  or nil."
  [model :- :keyword
   row   :- [:maybe [:map]]]
  (when-let [{entity-type :type, column :key, [via-model via-column] :via} (:part-of (dependencies/spec model))]
    [entity-type (if via-model
                   (some->> (get row column) (dependencies.db/column-value via-model via-column))
                   (get row column))]))

(mu/defn- mark-dependents!
  "Add the entity `entity-type` `entity-id` to what `batched`, an atom of the marks of a batch, marks when it ends: the
  `:dependents` of `{entity-type #{entity-id}}`, the `:remapped-tables` and the `:remap-targets` fields, the only way
  the writes of a batch can mark each of them once."
  [batched     :- Marks
   entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt]
  (swap! batched update-in [:dependents entity-type] (fnil conj #{}) entity-id))

(mu/defn- mark-remapped-tables!
  "Add the Tables with `table-ids` to what `batched` marks: every entity transitively depending on them, whose
  remapped columns their stored metadata carries down."
  [batched   :- Marks
   table-ids :- [:set ms/PositiveInt]]
  (when (seq table-ids)
    (swap! batched update :remapped-tables (fnil into #{}) table-ids)))

(mu/defn- mark-remap-targets!
  "Add the Fields with `field-ids` to what `batched` marks: what reads the remaps whose human-readable field is one of
  them, a change of which the remapped columns show."
  [batched   :- Marks
   field-ids :- [:set ms/PositiveInt]]
  (when (seq field-ids)
    (swap! batched update :remap-targets (fnil into #{}) field-ids)))

(mu/defn- mark-dimension!
  "Mark what reads the remap of the Dimension `row`, whose Field's Table's entities show it."
  [batched :- Marks
   row     :- [:maybe [:map]]]
  (when-let [table-id (some-> (:field_id row) dependencies.db/field-table-id)]
    (mark-remapped-tables! batched #{table-id})))

(mu/defn- mark-field-values! :- :boolean
  "Mark what reads the internal remap of the Field of the FieldValues, which shows only while they have human-readable
  values, when a write of them as `before` and `after` adds or removes those."
  [batched :- Marks
   before  :- [:maybe [:map]]
   after   :- [:maybe [:map]]]
  (let [row      (or after before)
        readable (comp boolean seq :human_readable_values)]
    (boolean
     (when (and (= :full (keyword (:type row)))
                (not= (readable before) (readable after))
                (dependencies.db/internal-remap? (:field_id row)))
       (mark-dimension! batched row)
       true))))

(mu/defn- mark-output-changed!
  "Mark what reads the output of the entity `entity-type` `entity` stale: the direct dependents, or every transitive
  dependent of a measure or a snippet, which their dependents expand and nothing between them stores."
  [batched     :- Marks
   entity-type :- ::deps.dependency-types/dependency-types
   entity      :- [:map]]
  (case entity-type
    :measure (let [dependents (models.dependency/transitive-dependents {:measure [entity]})]
               (dependencies.db/mark-result-metadata-statuses-stale! dependents)
               (dependencies.db/mark-analysis-finding-statuses-stale! dependents))
    :snippet (let [dependents (models.dependency/transitive-dependents {:snippet [entity]})]
               (dependencies.db/mark-dependency-statuses-stale! dependents)
               (dependencies.db/mark-analysis-finding-statuses-stale! dependents))
    (mark-dependents! batched entity-type (:id entity))))

(mu/defn- mark-part-owner!
  "Mark what a write of a part of the `[owner-type owner-id]` entity changes: the dependencies of a dashboard or an
  action, or what the entities depending on a table read."
  [batched               :- Marks
   [owner-type owner-id] :- Node]
  (when owner-id
    (if (= :table owner-type)
      (mark-dependents! batched :table owner-id)
      (dependencies.db/mark-dependency-statuses-stale! {owner-type #{owner-id}}))))

(mu/defn- output-changed? :- :boolean
  "Whether the `event`, the update of a row of a model, changes what the entities directly depending on it read,
  ignoring a card's result metadata changes they don't see, such as a run's new fingerprints."
  [{:keys [model object previous-object] :as event} :- [:map]]
  (let [columns (output-columns model object)]
    (and (u.events/changed-any? event columns)
         (or (not= :model/Card model)
             (u.events/changed-any? event (disj columns :result_metadata))
             (not (deps.result-metadata/same-output? (:result_metadata previous-object) (:result_metadata object)))))))

(mu/defn- data-apps-changed? :- :boolean
  "Whether the `event`, the update of a row of a model, moves a Card or an Action to another collection, which changes
  what the data apps whose resource collection it leaves or enters depend on."
  [{:keys [model] :as event} :- [:map]]
  (and (contains? #{:model/Action :model/Card} model)
       (u.events/changed-any? event #{:collection_id})))

(mu/defn- mark-data-apps!
  "Mark the dependencies of the data apps whose resource collection is one of `collection-ids` stale, querying nothing
  when every one is nil."
  [collection-ids :- [:sequential [:maybe ms/PositiveInt]]]
  (when-let [collection-ids (not-empty (into [] (comp (remove nil?) (distinct)) collection-ids))]
    (dependencies.db/mark-data-app-dependency-statuses-stale! collection-ids)))

(mu/defn- mark-update! :- :boolean
  "Mark the statuses the update `event` makes stale: the entity's own, by the columns each job reads, and what reads
  its output when that changes, returning whether a column some job reads changed."
  [batched :- Marks
   {:keys [model object previous-object] :as event} :- [:map]]
  (let [spec        (dependencies/spec model)
        entity-type (:type spec)
        own         {entity-type #{(:id object)}}
        dependency? (u.events/changed-any? event (:dependency-columns spec))
        analysis?   (u.events/changed-any? event (:analysis-columns spec))
        output?     (output-changed? event)
        part?       (u.events/changed-any? event (:part-columns spec))
        data-apps?  (data-apps-changed? event)]
    (when dependency?
      (dependencies.db/mark-dependency-statuses-stale! own))
    (when analysis?
      (dependencies.db/mark-analysis-finding-statuses-stale! own))
    (when output?
      (mark-output-changed! batched entity-type object))
    (when part?
      (run! #(mark-part-owner! batched %) (distinct [(part-owner model previous-object) (part-owner model object)])))
    (when part?
      (case model
        :model/Field             (mark-remap-targets! batched #{(:id object)})
        :model/FieldUserSettings (mark-remap-targets! batched #{(:field_id object)})
        nil))
    (when data-apps?
      (mark-data-apps! [(:collection_id previous-object) (:collection_id object)]))
    (or dependency? analysis? output? part? data-apps?
        (case model
          :model/Dimension   (boolean (when (u.events/changed-any? event dimension-columns)
                                        (run! #(mark-dimension! batched %) (distinct [previous-object object]))
                                        true))
          :model/FieldValues (mark-field-values! batched previous-object object)
          false))))

(defn- flush-marks!
  "Mark the dependents, the remapped Tables and the remap targets that `marks` hold."
  [{:keys [dependents remapped-tables remap-targets]}]
  (doseq [[entity-type entity-ids] dependents]
    (dependencies.db/mark-dependents-result-metadata-statuses-stale! entity-type entity-ids)
    (dependencies.db/mark-dependents-analysis-finding-statuses-stale! entity-type entity-ids))
  (let [remapped (into (set remapped-tables)
                       (when (seq remap-targets)
                         (dependencies.db/remapped-table-ids remap-targets)))]
    (when (seq remapped)
      (let [dependents (models.dependency/transitive-dependents {:table (mapv #(hash-map :id %) remapped)})]
        (dependencies.db/mark-result-metadata-statuses-stale! dependents)
        (dependencies.db/mark-analysis-finding-statuses-stale! dependents)))))

(mu/defn- mark-insert!
  "Mark what inserting `row` of `model` changes; a new entity has no status, which has the jobs process it."
  [batched :- Marks
   model   :- :keyword
   row     :- [:map]]
  (when (:part-of (dependencies/spec model))
    (mark-part-owner! batched (part-owner model row)))
  (case model
    (:model/Action :model/Card) (mark-data-apps! [(:collection_id row)])
    :model/Dimension            (mark-dimension! batched row)
    :model/FieldValues          (mark-field-values! batched nil row)
    :model/FieldUserSettings    (mark-remap-targets! batched #{(:field_id row)})
    nil))

(mu/defn- mark-delete!
  "Mark what deleting `row` of `model` changes, the entity it is a part of and what reads a deleted entity."
  [batched :- Marks
   model   :- :keyword
   row     :- [:map]]
  (when (:part-of (dependencies/spec model))
    (mark-part-owner! batched (part-owner model row)))
  (case model
    (:model/Action :model/Card) (mark-data-apps! [(:collection_id row)])
    :model/Dimension            (mark-dimension! batched row)
    :model/FieldValues          (mark-field-values! batched row nil)
    :model/Field                (mark-remap-targets! batched #{(:id row)})
    :model/FieldUserSettings    (mark-remap-targets! batched #{(:field_id row)})
    nil)
  (when-let [entity-type (dependencies/model-type model)]
    (mark-output-changed! batched entity-type row)))

(def ^:private spec-less-models
  "The models without a dependencies spec whose writes the jobs read all the same: the remaps of Dimensions and
  FieldValues, which the marking above handles, and Databases, whose creation and deletion trigger the jobs."
  #{:model/Database :model/Dimension :model/FieldValues})

(defn- owner
  "The one owner of the `event`s of a batch of the models whose writes the jobs read: those with a dependencies spec
  and the [[spec-less-models]]."
  [{:keys [model]}]
  (when (or (contains? spec-less-models model) (dependencies/spec model))
    ::batch))

(defn- mark-event!
  "Mark what the `event` makes stale, returning whether it marked anything the jobs read."
  [batched {:keys [model operation object previous-object] :as event}]
  (case operation
    :create (do (mark-insert! batched model object) true)
    :update (mark-update! batched event)
    :delete (do (mark-delete! batched model previous-object) true)))

(defn- mark-batch!
  "Mark what the `events` of a batch make stale, once per entity, and trigger the jobs once the transaction commits."
  [_owner events _all-events]
  (when (premium-features/has-feature? :dependencies)
    (let [batched (atom {})
          marked? (some true? (doall (map #(mark-event! batched %) events)))]
      (flush-marks! @batched)
      (when marked?
        (trigger-jobs!)))))

(events/register-owned-consumer! ::dependencies owner mark-batch!)

(events/derive! ::transform-run :metabase/event)
(events/derive! :event/transform-run-complete ::transform-run)

(methodical/defmethod events/publish-event! ::transform-run
  "Make the output Table of a transform run depend on the transform."
  [_topic {{:keys [transform-id table-id]} :object}]
  (when (premium-features/has-feature? :dependencies)
    (when table-id
      (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))
    (trigger-jobs!)))

(events/derive! ::premium-token :metabase/event)
(events/derive! :event/premium-token-update ::premium-token)

(methodical/defmethod events/publish-event! ::premium-token
  "Restart every job, since they stop while the dependencies feature is disabled."
  [_topic _event]
  (when (premium-features/has-feature? :dependencies)
    (trigger-jobs-now!)))
