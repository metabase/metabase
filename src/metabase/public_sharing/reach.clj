(ns metabase.public-sharing.reach
  "Anonymous reach: every way an anonymous user can get data from a warehouse database.

  Today anonymous users open entities through two surfaces, public links and published guest embeds. An entity open
  through either is anonymously reachable, and it reaches a database when anything it renders runs a query there.
  Turning off anonymous access to a database stops every entity that reaches it from returning that data.

  [[anonymously-reachable-entities]] is the public API. Each content module answers [[shown-card-ids]], and where it
  has filters, [[value-list-sources]] and [[embedding-params]]."
  (:require
   [metabase.embedding.settings :as embedding.settings]
   [metabase.embedding.util :as embedding.util]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.public-sharing.db :as public-sharing.db]
   [metabase.public-sharing.settings :as public-sharing.settings]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::surface
  "A way an anonymous user could open an entity: a public link, or a published guest embed."
  [:enum :public-link :guest-embed])

(mr/def ::surfaces
  "The surfaces one entity is open through."
  [:set {:min 1} ::surface])

(mr/def ::id->surfaces
  "For some model type (e.g. card, dashboard, document) a map of `id` to the surfaces that it is publicly accessible through."
  [:map-of ms/PositiveInt ::surfaces])

(mr/def ::published
  "The first step of anonymous reach: the entities an anonymous user can open, by model, each with the surfaces it is
  open through. It says nothing about what an entity runs."
  [:map {:closed true}
   [:model/Card      ::id->surfaces]
   [:model/Dashboard ::id->surfaces]
   [:model/Document  ::id->surfaces]])

(mr/def ::id->shown-card-ids
  "The Cards whose results each entity shows directly, such as the question on a dashboard card, by entity id."
  [:map-of ms/PositiveInt [:set ::lib.schema.id/card]])

(mr/def ::value-list-source
  "A parameter whose value list comes from a Card."
  [:map {:closed true}
   [:parameter ::parameters.schema/parameter]
   [:card-id   ::lib.schema.id/card]])

(mr/def ::id->value-list-sources
  "The filters of each entity that fill their value list from a Card, by entity id."
  [:map-of ms/PositiveInt [:sequential ::value-list-source]])

(mr/def ::id->embedding-params
  "Each entity's guest-embed whitelist as stored, by entity id."
  [:map-of ms/PositiveInt [:maybe ms/EmbeddingParams]])

(defmulti shown-card-ids
  "The Cards each entity of `model` among `ids` shows directly, as an `::id->shown-card-ids`. `ids` is one non-empty
  chunk of ids. Every content model implements it."
  {:arglists '([model ids])}
  (fn [model _ids] model))

(defmulti value-list-sources
  "The filters of each entity of `model` among `ids` that fill their value list from a Card, as an
  `::id->value-list-sources`."
  {:arglists '([model ids])}
  (fn [model _ids] model))

(defmethod value-list-sources :default [_model _ids] {})

(defmulti embedding-params
  "A public link shows all filters, so if e.g. a Dashboard has a public link, then any value-list Cards for the
  dashboard are exposed. But a guest embed is different - only *enabled* filters will matter. A locked or disabled
  filter does not give a value list to an anonymous user. So models need to be able to tell us the embedding params
  so we can check whether a filter is enabled or not."
  {:arglists '([model ids])}
  (fn [model _ids] model))

(defmethod embedding-params :default [_model _ids] {})

(mr/def ::model
  "A content model an anonymous user can open."
  [:enum :model/Card :model/Dashboard :model/Document])

(mr/def ::id-chunk
  "One non-empty chunk of entity ids, as the methods above take it."
  [:sequential {:min 1} ms/PositiveInt])

(mu/defn- shown-card-ids* :- ::id->shown-card-ids
  [model :- ::model
   ids   :- ::id-chunk]
  (shown-card-ids model ids))

(mu/defn- value-list-sources* :- ::id->value-list-sources
  [model :- ::model
   ids   :- ::id-chunk]
  (value-list-sources model ids))

(mu/defn- embedding-params* :- ::id->embedding-params
  [model :- ::model
   ids   :- ::id-chunk]
  (embedding-params model ids))

(defn- exposed-card-ids
  "The Cards `sources` let an anonymous user of `surface` draw a value list from. A public link exposes every filter; a
  guest embed only those its publisher enabled."
  [surface whitelist sources]
  (let [exposed (if (= surface :public-link)
                  sources
                  (let [enabled (set (embedding.util/enabled-params (map :parameter sources) whitelist))]
                    (filter (comp enabled :parameter) sources)))]
    (into #{} (map :card-id) exposed)))

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

(defn- chunk-cards
  "What each entity in `id->surfaces`, one chunk of a model's published entities, renders:
  `{id {:shown #{card-id}, :value-lists {surface #{card-id}}}}`. `:shown` holds through every surface."
  [model id->surfaces]
  (let [ids       (vec (keys id->surfaces))
        shown     (shown-card-ids* model ids)
        sources   (value-list-sources* model ids)
        embedded  (filterv #(and (contains? (id->surfaces %) :guest-embed) (seq (sources %))) ids)
        whitelist (if (seq embedded) (embedding-params* model embedded) {})]
    (into {}
          (map (fn [[id surfaces]]
                 [id {:shown       (get shown id #{})
                      :value-lists (into {}
                                         (map (fn [surface]
                                                [surface (exposed-card-ids surface (get whitelist id) (get sources id))]))
                                         surfaces)}]))
          id->surfaces)))

(defn- anonymously-rendered-cards
  "`{model {id cards}}` for every entity in `published`, each `cards` as [[chunk-cards]] gives it."
  [published]
  (into {}
        (map (fn [[model id->surfaces]]
               [model (into {}
                            (mapcat #(chunk-cards model (into {} %)))
                            (partition-all id-chunk-size id->surfaces))]))
        published))

(defn- card-ids-in
  "Every Card id in `rendered`, over every model, entity and surface."
  [rendered]
  (into #{}
        (comp (mapcat vals)
              (mapcat (fn [{:keys [shown value-lists]}] (into shown cat (vals value-lists)))))
        (vals rendered)))

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
        rendered  (anonymously-rendered-cards published)
        card->db  (card-database-ids (card-ids-in rendered))
        on-db?    (fn [card-id] (= database-id (get card->db card-id)))]
    (named-rows
     (for [[model id->cards]                rendered
           [id {:keys [shown value-lists]}] id->cards
           :let  [shows-directly? (boolean (some on-db? shown))
                  surfaces        (into #{}
                                        (filter #(or shows-directly? (some on-db? (get value-lists %))))
                                        (get-in published [model id]))]
           :when (seq surfaces)]
       {:model model, :id id, :surfaces surfaces, :indirect? (not shows-directly?)}))))
