(ns metabase.public-sharing.reach
  "Anonymous reach: the relation between a warehouse database and the public links and published guest embeds through
  which anonymous traffic can get data from it.

  Reach is what the anonymous-access grant governs. Everything in the relation would stop returning data if the
  database refused anonymous access, and anything that would stop returning data is in the relation. It reads the
  grant nowhere: what it answers is the counterfactual, so it reads the same before and after an admin decides and is
  well defined on a database that is no router at all.

  [[anonymously-reaching]] is the whole of it from outside. [[rendered-card-ids]] is the step each content module
  implements."
  (:require
   [metabase.embedding.settings :as embedding.settings]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.public-sharing.db :as public-sharing.db]
   [metabase.public-sharing.settings :as public-sharing.settings]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defmulti rendered-card-ids
  "The Cards each entity of `model` in `id->surfaces` renders or executes, as
  `{id {:shown #{card-id}, :value-lists {surface #{card-id}}}}`."
  {:arglists '([model id->surfaces])}
  (fn [model _id->surfaces] model))

(defn card-ids-by
  "Regroup `rows` into `{owner-id #{card-id}}`, dropping rows that reach no Card."
  [owner card rows]
  (reduce (fn [acc row]
            (if-let [card-id (card row)]
              (update acc (owner row) (fnil conj #{}) card-id)
              acc))
          {}
          rows))

(defn edges
  "One content kind's answer to [[rendered-card-ids]], assembled from `shown`, `{id #{card-id}}`, and `value-lists`,
  `{id {surface #{card-id}}}`. An entity in one and not the other gets an empty answer for the other."
  [shown value-lists]
  (into {}
        (map (fn [id] [id {:shown       (get shown id #{})
                           :value-lists (get value-lists id {})}]))
        (into (set (keys shown)) (keys value-lists))))

(defn- filters-served-through
  "Those of `parameters` whose value list anonymous traffic can actually fetch through `surface`, for a published
  entity carrying `embedding-params`."
  [surface embedding-params parameters]
  (if (= surface :public-link)
    parameters
    (filter #(= "enabled" (get embedding-params (:slug %))) parameters)))

(defn value-list-card-ids-by-surface
  "The Cards each of `surfaces` lets anonymous traffic draw a filter's value list from, as `{surface #{card-id}}`."
  [surfaces embedding-params parameters source-card-ids]
  (into {}
        (keep (fn [surface]
                (when-let [card-ids (not-empty (source-card-ids
                                                (filters-served-through surface embedding-params parameters)))]
                  [surface card-ids])))
        surfaces))

(def ^:private id-chunk-size
  "How many ids the walk puts into one `IN` clause."
  1000)

(defn- by-surface
  "Fold `ids` into `id->surfaces` under `surface`, keeping any surface an id already has."
  [id->surfaces surface ids]
  (reduce (fn [acc id] (update acc id (fnil conj #{}) surface)) id->surfaces ids))

(defn- published-entities
  "The entities anonymous traffic can open right now, as `{model {id #{surface}}}`. A surface disabled site-wide opens
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
     ;; a Document carries no embeddable flag, so a public link is the only way anonymous traffic opens one
     :model/Document  (cond-> {}
                        public-link? (by-surface :public-link (public-sharing.db/publicly-shared-document-ids)))}))

(defn- anonymously-rendered-card-ids
  "The edges one [[rendered-card-ids]] step out from `published`, as `{model {entity-id {:shown #{card-id},
  :value-lists {surface #{card-id}}}}}`."
  [published]
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
  [{:keys [shown value-lists]}]
  (into shown cat (vals value-lists)))

(defn- card-ids-in
  "Every Card id in `edge-set`, over every model and entity."
  [edge-set]
  (into #{} (comp (mapcat vals) (mapcat card-ids-of)) (vals edge-set)))

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
                       :model  "dataset"
                       :metric "metric"
                       "card")
    :model/Dashboard "dashboard"
    :model/Document  "document"))

(mr/def ::reaching-entity
  [:map {:closed true}
   [:id ms/PositiveInt]
   [:model [:enum "card" "dataset" "metric" "dashboard" "document"]]
   [:name :string]
   [:surfaces [:set {:min 1} [:enum :public-link :guest-embed]]]
   [:indirect? :boolean]])

(defn- named-rows
  "`reaching` as [[anonymously-reaching]] returns it, in name order, without entities that no longer exist."
  [reaching]
  (let [names (entity-names (update-vals (group-by :model reaching) #(mapv :id %)))]
    (->> reaching
         (keep (fn [{:keys [model id surfaces indirect?]}]
                 (when-let [{entity-name :name, card-type :type} (get-in names [model id])]
                   {:id        id
                    :model     (model-name model card-type)
                    :name      entity-name
                    :surfaces  surfaces
                    :indirect? indirect?})))
         (sort-by (juxt #(u/lower-case-en (:name %)) :model :id))
         vec)))

(mu/defn anonymously-reaching :- [:sequential ::reaching-entity]
  "Every public link and published guest embed through which anonymous traffic can get data from the Database with
  `database-id`, by name. `:surfaces` names the surfaces that reach it, and `:indirect?` means it is reached only
  through a filter's value list."
  [database-id :- ::lib.schema.id/database]
  (let [published (published-entities)
        edges     (anonymously-rendered-card-ids published)
        card->db  (card-database-ids (card-ids-in edges))
        on-db?    (fn [card-id] (= database-id (get card->db card-id)))]
    (named-rows
     (for [[model id->edges]                edges
           [id {:keys [shown value-lists]}] id->edges
           :let  [shows-one? (boolean (some on-db? shown))
                  surfaces   (into #{}
                                   (filter #(or shows-one? (some on-db? (get value-lists %))))
                                   (get-in published [model id]))]
           :when (seq surfaces)]
       {:model model, :id id, :surfaces surfaces, :indirect? (not shows-one?)}))))
