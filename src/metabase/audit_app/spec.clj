(ns metabase.audit-app.spec
  "The audit spec of a model, and what it says about the model.

  A model that has a spec is audited: the writes that a user makes to its rows record rows in the Audit Log. A spec is
  a map of:

  - `:track`, the columns whose values the row of a write stores in its details, an update storing the previous and
    the new value of those that it changed. It may name `:id`, which no other key lists.
  - `:track-redacted`, the columns whose change records a row that does not store the value.
  - `:skip`, the columns whose change alone records nothing: usage stats that reads update, and what Metabase works
    out for its own use.

  Together they list every column of the table but `:id`, `:created_at` and `:updated_at`, which no spec lists. All
  the other keys are optional:

  - `:changes?`, false for a model whose update stores the details of the new row rather than the changes, true by
    default.
  - `:details`, a fn of a row and the lifecycle event returning the details to store beside the tracked columns, which
    it overrides, for what the columns alone do not say.
  - `:same?`, a map from a column to a fn of the row before and the row after, true when the column is unchanged, `=`
    of the two values by default.
  - `:topics`, a map from an operation (`:create`, `:update`, `:delete`) to the topic to store for it, a keyword or a
    fn of the event returning one or nil to record nothing, where the topic differs from the name of the event that the
    model publishes. An operation that the map leaves out records nothing; without the key each operation is stored
    under the name of its event.
  - `:parent {:model parent-model :key column}`: a write of a row of this model is a write of the row of `parent-model`
    whose id its `column` holds, a parent that has a `:parent` of its own passing it on up, all the writes of a batch
    to one such row being one update of the topmost parent. With a `:topics` map from an operation to the stored topic
    and a `:details` fn of the id of the parent and the vector of the events, a write is instead recorded under the
    parent with that topic, once per topic and parent for a batch, none for a parent that the batch creates.
  - `:moments`, a vector of `{:topic topic :when f}` and optionally `:details`, each a row that an update or a create
    records beside its own when the fn of the event is true, with the details that the fn of the event returns, none by
    default.
  - `:subject`, a fn of the event returning the `[model id]` under which its row is recorded, the model and the id of
    its row by default.
  - `:context-details?`, true for a model whose rows take the `:details` that the context of the write carries."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def ^:private Operation
  [:enum :create :update :delete])

(def Spec
  "The schema of an audit spec."
  [:map {:closed true}
   [:track           [:sequential :keyword]]
   [:track-redacted  [:sequential :keyword]]
   [:skip            [:sequential :keyword]]
   [:changes?        {:optional true} :boolean]
   [:details         {:optional true} fn?]
   [:same?           {:optional true} [:map-of :keyword fn?]]
   [:topics          {:optional true} [:map-of Operation [:or :keyword fn?]]]
   [:parent          {:optional true} [:map {:closed true}
                                       [:model   :keyword]
                                       [:key     :keyword]
                                       [:topics  {:optional true} [:map-of Operation :keyword]]
                                       [:details {:optional true} fn?]]]
   [:moments         {:optional true} [:sequential [:map {:closed true}
                                                    [:topic   :keyword]
                                                    [:when    fn?]
                                                    [:details {:optional true} fn?]]]]
   [:subject         {:optional true} fn?]
   [:context-details? {:optional true} :boolean]])

(defmulti spec
  "The audit spec of `model`, or nil when the Audit Log records no writes of the model."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))

(def implicit-columns
  "The columns that no spec lists: the key, which never changes, and the timestamps that every write sets."
  #{:id :created_at :updated_at})

(defn audited-models
  "The audited models that have loaded."
  []
  (disj (set (keys (methods spec))) :default))

(defn parent
  "The `:parent` of `model`, nil for a model whose writes are recorded as its own."
  [model]
  (:parent (spec model)))

(defn skipped-columns
  "The columns of `model` whose change alone records nothing."
  [model]
  (conj (set (:skip (spec model))) :updated_at))

(defn same?
  "Whether the `column` of `model` is the same in the row `before` and the row `after`."
  [model column before after]
  (if-let [f (get (:same? (spec model)) column)]
    (boolean (f before after))
    (= (get before column) (get after column))))
