(ns metabase.public-sharing.reach
  "Anonymous reach: the relation between a warehouse database and the public links and published guest embeds through
  which anonymous traffic can get data from it.

  Reach is what the anonymous-access grant governs. Everything in the relation would stop returning data if the
  database refused anonymous access, and anything that would stop returning data is in the relation. It reads the
  grant nowhere: what it answers is the counterfactual, so it reads the same before and after an admin decides and is
  well defined on a database that is no router at all.

  [[anonymously-reaching]] and [[databases-reached-by-public-link]] are the whole of it from outside, the same
  relation read from either end: one database and the published entities reaching it, or one entity and the databases
  it reaches. [[rendered-card-ids]] is the step each content module implements, and both ends go through it, so the
  list an admin is shown and the refusal that rejects a new public link cannot disagree."
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
  "The Cards that each entity of `model` in `id->surfaces` itself renders or executes, as
  `{id {:shown #{card-id}, :value-lists {surface #{card-id}}}}`; [[edges]] assembles that from the two sorts
  separately, and an entity that renders no Card at all may be left out.

  `:shown` are the Cards the entity puts in front of an anonymous visitor -- a question's own query, a dashboard's
  cards and the series on them, a document's inline embeds. Every surface that opens the entity serves those alike.
  `:value-lists` are the Cards whose query it runs only to fill a filter's value list, which the visitor never sees
  as a question, and which the two surfaces do not serve alike -- so they come back per surface, as
  `{surface #{card-id}}`, from [[value-list-card-ids-by-surface]].

  One outward step of the walk, implemented by the module that owns `model`. `id->surfaces` maps the id of an entity
  anonymous traffic can open to the surfaces that open it, `:public-link` and `:guest-embed`; it arrives in batches of
  bounded size, so an implementation should answer in a bounded number of queries rather than one per entity. The
  surfaces come along because one edge is served differently through each -- see
  [[value-list-card-ids-by-surface]].

  Only edges where the container itself renders or executes the target belong in the answer. A hyperlink is not one: a
  click-behaviour target, a link card or a document smart link can only be followed to a target published in its own
  right, and such a target stands in the relation on its own account and contributes the same databases. Nothing
  anonymous serves a question that is merely linked to -- the routes that run one question's query on its own are
  keyed on that question's own public link or its own embeddable flag, and the dashcard route checks the card really
  is on that dashcard."
  {:arglists '([model id->surfaces])}
  (fn [model _id->surfaces] model))

(defn card-ids-by
  "Regroup `rows` into the `{id #{card-id}}` shape [[rendered-card-ids]] answers in. `owner` reads out of a row the id
  of the published entity and `card` the id of a Card it reaches; a row whose `card` is nil is dropped, since a
  virtual dashboard card -- text, a heading, an iframe, a link card, an action button -- renders no Card."
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
  "The Cards each of `surfaces` lets anonymous traffic draw a filter's value list from, as `{surface #{card-id}}`, for
  a published entity carrying `parameters` and `embedding-params`. A surface that draws on none is left out.

  Split by surface because the two do not serve filters alike: a public link serves every filter's value list, while
  a guest embed serves one only where `embedding_params` marks that filter `\"enabled\"` by slug, so a filter left
  disabled, locked, or unmentioned reaches nothing through a guest embed -- see the slug check in
  `metabase.embedding-rest.api.common/dashboard-param-values` and its card twin. Keeping the surfaces apart is what
  lets a row name only the surfaces that would really stop returning data.

  `source-card-ids` reads the Card ids out of a collection of filters. It is passed in because `parameters` belongs
  to the module that owns the content kind, and so does the function that reads them."
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
  "The entities anonymous traffic can open right now, as `{model {id #{surface}}}`.

  A surface switched off site-wide opens nothing, so it contributes nothing: with public sharing disabled a public
  link does not resolve, and with static embedding disabled a guest embed does not render. Either way, refusing
  anonymous access would change nothing about what those entities return."
  []
  ;; Actions are deliberately not here. Enabling actions on a router database, or making a database with actions
  ;; enabled into a router, is refused, so no router configured from that guard onwards has a published action form
  ;; for a grant to govern. But the guard fires when the actions setting is written and not when it is read: a
  ;; database that was configured both ways BEFORE it existed does still execute actions, including through the public
  ;; action-form route, which the grant does govern. So this exclusion leaves a known gap on those instances,
  ;; accepted deliberately as too rare to chase. It is not a consequence of an invariant that holds everywhere, and
  ;; anyone relaxing the configuration-time guard has to widen this relation to match.
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
  "The edge set of the relation, one [[rendered-card-ids]] step out from `published` -- the entities anonymous
  traffic can open, `{model {id #{surface}}}`. Comes back as `{model {published-entity-id {:shown #{card-id},
  :value-lists {surface #{card-id}}}}}`, keyed by model because a Card id and a Dashboard id can be the same
  number."
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
  "Every Card id in one entity's [[rendered-card-ids]] answer, of either sort and over every surface. The one place
  that reads the shape, so both ends of the relation agree about what an entity reaches."
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
  "`reaching` -- entities found to reach the database, each `{:model :id :surfaces :indirect?}` -- as the answer
  [[anonymously-reaching]] gives, in name order. An entity that went away between the walk and the name lookup is
  dropped: there is nothing left to show an admin."
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
  `database-id`, by name.

  One row per published entity rather than per path, since an entity reaching the database several ways is still one
  thing an admin would go and unpublish. `:surfaces` names the surfaces that really reach the database, which can be
  fewer than the surfaces that open the entity: a filter's value list is served through a public link and through a
  guest embed only where `embedding_params` enables it, so an entity reaching the database by that one path alone
  reaches it through one surface and not the other. `:indirect?` says that nothing the entity shows is saved against
  this database and it reaches it only by running a question's query to fill such a value list -- a connection an
  admin could not see by opening the thing itself, and would otherwise read as a mistake.

  This is the whole of the relation from outside: whether anything at all reaches the database is whether the answer
  is empty, so the count an admin is shown and the rows beside it cannot disagree."
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

(mr/def ::public-link-model
  "A content kind that can carry a public link and stands in this relation. An Action can carry one too and is
  deliberately not here; the exclusion is explained where the relation's starting set is built."
  [:enum :model/Card :model/Dashboard :model/Document])

(mu/defn databases-reached-by-public-link :- [:set ::lib.schema.id/database]
  "The ids of the Databases a public link on the entity `id` of `model` would let anonymous traffic get data from.

  The same relation [[anonymously-reaching]] answers, read from the other end: one entity rather than one database,
  and an entity nobody has published yet rather than the set that already is. That is what a refusal at publication
  time needs -- it has to know what a link *would* reach before the link exists. Both ends take their one outward
  step through [[rendered-card-ids]], so a link this refuses and a row that list shows are the same fact."
  [model :- ::public-link-model
   id    :- ms/PositiveInt]
  ;; A public link serves every edge the entity has, `:shown` and value lists alike, so nothing the walk found for
  ;; `:public-link` is dropped here -- see [[card-ids-of]].
  (into #{}
        (comp (mapcat (comp vals public-sharing.db/unarchived-card-database-ids))
              (remove nil?))
        (partition-all id-chunk-size
                       (card-ids-of (get (rendered-card-ids model {id #{:public-link}}) id)))))
