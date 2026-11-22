(ns metabase.models.db
  "Application database queries for the models module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (the model machinery still uses
  `toucan2.core`)."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.identity-query :as t2.identity-query]))

(mu/defn entity-by-pk
  "The `model` row whose `pk-column` is `id`, or nil."
  [model     :- [:or :keyword symbol?]
   pk-column :- :keyword
   id        :- [:or :int :string]]
  (t2/select-one model pk-column id))

(def ^:private model-row-schema
  "The literal registry keyword of the row/update schema of each model of the Notification update spec, the only caller
  of the generic entity helpers below (a literal keyword, not a `require`, to avoid a dependency cycle with the module
  that owns these models)."
  {:model/ChannelTemplate          :metabase.channel.schema/channel-template.update
   :model/Notification             :metabase.notification.schema/notification.update
   :model/NotificationCard         :metabase.notification.schema/notification-card.update
   :model/NotificationHandler      :metabase.notification.schema/notification-handler.update
   :model/NotificationRecipient    :metabase.notification.schema/notification-recipient.update
   :model/NotificationSubscription :metabase.notification.schema/notification-subscription.update})

(defn- model-schema-key [prefix model]
  (keyword "metabase.models.db" (str prefix "." (name model))))

(doseq [[model schema] model-row-schema]
  (mr/register! (model-schema-key "model-row" model)
                [:map {:closed true} [:model [:= model]] [:row schema]])
  (mr/register! (model-schema-key "model-rows" model)
                [:map {:closed true} [:model [:= model]] [:rows [:sequential schema]]]))

(mr/def ::unregistered-model-row
  "A row of a model not listed in [[model-row-schema]], such as the test-double models `metabase.models.util.spec-update`
  specs are tested with; its keys are that model's."
  [:map {:closed false, :description "row of an unregistered model"}])

(mr/def ::model-row
  "A `{:model ..., :row ...}` pair naming one of the models the generic entity helpers below are called with, the
  row typed by that model's own update schema."
  (conj (into [:multi {:dispatch :model, :lazy-refs true}]
              (for [model (keys model-row-schema)]
                [model (model-schema-key "model-row" model)]))
        [::mc/default [:map {:closed true} [:model :keyword] [:row ::unregistered-model-row]]]))

(mr/def ::model-rows
  "Like `::model-row`, but for a batch of rows of the same model."
  (conj (into [:multi {:dispatch :model, :lazy-refs true}]
              (for [model (keys model-row-schema)]
                [model (model-schema-key "model-rows" model)]))
        [::mc/default [:map {:closed true} [:model :keyword] [:rows [:sequential ::unregistered-model-row]]]]))

(mr/def ::after-select-row
  "A row not yet run through its model's after-select, e.g. a stored revision snapshot whose keys older Metabase versions own."
  [:map {:closed false, :description "shape depends on the model, hydration state, and revision history"}])

(def ^:private AfterSelectEntity
  "A `{:model ..., :row ...}` pair naming any model (including test-only ones derived from `:metabase/model`, and
  ones outside [[model-row-schema]]) and a row of arbitrary shape to run through its after-select machinery."
  [:map {:closed true}
   [:model [:or :keyword symbol?]]
   [:row ::after-select-row]])

(mu/defn after-select-via-identity-query
  "`entity`'s `:row` run through the after-select machinery of `entity`'s `:model`."
  [entity :- AfterSelectEntity]
  (t2/select-one (:model entity) (t2.identity-query/identity-query [(:row entity)])))

(mu/defn database-name
  "The name of the Database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one-fn :name [:model/Database :id :name] :id database-id))

(mu/defn timeline-ids-of-events
  "The distinct Timeline ids of the TimelineEvents with `event-ids`."
  [event-ids :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :timeline_id [:model/TimelineEvent :timeline_id] :id [:in event-ids]))

(mu/defn update-entity!
  "Apply `entity`'s `:row` (a column diff) to `entity`'s `:model` row with `id`, returning the number updated."
  [id     :- [:or :int :string]
   entity :- ::model-row]
  ;; `entity`'s model is any model, so match on its own primary key, which may not be `:id`.
  (t2/update! (:model entity) :toucan/pk id (:row entity)))

(mu/defn insert-entity-returning-pk!
  "Insert `entity`'s `:row` into `entity`'s `:model` and return its primary key."
  [entity :- ::model-row]
  (t2/insert-returning-pk! (:model entity) (:row entity)))

(mu/defn insert-entities-returning-instances!
  "Insert `entities`'s `:rows` into `entities`'s `:model`, returning the inserted instances in the order of the rows."
  [entities :- ::model-rows]
  (t2/insert-returning-instances! (:model entities) (:rows entities)))

(mu/defn insert-entities!
  "Insert `entities`'s `:rows` into `entities`'s `:model`, returning the number inserted."
  [entities :- ::model-rows]
  (t2/insert! (:model entities) (:rows entities)))

(mu/defn delete-entities-with-ids!
  "Delete the `model` rows whose `id-column` is one of `ids`, returning the number deleted."
  [model     :- [:or :keyword symbol?]
   id-column :- :keyword
   ids       :- [:sequential [:or :int :string]]]
  (t2/delete! model id-column [:in ids]))

(mu/defn delete-entity!
  "Delete the `model` row with `id`, returning the number deleted."
  [model :- [:or :keyword symbol?]
   id    :- [:maybe [:or :int :string]]]
  ;; `model` is any model, so match on its own primary key, which may not be `:id`.
  (t2/delete! model :toucan/pk id))
