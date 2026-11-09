(ns metabase.serialization.db
  "Application database queries for the serialization module."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::row
  "A row of any serialized model, as its spec imports it; the model's own hooks and schemas check it."
  [:map {:closed false, ::mr/deliberately-open true, :description "row of a serialized model"}])

(mr/def ::columns
  "The columns a query selects, or nil for every column."
  [:maybe [:sequential :keyword]])

(defn- selected
  "`model` with only `columns` unless nil."
  [model columns]
  (if columns (into [model] columns) model))

(mu/defn rows-by-pks :- [:sequential ::row]
  "The `model` rows, with only `columns` unless nil, whose primary key is one of `pks`."
  [model   :- :keyword
   pks     :- [:sequential {:min 1} [:or :int :string]]
   columns :- ::columns]
  (t2/select (selected model columns) :toucan/pk [:in [:auto/param (vec pks)]]))

(mu/defn rows-by-entity-ids :- [:sequential ::row]
  "The `model` rows, with only `columns` unless nil, whose entity id is one of `eids`."
  [model   :- :keyword
   eids    :- [:sequential {:min 1} :string]
   columns :- ::columns]
  (t2/select (selected model columns) :entity_id [:in [:auto/param (vec eids)]]))

(mu/defn users-by-emails :- [:sequential ::row]
  "The Users, with only `columns` unless nil, whose email is one of `emails`."
  [emails  :- [:sequential {:min 1} :string]
   columns :- ::columns]
  (t2/select (selected :model/User columns) :email [:in [:auto/param (vec emails)]]))

(mu/defn databases-by-names :- [:sequential ::row]
  "The Databases, with only `columns` unless nil, whose name is one of `db-names`."
  [db-names :- [:sequential {:min 1} :string]
   columns  :- ::columns]
  (t2/select (selected :model/Database columns) :name [:in [:auto/param (vec db-names)]]))

(mu/defn tables-by-names :- [:sequential ::row]
  "The Tables, with only `columns` unless nil, of the Databases with `db-ids` whose name is one of `table-names`."
  [db-ids      :- [:sequential {:min 1} :int]
   table-names :- [:sequential {:min 1} :string]
   columns     :- ::columns]
  (t2/select (selected :model/Table columns)
             :db_id [:in [:auto/param (vec db-ids)]]
             :name  [:in [:auto/param (vec table-names)]]))

(mu/defn top-level-fields-by-names :- [:sequential ::row]
  "The Fields with no parent, with only `columns` unless nil, of the Tables with `table-ids` whose name is one of
  `field-names`."
  [table-ids   :- [:sequential {:min 1} :int]
   field-names :- [:sequential {:min 1} :string]
   columns     :- ::columns]
  (t2/select (selected :model/Field columns)
             :table_id  [:in [:auto/param (vec table-ids)]]
             :parent_id nil
             :name      [:in [:auto/param (vec field-names)]]))

(mu/defn nested-fields-by-names :- [:sequential ::row]
  "The Fields, with only `columns` unless nil, of the parent Fields with `parent-ids` whose name is one of
  `field-names`."
  [parent-ids  :- [:sequential {:min 1} :int]
   field-names :- [:sequential {:min 1} :string]
   columns     :- ::columns]
  (t2/select (selected :model/Field columns)
             :parent_id [:in [:auto/param (vec parent-ids)]]
             :name      [:in [:auto/param (vec field-names)]]))

(mu/defn settings-by-keys :- [:sequential ::row]
  "The Settings whose key is one of `setting-keys`, with only `columns` unless nil."
  [setting-keys :- [:sequential {:min 1} :string]
   columns      :- ::columns]
  (t2/select (selected :model/Setting columns) :key [:in [:auto/param (vec setting-keys)]]))

