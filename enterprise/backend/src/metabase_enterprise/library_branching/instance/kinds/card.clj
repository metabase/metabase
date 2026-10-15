(ns metabase-enterprise.library-branching.instance.kinds.card
  "The app DB side of the card kinds (`:metric`, `:question`, `:model`), in the item forms of `format.kinds.card`. The
  attribute `:query` is the portable form of `dataset_query`; the other attributes are the card columns of the same
  names, in the portable form of the serdes export of Card. Not content: the public link and the embedding settings
  (instance-local), `card_schema`, `query_type`, `table_id` and `database_id` (derived), the result metadata of a card
  that is not a model (derived), and the bookkeeping columns.

  The type of a card is its kind. A question can become a model and a model a question: a write of either kind to the
  card of the other changes the type through the Card save path, so its cascades run. A metric keeps its kind."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.metric :as format.metric]
   [metabase-enterprise.library-branching.format.kinds.model :as format.model]
   [metabase-enterprise.library-branching.format.kinds.question :as format.question]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.instance.values-source :as values-source]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes]
   [metabase.queries.core :as queries]))

(set! *warn-on-reflection* true)

(def specs
  "`{kind format-spec}` of the card kinds."
  {:metric   format.metric/spec
   :model    format.model/spec
   :question format.question/spec})

(defn kind-of
  "The card kind of the card row `card`, from its type, or nil for a type of no kind."
  [card]
  (let [kind (some-> (:type card) name keyword)]
    (when (contains? specs kind) kind)))

