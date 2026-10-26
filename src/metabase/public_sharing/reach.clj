(ns metabase.public-sharing.reach
  "Anonymous reach: every way an anonymous user can get data from a warehouse database.

  Today anonymous users open entities through two surfaces, public links and published guest embeds. An entity open
  through either is anonymously reachable, and it reaches a database when anything it renders runs a query there.
  Turning off anonymous access to a database stops every entity that reaches it from returning that data.

  [[anonymously-reachable-entities]] is the whole of it from outside. [[rendered-card-ids]] is the step each content
  module implements."
  (:require
   [metabase.embedding.settings :as embedding.settings]
   [metabase.embedding.util :as embedding.util]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.public-sharing.db :as public-sharing.db]
   [metabase.public-sharing.settings :as public-sharing.settings]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::surface
  "A way an anonymous user opens an entity: a public link, or a published guest embed."
  [:enum :public-link :guest-embed])

(mr/def ::surfaces
  "The surfaces one entity is open through."
  [:set {:min 1} ::surface])

(mr/def ::id->surfaces
  "The surfaces each entity of one model is open through, by entity id, e.g. `{1 #{:public-link}, 2 #{:public-link
  :guest-embed}}`."
  [:map-of ms/PositiveInt ::surfaces])

(mr/def ::card-ids-by-surface
  "Cards, by the surface through which an anonymous user gets their results, e.g. `{:public-link #{10 11}}`."
  [:map-of ::surface [:set ::lib.schema.id/card]])

(mr/def ::shown
  "The Cards whose results an entity shows directly, such as the question on a dashboard card."
  ::card-ids-by-surface)

(mr/def ::shown-indirectly
  "The Cards an entity uses without showing their results as its own, such as a question filling the value list of a
  dashboard filter. A surface can expose fewer of them than another: a guest embed only fills the value lists of the
  filters its publisher enabled."
  ::card-ids-by-surface)

(mr/def ::rendered
  "What one entity renders, through each surface it is open through, e.g.
  `{:shown {:public-link #{10 11}}, :shown-indirectly {:public-link #{12}}}`."
  [:map {:closed true}
   [:shown            ::shown]
   [:shown-indirectly ::shown-indirectly]])

(mr/def ::id->rendered
  "What each entity of one model renders, by entity id."
  [:map-of ms/PositiveInt ::rendered])

(mr/def ::published
  "The first step of anonymous reach: the entities an anonymous user can open, by model, each with the surfaces it is
  open through. It says nothing about what an entity runs; [[rendered-card-ids]] works that out from it."
  [:map {:closed true}
   [:model/Card      ::id->surfaces]
   [:model/Dashboard ::id->surfaces]
   [:model/Document  ::id->surfaces]])

(mr/def ::rendered-by-model
  "The second step of anonymous reach: for the entities in a `::published`, the Cards each one renders, by model,
  leaving out a model none of whose entities renders anything. Keeping the Cards that run against one database turns
  it into that database's anonymous reach."
  [:map {:closed true}
   [:model/Card      {:optional true} ::id->rendered]
   [:model/Dashboard {:optional true} ::id->rendered]
   [:model/Document  {:optional true} ::id->rendered]])

