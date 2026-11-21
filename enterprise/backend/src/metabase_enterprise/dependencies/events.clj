(ns metabase-enterprise.dependencies.events
  "Handlers of the lifecycle events that mark the statuses the writes of a batch make stale, once per batch inside its
  transaction, and trigger the background jobs once it commits."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding-status :as models.analysis-finding-status]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as models.dependency-status]
   [metabase-enterprise.dependencies.models.result-metadata-status :as models.result-metadata-status]
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
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
  "An atom of what the writes of a batch mark when it ends: `:dependency` and `:analysis`, the entities whose own
  statuses go stale, as `{entity-type #{entity-id}}`; `:transitive`, the measures and snippets whose every transitive
  dependent goes stale, as `{entity-type [entity]}`; `:dependents`, the entities whose direct dependents go stale;
  `:data-app-collections`, the resource collections of the data apps whose dependencies go stale; `:remapped-tables`
  and `:remap-targets`."
  [:fn {:error/message "an atom"} #(instance? clojure.lang.IAtom %)])

(def ^:private Lookups
  "What the rows of a batch need of the app DB, loaded together before they are marked: `:via`, the column values of
  the rows that parts lead to, by model, column and id; `:field-tables`, the Table id of each Field; and
  `:internal-remaps`, the ids of the Fields with an internal remap."
  [:map {:closed true}
   [:via             [:map-of :keyword [:map-of :keyword [:map-of ms/PositiveInt [:maybe ms/PositiveInt]]]]]
   [:field-tables    [:map-of ms/PositiveInt [:maybe ms/PositiveInt]]]
   [:internal-remaps [:set ms/PositiveInt]]])

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

(defn- rows-of
  "The rows before and after the write of the row `event`, without a missing one."
  [{:keys [object previous-object]}]
  (remove nil? [previous-object object]))

(mu/defn- lookups :- Lookups
  "Load what marking the row `events` needs, with a number of queries that does not grow with the events."
  [events :- [:sequential [:map]]]
  (let [via-ids   (reduce (fn [acc {:keys [model] :as event}]
                            (let [{column :key, [via-model via-column] :via} (:part-of (dependencies/spec model))]
                              (cond-> acc
                                via-model (update-in [via-model via-column] (fnil into #{}) (keep column (rows-of event))))))
                          {}
                          events)
        field-ids (into #{}
                        (comp (filter (comp #{:model/Dimension :model/FieldValues} :model))
                              (mapcat rows-of)
                              (keep :field_id))
                        events)]
    {:via             (into {}
                            (for [[via-model columns] via-ids]
                              [via-model (into {}
                                               (for [[via-column ids] columns
                                                     :when (seq ids)]
                                                 [via-column (dependencies.db/column-values via-model via-column (vec ids))]))]))
     :field-tables    (if (seq field-ids) (dependencies.db/field-table-ids (vec field-ids)) {})
     :internal-remaps (if (seq field-ids) (dependencies.db/internal-remap-field-ids (vec field-ids)) #{})}))

(mu/defn- part-owner :- Node
  "The entity, as `[entity-type entity-id]`, that `row` of `model` is a part of, as the `:part-of` of its spec says,
  or nil."
  [lookups :- Lookups
   model   :- :keyword
   row     :- [:maybe [:map]]]
  (when-let [{entity-type :type, column :key, [via-model via-column] :via} (:part-of (dependencies/spec model))]
    [entity-type (if via-model
                   (some->> (get row column) (get (get-in lookups [:via via-model via-column])))
                   (get row column))]))

(mu/defn- mark-own!
  "Add the entities `type->ids` to those whose statuses in `kind`, `:dependency` or `:analysis`, `batched` marks stale."
  [batched   :- Marks
   kind      :- [:enum :dependency :analysis]
   type->ids :- ::dependencies.schema/type->ids]
  (swap! batched update kind #(merge-with into % type->ids)))

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
   lookups :- Lookups
   row     :- [:maybe [:map]]]
  (when-let [table-id (some->> (:field_id row) (get (:field-tables lookups)))]
    (mark-remapped-tables! batched #{table-id})))

(mu/defn- mark-field-values! :- :boolean
  "Mark what reads the internal remap of the Field of the FieldValues, which shows only while they have human-readable
  values, when a write of them as `before` and `after` adds or removes those."
  [batched :- Marks
   lookups :- Lookups
   before  :- [:maybe [:map]]
   after   :- [:maybe [:map]]]
  (let [row      (or after before)
        readable (comp boolean seq :human_readable_values)]
    (boolean
     (when (and (= :full (keyword (:type row)))
                (not= (readable before) (readable after))
                (contains? (:internal-remaps lookups) (:field_id row)))
       (mark-dimension! batched lookups row)
       true))))

(mu/defn- mark-output-changed!
  "Mark what reads the output of the entity `entity-type` `entity` stale: the direct dependents, or every transitive
  dependent of a measure or a snippet, which their dependents expand and nothing between them stores."
  [batched     :- Marks
   entity-type :- ::deps.dependency-types/dependency-types
   entity      :- [:map]]
  (if (#{:measure :snippet} entity-type)
    (swap! batched update-in [:transitive entity-type] (fnil conj []) entity)
    (mark-dependents! batched entity-type (:id entity))))

(mu/defn- mark-part-owner!
  "Mark what a write of a part of the `[owner-type owner-id]` entity changes: the dependencies of a dashboard or an
  action, or what the entities depending on a table read."
  [batched               :- Marks
   [owner-type owner-id] :- Node]
  (when owner-id
    (if (= :table owner-type)
      (mark-dependents! batched :table owner-id)
      (mark-own! batched :dependency {owner-type #{owner-id}}))))

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
  "Add the resource collections among `collection-ids` to those whose data apps `batched` marks stale."
  [batched        :- Marks
   collection-ids :- [:sequential [:maybe ms/PositiveInt]]]
  (swap! batched update :data-app-collections (fnil into #{}) (remove nil?) collection-ids))

(mu/defn- mark-update! :- :boolean
  "Mark the statuses the update `event` makes stale: the entity's own, by the columns each job reads, and what reads
  its output when that changes, returning whether a column some job reads changed."
  [batched :- Marks
   lookups :- Lookups
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
      (mark-own! batched :dependency own))
    (when analysis?
      (mark-own! batched :analysis own))
    (when output?
      (mark-output-changed! batched entity-type object))
    (when part?
      (run! #(mark-part-owner! batched %) (distinct [(part-owner lookups model previous-object)
                                                     (part-owner lookups model object)])))
    (when part?
      (case model
        :model/Field             (mark-remap-targets! batched #{(:id object)})
        :model/FieldUserSettings (mark-remap-targets! batched #{(:field_id object)})
        nil))
    (when data-apps?
      (mark-data-apps! batched [(:collection_id previous-object) (:collection_id object)]))
    (or dependency? analysis? output? part? data-apps?
        (case model
          :model/Dimension   (boolean (when (u.events/changed-any? event dimension-columns)
                                        (run! #(mark-dimension! batched lookups %) (distinct [previous-object object]))
                                        true))
          :model/FieldValues (mark-field-values! batched lookups previous-object object)
          false))))

(defn- flush-marks!
  "Mark, with a number of statements that does not grow with the writes of the batch, the statuses that `marks`
  hold: the entities' own, the transitive dependents of the measures and snippets, the dependents, the data apps of the
  resource collections, the remapped Tables and the remap targets."
  [{:keys [dependency analysis transitive dependents data-app-collections remapped-tables remap-targets]}]
  (when (seq dependency)
    (models.dependency-status/mark-dependency-statuses-stale! dependency))
  (when (seq analysis)
    (models.analysis-finding-status/mark-analysis-finding-statuses-stale! analysis))
  (when-let [measures (seq (:measure transitive))]
    (let [dependents (models.dependency/transitive-dependents {:measure (vec measures)})]
      (models.result-metadata-status/mark-result-metadata-statuses-stale! dependents)
      (models.analysis-finding-status/mark-analysis-finding-statuses-stale! dependents)))
  (when-let [snippets (seq (:snippet transitive))]
    (let [dependents (models.dependency/transitive-dependents {:snippet (vec snippets)})]
      (models.dependency-status/mark-dependency-statuses-stale! dependents)
      (models.analysis-finding-status/mark-analysis-finding-statuses-stale! dependents)))
  (when (seq data-app-collections)
    (models.dependency-status/mark-data-app-dependency-statuses-stale! (vec data-app-collections)))
  (doseq [[entity-type entity-ids] dependents]
    (models.result-metadata-status/mark-dependents-result-metadata-statuses-stale! entity-type entity-ids)
    (models.analysis-finding-status/mark-dependents-analysis-finding-statuses-stale! entity-type entity-ids))
  (let [remapped (into (set remapped-tables)
                       (when (seq remap-targets)
                         (dependencies.db/remapped-table-ids remap-targets)))]
    (when (seq remapped)
      (let [dependents (models.dependency/transitive-dependents {:table (mapv #(hash-map :id %) remapped)})]
        (models.result-metadata-status/mark-result-metadata-statuses-stale! dependents)
        (models.analysis-finding-status/mark-analysis-finding-statuses-stale! dependents)))))

(mu/defn- mark-insert!
  "Mark what inserting `row` of `model` changes; a new entity has no status, which has the jobs process it."
  [batched :- Marks
   lookups :- Lookups
   model   :- :keyword
   row     :- [:map]]
  (when (:part-of (dependencies/spec model))
    (mark-part-owner! batched (part-owner lookups model row)))
  (case model
    (:model/Action :model/Card) (mark-data-apps! batched [(:collection_id row)])
    :model/Dimension            (mark-dimension! batched lookups row)
    :model/FieldValues          (mark-field-values! batched lookups nil row)
    :model/FieldUserSettings    (mark-remap-targets! batched #{(:field_id row)})
    nil))

(mu/defn- mark-delete!
  "Mark what deleting `row` of `model` changes, the entity it is a part of and what reads a deleted entity."
  [batched :- Marks
   lookups :- Lookups
   model   :- :keyword
   row     :- [:map]]
  (when (:part-of (dependencies/spec model))
    (mark-part-owner! batched (part-owner lookups model row)))
  (case model
    (:model/Action :model/Card) (mark-data-apps! batched [(:collection_id row)])
    :model/Dimension            (mark-dimension! batched lookups row)
    :model/FieldValues          (mark-field-values! batched lookups row nil)
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
  [batched lookups {:keys [model operation object previous-object] :as event}]
  (case operation
    :create (do (mark-insert! batched lookups model object) true)
    :update (mark-update! batched lookups event)
    :delete (do (mark-delete! batched lookups model previous-object) true)))

(defn- mark-batch!
  "Mark what the `events` of a batch make stale, once per entity, with a number of statements that does not grow with
  the events, and trigger the jobs once the transaction commits."
  [events _all-events]
  (when (premium-features/has-feature? :dependencies)
    (let [lookups (lookups events)
          batched (atom {})
          marked? (some true? (doall (map #(mark-event! batched lookups %) events)))]
      (flush-marks! @batched)
      (when marked?
        (trigger-jobs!)))))

(events/derive! :metabase/lifecycle-event ::dependencies)

(methodical/defmethod events/publish-event! ::dependencies
  [topic event]
  (when-let [events (not-empty (filterv owner (events/row-events topic event)))]
    (mark-batch! events events)))

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