(def ^:private convertible
  "The card kinds whose cards can change from one of them to another."
  #{:model :question})

(defn- column
  "The card column of attribute `k`."
  [k]
  (if (= :query k) :dataset_query k))

(defn- transforms []
  (:transform (serdes/make-spec "Card" {})))

(defn export-fns
  "`{attribute export-fn}`: for each attribute of the card kinds whose card column the serdes spec of Card exports with
  a transform, that export, as a function of the card and the column value."
  []
  (let [ts (transforms)]
    (into {}
          (keep (fn [k]
                  (let [{:keys [export export-with-context]} (get ts (column k))]
                    (cond
                      export-with-context [k (fn [card v] (export-with-context card (column k) v))]
                      export              [k (fn [_card v] (export v))]))))
          (into #{} (mapcat (comp keys :attrs)) (vals specs)))))

(defn- without-nil-settings
  "Visualization settings without a top-level key whose value is nil; the export adds `:column_settings nil`."
  [settings]
  (into {} (remove (comp nil? val)) settings))

(defn attrs
  "The attributes of `card` of the card kind `kind`, with none at its default. `exports` is [[export-fns]]."
  [kind exports card]
  (let [spec (get specs kind)]
    (->> (keys (:attrs spec))
         (map (fn [k]
                (let [v (get card (column k))
                      f (get exports k)
                      x (if f (f card v) v)]
                  [k (when-not (= ::serdes/skip x) x)])))
         (into {})
         (#(update % :visualization_settings without-nil-settings))
         portable/document
         (content/attrs spec))))

(defn- portable-content
  [exports card]
  {:place (serdes/*export-fk* (:collection_id card) :model/Collection)
   :attrs (attrs (kind-of card) exports card)})

(def ^:private card-columns
  "The card columns that a read selects: the content columns, and the columns that the Card model needs to upgrade an
  old card schema on select."
  (into [:id :entity_id :name :type :collection_id :card_schema :database_id :result_metadata]
        (comp (mapcat (comp keys :attrs)) (map column))
        (vals specs)))

(defn read-cards
  "`{entity-id item}` of the cards of `entity-ids` that are of a card kind, each an item of the kind of its type."
  [entity-ids]
  (let [cards    (filterv kind-of (content/in-chunks (partial library-branching.db/cards-by-entity-id
                                                              (vec (distinct card-columns)))
                                                     (vec entity-ids)))
        contents (portable/export-batch (partial portable-content (export-fns)) cards)]
    (into {}
          (map (fn [{:keys [entity_id name] :as card} {:keys [place attrs]}]
                 [entity_id (content/item (kind-of card) entity_id name place attrs)])
               cards
               contents))))

(defn import-fns
  "`{attribute import-fn}`: for each attribute of the card kinds whose card column the serdes spec of Card imports
  with a transform, that import, the inverse of its entry in [[export-fns]]."
  []
  (let [ts (transforms)]
    (into {}
          (keep (fn [k] (when-let [f (get-in ts [(column k) :import])] [k f])))
          (into #{} (mapcat (comp keys :attrs)) (vals specs)))))

(defn current-card
  "The state of card `id` (`instance/current`) for the card kind `kind`, after a lock on its row. A card of a kind of
  one row with `kind` (`snapshot/same-row?`) is the item; its content has the kind of the card's type."
  [kind id]
  (let [row      (library-branching.db/lock-card id)
        row-kind (kind-of row)]
    (content/current-state (boolean (and row-kind
                                         (snapshot/same-row? kind row-kind)
                                         (tree/collection-id-in-tree? (:collection_id row))))
                           #(scope/in-scope? row-kind id)
                           #(get (read-cards [id]) id))))

(defn- columns
  "The card columns of the attributes `ks` of `attrs` of the kind `kind`, an absent one at its default, through the
  imports `imports`."
  [kind imports attrs ks]
  (into {}
        (map (fn [k]
               (let [v (content/attr-value (get specs kind) attrs k)]
                 [(column k) (if (some? v) ((get imports k identity) v) v)])))
        ks))

(defn- check-kind!
  "Throws ::instance/refused unless a write of the kind `kind` may take over the card row `row`: it is of that kind, or
  both kinds can change into each other."
  [kind id row]
  (let [row-kind (kind-of row)]
    (when-not (or (= kind row-kind) (and (convertible kind) (convertible row-kind)))
      (instance/refuse! :other-kind id "A card of another kind has this identity."))))

(defn- with-model-metadata
  "`changes` of a card of the kind `kind` with the query `query`: a model's result metadata of the content holds the
  columns as a person edits them, and the card stores them merged onto the columns of the query, as a load of serdes
  does; the edited columns alone when the query has no columns on this instance (its warehouse is not synced yet)."
  [kind query changes]
  (if (and (= :model kind) (seq (:result_metadata changes)))
    (update changes :result_metadata
            (fn [edited]
              (or (not-empty (queries/infer-metadata-with-model-overrides query {:type :model :result_metadata edited}))
                  edited)))
    changes))

(defn write-card!
  "Makes the content of card `id` of the card kind `kind` equal to `item`, by the contract of `instance/write!`."
  [kind id {:keys [name place attrs] :as item}]
  (content/check-item! kind id item)
  (let [spec    (get specs kind)
        row     (library-branching.db/lock-card id)
        _       (when row
                  (tree/check-in-tree! id (tree/collection-id-in-tree? (:collection_id row)))
                  (check-kind! kind id row))
        _       (when (nil? place)
                  (instance/refuse! :place id (str "A " (clojure.core/name kind) " is in a collection of the Library.")))
        parent  (tree/place-collection id place)
        imports (import-fns)
        query   ((get imports :query identity) (content/attr-value spec attrs :query))]
    (if-not row
      (library-branching.db/insert-card!
       (with-model-metadata kind query
         (merge {:entity_id     id
                 :name          name
                 :type          kind
                 :collection_id (:id parent)
                 :creator_id    (or api/*current-user-id* config/internal-mb-user-id)}
                (columns kind imports attrs (keys (:attrs spec))))))
      (let [old     (get (read-cards [id]) id)
            changes (cond-> (columns kind imports attrs (content/changed-attrs spec (:attrs old) attrs))
                      (not= kind (:kind old))                  (assoc :type kind)
                      (not= name (:name old))                  (assoc :name name)
                      (not= (:id parent) (:collection_id row)) (assoc :collection_id (:id parent))
                      (:archived row)                          (assoc :archived false :archived_directly false))]
        (when (seq changes)
          (library-branching.db/update-card! (:id row) (with-model-metadata kind query changes)))))
    nil))

(defn trash-card!
  "Moves card `id` to the trash."
  [id]
  (when-let [row (library-branching.db/lock-card id)]
    (tree/check-in-tree! id (tree/collection-id-in-tree? (:collection_id row)))
    (when-not (:archived row)
      (values-source/do-keeping-outside-values-sources
       (library-branching.db/values-source-users-of-card (:id row))
       (fn [] (library-branching.db/update-card! (:id row) {:archived true :archived_directly true}))))
    nil))

(def ^:private models-of-read
  "The models whose tables a read of cards reads: the cards and their collections, the dashboards and documents that
  hold them, and the tables, fields, databases, cards, segments and measures that a query refers to."
  #{:model/Card :model/Collection :model/Dashboard :model/Database :model/Document :model/Field :model/Measure
    :model/Segment :model/Table})

(defn kind-store
  "The `KindStore` of the card kind `kind`."
  [kind]
  (reify instance/KindStore
    (read-all [_ ids] (read-cards ids))
    (read-models [_] models-of-read)
    (current [_ id] (current-card kind id))
    (write! [_ id item] (content/do-in-write-transaction id #(write-card! kind id item)))
    (trash! [_ id] (content/do-in-write-transaction id #(trash-card! id)))))