(mu/defn channels-by-names :- [:sequential ::row]
  "The Channels whose name is one of `channel-names`, with only `columns` unless nil."
  [channel-names :- [:sequential {:min 1} :string]
   columns       :- ::columns]
  (t2/select (selected :model/Channel columns) :name [:in [:auto/param (vec channel-names)]]))

(mu/defn field-values-by-field-ids :- [:sequential ::row]
  "The FieldValues of the Fields with `field-ids`, with only `columns` unless nil."
  [field-ids :- [:sequential {:min 1} :int]
   columns   :- ::columns]
  (t2/select (selected :model/FieldValues columns) :field_id [:in [:auto/param (vec field-ids)]]))

(mu/defn dimensions-by-field-ids :- [:sequential ::row]
  "The Dimensions of the Fields with `field-ids`, with only `columns` unless nil."
  [field-ids :- [:sequential {:min 1} :int]
   columns   :- ::columns]
  (t2/select (selected :model/Dimension columns) :field_id [:in [:auto/param (vec field-ids)]]))

(mu/defn field-user-settings-by-field-ids :- [:sequential ::row]
  "The FieldUserSettings of the Fields with `field-ids`, with only `columns` unless nil."
  [field-ids :- [:sequential {:min 1} :int]
   columns   :- ::columns]
  (t2/select (selected :model/FieldUserSettings columns) :field_id [:in [:auto/param (vec field-ids)]]))

(mu/defn table-user-settings-by-table-ids :- [:sequential ::row]
  "The TableUserSettings of the Tables with `table-ids`, with only `columns` unless nil."
  [table-ids :- [:sequential {:min 1} :int]
   columns   :- ::columns]
  (t2/select (selected :model/TableUserSettings columns) :table_id [:in [:auto/param (vec table-ids)]]))

(mu/defn dashboard-tabs-by-dashboard-ids :- [:sequential ::row]
  "The DashboardTabs of the Dashboards with `dashboard-ids`, with only `columns` unless nil."
  [dashboard-ids :- [:sequential {:min 1} :int]
   columns       :- ::columns]
  (t2/select (selected :model/DashboardTab columns) :dashboard_id [:in [:auto/param (vec dashboard-ids)]]))

(mu/defn dashboard-cards-by-dashboard-ids :- [:sequential ::row]
  "The DashboardCards of the Dashboards with `dashboard-ids`, with only `columns` unless nil."
  [dashboard-ids :- [:sequential {:min 1} :int]
   columns       :- ::columns]
  (t2/select (selected :model/DashboardCard columns) :dashboard_id [:in [:auto/param (vec dashboard-ids)]]))

(mu/defn dashboard-card-series-by-dashboard-card-ids :- [:sequential ::row]
  "The DashboardCardSeries of the DashboardCards with `dashboard-card-ids`, with only `columns` unless nil."
  [dashboard-card-ids :- [:sequential {:min 1} :int]
   columns            :- ::columns]
  (t2/select (selected :model/DashboardCardSeries columns)
             :dashboardcard_id [:in [:auto/param (vec dashboard-card-ids)]]))

(mu/defn timeline-events-by-timeline-ids :- [:sequential ::row]
  "The TimelineEvents of the Timelines with `timeline-ids`, with only `columns` unless nil."
  [timeline-ids :- [:sequential {:min 1} :int]
   columns      :- ::columns]
  (t2/select (selected :model/TimelineEvent columns) :timeline_id [:in [:auto/param (vec timeline-ids)]]))

(mu/defn metabot-prompts-by-metabot-ids :- [:sequential ::row]
  "The MetabotPrompts of the Metabots with `metabot-ids`, with only `columns` unless nil."
  [metabot-ids :- [:sequential {:min 1} :int]
   columns     :- ::columns]
  (t2/select (selected :model/MetabotPrompt columns) :metabot_id [:in [:auto/param (vec metabot-ids)]]))