(defmulti rendered-card-ids
  "The Cards each entity of `model` in `id->surfaces`, an `::id->surfaces`, renders, directly or indirectly, as an
  `::id->rendered`."
  {:arglists '([model id->surfaces])}
  (fn [model _id->surfaces] model))

(defn card-ids-by
  "Regroup `rows` into `{owner-id #{card-id}}`, dropping rows that reach no Card."
  [row->owner-id row->card-id rows]
  (reduce (fn [acc row]
            (if-let [card-id (row->card-id row)]
              (update acc (row->owner-id row) (fnil conj #{}) card-id)
              acc))
          {}
          rows))

(mu/defn rendered-cards :- ::id->rendered
  "Build one content model's [[rendered-card-ids]] answer for the entities in `id->surfaces` from two maps keyed by
  entity id: `shown`, the Cards each entity shows directly, and `shown-indirectly`, the Cards each entity uses by
  surface without showing them, e.g. to fill a filter's value list. An entity shows the same Cards directly through
  every surface it is open through. An entity in only one of the maps gets an empty map for the other:

    (rendered-cards {1 #{:public-link}, 2 #{:public-link}} {1 #{10}} {2 {:public-link #{12}}})
    ;; => {1 {:shown {:public-link #{10}}, :shown-indirectly {}}
    ;;     2 {:shown {},                   :shown-indirectly {:public-link #{12}}}}"
  [id->surfaces     :- ::id->surfaces
   shown            :- [:map-of ms/PositiveInt [:set ::lib.schema.id/card]]
   shown-indirectly :- [:map-of ms/PositiveInt ::shown-indirectly]]
  (into {}
        (map (fn [id] [id {:shown            (if-let [card-ids (not-empty (get shown id))]
                                               (into {} (map (fn [surface] [surface card-ids])) (get id->surfaces id))
                                               {})
                           :shown-indirectly (get shown-indirectly id {})}]))
        (into (set (keys shown)) (keys shown-indirectly))))

(defn- parameters-publicly-exposed-via-surface
  "The filters among `parameters`, an entity's filter definitions, whose value list an anonymous user can fetch through
  `surface`: all of them through a public link, and through a guest embed only those its publisher enabled in
  `embedding-params`."
  [surface embedding-params parameters]
  (if (= surface :public-link)
    parameters
    (embedding.util/enabled-params parameters embedding-params)))

(defn value-list-card-ids-by-surface
  "The Cards each of `surfaces` lets an anonymous user draw a filter's value list from, as a `::shown-indirectly`."
  [surfaces embedding-params parameters source-card-ids]
  (into {}
        (keep (fn [surface]
                (when-let [card-ids (not-empty (source-card-ids
                                                (parameters-publicly-exposed-via-surface
                                                 surface embedding-params parameters)))]
                  [surface card-ids])))
        surfaces))

(def ^:private id-chunk-size
  "How many ids the anonymous-reach query puts into one `IN` clause."
  1000)

(defn- by-surface
  "Fold `ids` into `id->surfaces` under `surface`, keeping any surface an id already has."
  [id->surfaces surface ids]
  (reduce (fn [acc id] (update acc id (fnil conj #{}) surface)) id->surfaces ids))

(mu/defn- published-entities :- ::published
  "The entities an anonymous user can open right now. A surface disabled site-wide opens
  nothing."
  []
  ;; Actions are left out: routers refuse actions, except on databases configured before that guard existed, a known
  ;; gap.
  (let [public-link? (public-sharing.settings/enable-public-sharing)
        guest-embed? (embedding.settings/enable-embedding-modular)]
    {:model/Card      (cond-> {}
                        public-link? (by-surface :public-link (public-sharing.db/publicly-shared-card-ids))
                        guest-embed? (by-surface :guest-embed (public-sharing.db/guest-embedded-card-ids)))
     :model/Dashboard (cond-> {}
                        public-link? (by-surface :public-link (public-sharing.db/publicly-shared-dashboard-ids))
                        guest-embed? (by-surface :guest-embed (public-sharing.db/guest-embedded-dashboard-ids)))
     ;; a Document carries no embeddable flag, so a public link is the only way an anonymous user opens one
     :model/Document  (cond-> {}
                        public-link? (by-surface :public-link (public-sharing.db/publicly-shared-document-ids)))}))

(mu/defn- anonymously-rendered-card-ids :- ::rendered-by-model
  "What each entity in `published` renders, by [[rendered-card-ids]]."
  [published :- ::published]
  (into {}
        (keep (fn [[model id->surfaces]]
                (let [by-id (into {}
                                  (mapcat #(rendered-card-ids model (into {} %)))
                                  (partition-all id-chunk-size id->surfaces))]
                  (when (seq by-id)
                    [model by-id]))))
        published))

(defn- card-ids-of
  "Every Card id in one entity's [[rendered-card-ids]] answer, of either sort and over every surface."
  [{:keys [shown shown-indirectly]}]
  (into #{} (comp cat cat) [(vals shown) (vals shown-indirectly)]))

(defn- card-ids-in
  "Every Card id in `rendered`, over every model and entity."
  [rendered]
  (into #{} (comp (mapcat vals) (mapcat card-ids-of)) (vals rendered)))

(defn- card-database-ids
  "The Database each unarchived Card among `card-ids` is saved against, as `{card-id database-id}`."
  [card-ids]
  (into {}
        (mapcat public-sharing.db/unarchived-card-database-ids)
        (partition-all id-chunk-size card-ids)))

(defn- names-of
  "Rows carrying the `:id` and `:name` of each entity of `model` among `ids`, and for a Card the `:type` its model
  name comes from."
  [model ids]
  (case model
    :model/Card      (public-sharing.db/card-names-and-types ids)
    :model/Dashboard (public-sharing.db/dashboard-names ids)
    :model/Document  (public-sharing.db/document-names ids)))

(defn- entity-names
  "`{model {id row}}` for `model->ids`, each row [[names-of]]'s, so a Card's still carries its `:type`."
  [model->ids]
  (into {}
        (map (fn [[model ids]]
               [model (u/index-by :id (mapcat #(names-of model %) (partition-all id-chunk-size ids)))]))
        model->ids))

(defn- model-name
  "The model name of a row: the vocabulary search, collection items and serialization already use, so that a client
  can route on it. A Card is a question, a model or a metric."
  [model card-type]
  (case model
    :model/Card      (case card-type
                       :question "card"
                       :model    "dataset"
                       :metric   "metric")
    :model/Dashboard "dashboard"
    :model/Document  "document"))

(mr/def ::anonymously-reachable-entity
  [:map {:closed true}
   [:id ms/PositiveInt]
   [:model [:enum "card" "dataset" "metric" "dashboard" "document"]]
   [:name :string]
   [:surfaces ::surfaces]
   [:indirect? :boolean]])

(defn- named-rows
  "`reachable` as [[anonymously-reachable-entities]] returns it, in name order, without entities that no longer exist."
  [reachable]
  (let [names (entity-names (update-vals (group-by :model reachable) #(mapv :id %)))]
    (->> reachable
         (keep (fn [{:keys [model id surfaces indirect?]}]
                 (when-let [{entity-name :name, card-type :type} (get-in names [model id])]
                   {:id        id
                    :model     (model-name model card-type)
                    :name      entity-name
                    :surfaces  surfaces
                    :indirect? indirect?})))
         (sort-by (juxt #(u/lower-case-en (:name %)) :model :id))
         vec)))

(mu/defn anonymously-reachable-entities :- [:sequential ::anonymously-reachable-entity]
  "Every anonymously reachable entity that reaches the Database with `database-id`, by name. `:surfaces` names the
  surfaces it is open through that reach the database, and `:indirect?` means it reaches the database only through a
  filter's value list."
  [database-id :- ::lib.schema.id/database]
  (let [published (published-entities)
        rendered  (anonymously-rendered-card-ids published)
        card->db  (card-database-ids (card-ids-in rendered))
        on-db?    (fn [card-id] (= database-id (get card->db card-id)))]
    (named-rows
     (for [[model id->rendered]                  rendered
           [id {:keys [shown shown-indirectly]}] id->rendered
           :let  [shows-directly? (fn [surface] (boolean (some on-db? (get shown surface))))
                  surfaces        (into #{}
                                        (filter #(or (shows-directly? %) (some on-db? (get shown-indirectly %))))
                                        (get-in published [model id]))]
           :when (seq surfaces)]
       {:model model, :id id, :surfaces surfaces, :indirect? (not-any? shows-directly? surfaces)}))))
