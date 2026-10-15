(ns metabase-enterprise.library-branching.instance.kinds.metric
  "The app DB side of the kind `:metric` (the cards of type metric), in the item form of `format.kinds.metric`. The
  attribute `:query` is the portable form of `dataset_query`; the other attributes are the card columns of the same
  names, in the portable form of the serdes export of Card. Not content: the public link and the embedding settings
  (instance-local), `result_metadata`, `card_schema`, `query_type`, `table_id` and `database_id` (derived), and the
  bookkeeping columns."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.metric :as format.metric]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

(defn- column
  "The card column of attribute `k`."
  [k]
  (if (= :query k) :dataset_query k))

(defn export-fns
  "`{attribute export-fn}`: for each attribute of the metric format whose card column the serdes spec of Card exports
  with a transform, that export."
  []
  (let [transforms (:transform (serdes/make-spec "Card" {}))]
    (into {}
          (keep (fn [k] (when-let [f (get-in transforms [(column k) :export])] [k f])))
          (keys (:attrs format.metric/spec)))))

(defn- without-nil-settings
  "Visualization settings without a top-level key whose value is nil; the export adds `:column_settings nil`."
  [settings]
  (into {} (remove (comp nil? val)) settings))

(defn attrs
  "The attributes of metric `card`, with none at its default. `exports` is [[export-fns]]."
  [exports card]
  (->> (keys (:attrs format.metric/spec))
       (map (fn [k] [k ((get exports k identity) (get card (column k)))]))
       (into {})
       (#(update % :visualization_settings without-nil-settings))
       portable/document
       (content/attrs format.metric/spec)))

(defn- portable-content
  [exports card]
  {:place (serdes/*export-fk* (:collection_id card) :model/Collection)
   :attrs (attrs exports card)})

(def ^:private card-columns
  "The card columns that a read selects: the content columns, and the columns that the Card model needs to upgrade an
  old card schema on select."
  (into [:id :entity_id :name :type :collection_id :card_schema :database_id :result_metadata]
        (map column)
        (keys (:attrs format.metric/spec))))

(defn read-metrics
  "`{entity-id item}` of the metrics of `entity-ids`."
  [entity-ids]
  (let [cards    (content/in-chunks (partial library-branching.db/cards-by-entity-id card-columns) (vec entity-ids))
        contents (portable/export-batch (partial portable-content (export-fns)) cards)]
    (into {}
          (map (fn [{:keys [entity_id name]} {:keys [place attrs]}]
                 [entity_id (content/item :metric entity_id name place attrs)])
               cards
               contents))))

(def kind-store
  "The `KindStore` of metrics."
  (reify instance/KindStore
    (read-all [_ ids] (read-metrics ids))
    (current [_ _id] (instance/not-yet! `instance/current))
    (write! [_ _content] (instance/not-yet! `instance/write!))
    (trash! [_ _id] (instance/not-yet! `instance/trash!))))