(mu/defn transform-job-tags-by-job-ids :- [:sequential ::row]
  "The TransformJobTransformTags of the TransformJobs with `job-ids`, with only `columns` unless nil."
  [job-ids :- [:sequential {:min 1} :int]
   columns :- ::columns]
  (t2/select (selected :model/TransformJobTransformTag columns) :job_id [:in [:auto/param (vec job-ids)]]))

(mu/defn transform-tags-by-transform-ids :- [:sequential ::row]
  "The TransformTransformTags of the Transforms with `transform-ids`, with only `columns` unless nil."
  [transform-ids :- [:sequential {:min 1} :int]
   columns       :- ::columns]
  (t2/select (selected :model/TransformTransformTag columns) :transform_id [:in [:auto/param (vec transform-ids)]]))

(mu/defn table-indexes-by-transform-ids :- [:sequential ::row]
  "The TableIndexes of the Transforms with `transform-ids`, with only `columns` unless nil."
  [transform-ids :- [:sequential {:min 1} :int]
   columns       :- ::columns]
  (t2/select (selected :model/TableIndex columns) :transform_id [:in [:auto/param (vec transform-ids)]]))

(mu/defn query-actions-by-action-ids :- [:sequential ::row]
  "The QueryActions of the Actions with `action-ids`, with only `columns` unless nil."
  [action-ids :- [:sequential {:min 1} :int]
   columns    :- ::columns]
  (t2/select (selected :model/QueryAction columns) :action_id [:in [:auto/param (vec action-ids)]]))

(mu/defn implicit-actions-by-action-ids :- [:sequential ::row]
  "The ImplicitActions of the Actions with `action-ids`, with only `columns` unless nil."
  [action-ids :- [:sequential {:min 1} :int]
   columns    :- ::columns]
  (t2/select (selected :model/ImplicitAction columns) :action_id [:in [:auto/param (vec action-ids)]]))

(mu/defn osi-ai-contexts-by-local-ids :- [:sequential ::row]
  "The OsiAiContexts, with only `columns` unless nil, of the entities of type `entity-type` with `local-ids`."
  [entity-type :- :string
   local-ids   :- [:sequential {:min 1} :int]
   columns     :- ::columns]
  (t2/select (selected :model/OsiAiContext columns)
             :entity_type     [:auto/param entity-type]
             :entity_local_id [:in [:auto/param (vec local-ids)]]))

(mu/defn insert-rows! :- [:sequential ::row]
  "Insert `rows` of `model`, running its hooks, and return the inserted instances."
  [model :- :keyword
   rows  :- [:sequential ::row]]
  (t2/insert-returning-instances! model rows))

(mu/defn update-row!
  "Update the `model` row whose primary key `pk` is `id` with `changes`, running the model's hooks."
  [model   :- :keyword
   pk      :- :keyword
   id      :- [:or :int :string]
   changes :- ::row]
  (t2/update! model pk [:auto/param id] changes))

(mu/defn delete-rows!
  "Delete the `model` rows whose primary key `pk` is one of `ids`, running the model's hooks."
  [model :- :keyword
   pk    :- :keyword
   ids   :- [:sequential [:or :int :string]]]
  (t2/delete! model pk [:in [:auto/param ids]]))

(defn do-in-transaction
  "Calls `thunk` in a transaction of the app DB, or in a savepoint of the one already open."
  [thunk]
  (t2/with-transaction [_]
    (thunk)))

(defn do-in-repeatable-read-transaction
  "Calls `thunk` in a REPEATABLE READ transaction of the app DB, or in the transaction already open, whose isolation
  can't change without committing."
  [thunk]
  (t2/with-connection [^java.sql.Connection conn]
    (if-not (.getAutoCommit conn)
      (thunk)
      (let [isolation (.getTransactionIsolation conn)]
        (.setTransactionIsolation conn java.sql.Connection/TRANSACTION_REPEATABLE_READ)
        (try
          (t2/with-transaction [_ conn]
            (thunk))
          (finally
            (.setTransactionIsolation conn isolation)))))))
