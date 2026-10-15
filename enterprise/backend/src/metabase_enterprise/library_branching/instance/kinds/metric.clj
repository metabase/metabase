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
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
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

(defn import-fns
  "`{attribute import-fn}`: for each attribute of the metric format whose card column the serdes spec of Card imports
  with a transform, that import, the inverse of its entry in [[export-fns]]."
  []
  (let [transforms (:transform (serdes/make-spec "Card" {}))]
    (into {}
          (keep (fn [k] (when-let [f (get-in transforms [(column k) :import])] [k f])))
          (keys (:attrs format.metric/spec)))))

(defn current-metric
  "The content of the in-scope metric `id`, after a lock on its row, or nil."
  [id]
  (library-branching.db/lock-card id)
  (when (scope/in-scope? :metric id)
    (get (read-metrics [id]) id)))

(defn- columns
  "The card columns of the attributes `ks` of `attrs`, an absent one at its default, through the imports `imports`."
  [imports attrs ks]
  (into {}
        (map (fn [k]
               (let [v (content/attr-value format.metric/spec attrs k)]
                 [(column k) (if (some? v) ((get imports k identity) v) v)])))
        ks))

(defn write-metric!
  "Makes the content of metric `id` equal to `item`, by the contract of `instance/write!`."
  [id {:keys [name place attrs] :as item}]
  (content/check-item! :metric id item)
  (let [row     (library-branching.db/lock-card id)
        _       (when row
                  (tree/check-in-tree! id (tree/collection-id-in-tree? (:collection_id row)))
                  (when-not (= "metric" (some-> (:type row) clojure.core/name))
                    (instance/refuse! :other-kind id "A card of another kind has this identity.")))
        _       (when (nil? place)
                  (instance/refuse! :place id "A metric is in a collection of the Library."))
        parent  (tree/place-collection id place)
        imports (import-fns)]
    (if-not row
      (library-branching.db/insert-card!
       (merge {:entity_id     id
               :name          name
               :type          :metric
               :collection_id (:id parent)
               :creator_id    (or api/*current-user-id* config/internal-mb-user-id)}
              (columns imports attrs (keys (:attrs format.metric/spec)))))
      (let [old     (get (read-metrics [id]) id)
            changes (cond-> (columns imports attrs (content/changed-attrs format.metric/spec (:attrs old) attrs))
                      (not= name (:name old))                    (assoc :name name)
                      (not= (:id parent) (:collection_id row))   (assoc :collection_id (:id parent))
                      (:archived row)                            (assoc :archived false :archived_directly false))]
        (when (seq changes)
          (library-branching.db/update-card! (:id row) changes))))
    nil))

(defn trash-metric!
  "Moves metric `id` to the trash."
  [id]
  (when-let [row (library-branching.db/lock-card id)]
    (tree/check-in-tree! id (tree/collection-id-in-tree? (:collection_id row)))
    (when-not (:archived row)
      (library-branching.db/update-card! (:id row) {:archived true :archived_directly true}))
    nil))

(def kind-store
  "The `KindStore` of metrics."
  (reify instance/KindStore
    (read-all [_ ids] (read-metrics ids))
    (current [_ id] (current-metric id))
    (write! [_ id item] (library-branching.db/do-in-transaction #(write-metric! id item)))
    (trash! [_ id] (library-branching.db/do-in-transaction #(trash-metric! id)))))
