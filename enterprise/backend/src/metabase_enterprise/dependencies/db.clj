(ns metabase-enterprise.dependencies.db
  "Application database queries for the dependencies module, so the rest of the module only touches `toucan2.core` for
  model definitions, hydration methods, and transactions."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase.app-db.core :as mdb]
   [metabase.dependencies.core :as dependencies]
   [metabase.funnysql.schema :as funnysql.schema]
   [metabase.funnysql.util :as funnysql.util]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private Column
  "A Honey SQL column keyword, or a string literal standing in for one."
  [:or :keyword :string])

;;; ------------------------------------------------ Graph edge restrictions ------------------------------------------------
;;; The dependency graph is traversed generically over every entity type the module knows about; these private
;;; helpers build the permission and type-allowlist fragments the graph and item-list queries below restrict edges
;;; and items by.

(mu/defn- visible-items-opts :- :metabase.dependencies.items/items-opts
  "The options of the `:items` functions that select the entities readable by the user described by `user-id`,
  `is-superuser?` and `is-data-analyst?`, the archived ones as `include-archived-items` says, default `:exclude`, and
  nothing that only the lists leave out."
  [{:keys [user-id is-superuser? is-data-analyst? include-archived-items]
    :or   {include-archived-items :exclude}} :- ::dependencies.schema/visible-opts]
  {:user-id                       user-id
   :is-superuser?                 is-superuser?
   :is-data-analyst?              is-data-analyst?
   :include-archived              include-archived-items
   :include-personal-collections? true
   :include-internal?             true
   :include-sample-databases?     true})

(mu/defn- items-query :- [:maybe ::funnysql.schema/expr.subquery]
  "The `:items` query of the spec of `model` for `opts`, marked as a subquery, or nil when the model is not listed or
  the user reads none of its entities."
  [model :- :keyword
   opts  :- :metabase.dependencies.items/items-opts]
  (when-let [items (:items (dependencies/spec model))]
    (some-> (items opts) (vary-meta assoc :allow-subquery true))))

(mu/defn- visible-entities-expr :- ::funnysql.schema/expr
  "Matches entities at `entity-type-field`/`entity-id-field` that are readable by the user described by `user-id`,
  `is-superuser?`, and `is-data-analyst?`, honoring `include-archived-items` (`:exclude`, `:all`, or `:only`,
  default `:exclude`): those that the `:items` query of the spec of their model selects for them, none of a model
  without one."
  [entity-type-field :- Column
   entity-id-field   :- Column
   visible           :- ::dependencies.schema/visible-opts]
  (let [opts (visible-items-opts visible)]
    (into [:or]
          (keep (fn [[entity-type model]]
                  (when-let [items (items-query model opts)]
                    [:and
                     [:= entity-type-field (name entity-type)]
                     [:in entity-id-field ^:allow-subquery {:select [:items.entity_id]
                                                            :from   [[items :items]]}]])))
          (dependencies/type->model))))

(mu/defn- broken-entities-expr :- ::funnysql.schema/expr
  "Matches entities at `entity-type-field`/`entity-id-field` that have failed analysis (an AnalysisFinding with
  `:result` false)."
  [entity-type-field :- Column
   entity-id-field   :- Column]
  (into [:or]
        (keep (fn [[entity-type _model]]
                [:and
                 [:= entity-type-field (name entity-type)]
                 [:in entity-id-field
                  ^:allow-subquery
                  {:select [:entity_id]
                   :from   [(t2/table-name :model/AnalysisFinding)]
                   :where  [:and
                            [:= (u/qualified-key (t2/table-name :model/AnalysisFinding) :entity_type) (name entity-type)]
                            [:= (u/qualified-key (t2/table-name :model/AnalysisFinding) :result) false]]}]]))
        (dependencies/type->model)))

(mu/defn- allowed-entity-types-expr :- ::funnysql.schema/expr
  "Matches entities at `entity-type-field` whose type is one of `entity-types`."
  [entity-type-field :- Column
   entity-types      :- [:set ::dependencies.schema/entity-type]]
  (into [:or] (map (fn [entity-type] [:= entity-type-field (name entity-type)])) entity-types))

(mu/defn- entity-ids-expr :- ::funnysql.schema/expr
  "Matches entities at `entity-type-field`/`entity-id-field` that are of type `entity-type` and whose id is in
  `ids`."
  [entity-type-field          :- Column
   entity-id-field            :- Column
   {:keys [entity-type ids]}  :- [:map {:closed true}
                                  [:entity-type ::dependencies.schema/entity-type]
                                  [:ids         [:sequential ::deps.dependency-types/entity-id]]]]
  [:and [:= entity-type-field (name entity-type)] [:in entity-id-field ids]])

(mu/defn- edge-restriction-expr :- [:maybe ::funnysql.schema/expr]
  "The combined `:where` fragment for `restriction-spec` (nil for no filter), which may include `:visible` (opts for
  [[visible-entities-expr]]), `:broken?` (restrict to [[broken-entities-expr]]), `:types` (restrict to
  [[allowed-entity-types-expr]]), or `:entity-type` + `:ids` (restrict to [[entity-ids-expr]]). Combinable
  fragments are AND-ed together."
  [entity-type-field                              :- Column
   entity-id-field                                :- Column
   {:keys [visible broken? types entity-type ids]} :- ::dependencies.schema/edge-restriction]
  (let [fragments (cond-> []
                    visible               (conj (visible-entities-expr entity-type-field entity-id-field visible))
                    broken?               (conj (broken-entities-expr entity-type-field entity-id-field))
                    types                 (conj (allowed-entity-types-expr entity-type-field types))
                    (and entity-type ids) (conj (entity-ids-expr entity-type-field entity-id-field
                                                                 {:entity-type entity-type :ids ids})))]
    (case (count fragments)
      0 nil
      1 (first fragments)
      (into [:and] fragments))))

(mu/defn dependency-edges
  "The Dependencies from the entities of type `entity-type` with `entity-ids`, where `src-type`/`src-id` name the
  Dependency columns identifying those entities and `dst-type`/`dst-id` name the columns identifying the related
  entities on the other side of the edge, optionally restricted by `destination-restriction` (applied to
  `dst-type`/`dst-id`) and `source-restriction` (applied to `src-type`/`src-id`) — see [[edge-restriction-expr]] for the
  filter spec shape."
  [{:keys [src-type src-id dst-type dst-id entity-type entity-ids destination-restriction source-restriction]}
   :- [:map {:closed true}
       [:src-type [:enum :from_entity_type :to_entity_type]]
       [:src-id   [:enum :from_entity_id :to_entity_id]]
       [:dst-type [:enum :from_entity_type :to_entity_type]]
       [:dst-id   [:enum :from_entity_id :to_entity_id]]
       [:entity-type ::dependencies.schema/entity-type]
       [:entity-ids [:sequential ::deps.dependency-types/entity-id]]
       [:destination-restriction ::dependencies.schema/edge-restriction]
       [:source-restriction ::dependencies.schema/edge-restriction]]]
  (into []
        (mapcat (fn [batch]
                  (t2/select :model/Dependency
                             {:where (into [:and
                                            [:= src-type (name entity-type)]
                                            [:in src-id batch]]
                                           (keep identity)
                                           [(edge-restriction-expr dst-type dst-id destination-restriction)
                                            (edge-restriction-expr src-type src-id source-restriction)])})))
        (partition-all 1000 entity-ids)))

(mu/defn finding-errors-from-sources
  "The AnalysisFindingErrors caused by any of the entities `source-entity-type` `source-entity-ids`, whose analyzed
  entity is visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [source-entity-type  :- ::dependencies.schema/entity-type
   source-entity-ids   :- [:sequential ::deps.dependency-types/entity-id]
   {:keys [user-id is-superuser? is-data-analyst?]} :- ::dependencies.schema/visible-opts]
  (mdb/select-batched #(t2/select :model/AnalysisFindingError
                                  {:where [:and
                                           [:= :source_entity_type (name source-entity-type)]
                                           [:in :source_entity_id %]
                                           (visible-entities-expr :analyzed_entity_type :analyzed_entity_id
                                                                  {:user-id user-id :is-superuser? is-superuser?
                                                                   :is-data-analyst? is-data-analyst?})]})
                      source-entity-ids))

(mu/defn finding-errors-for-entities-with-visible-sources
  "The AnalysisFindingErrors analyzing any of the entities `entity-type` `entity-ids`, excluding those whose source
  entity exists but is not visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ::deps.dependency-types/entity-id]
   {:keys [user-id is-superuser? is-data-analyst?]} :- ::dependencies.schema/visible-opts]
  (mdb/select-batched #(t2/select :model/AnalysisFindingError
                                  {:where [:and
                                           [:= :analyzed_entity_type (name entity-type)]
                                           [:in :analyzed_entity_id %]
                                           [:or
                                            [:= :source_entity_type nil]
                                            (visible-entities-expr :source_entity_type :source_entity_id
                                                                   {:user-id user-id :is-superuser? is-superuser?
                                                                    :is-data-analyst? is-data-analyst?})]]})
                      entity-ids))

;;; ------------------------------------------ Dependency item list queries -------------------------------------------
;;; The /graph/unreferenced and /graph/breaking endpoints union together one SELECT per entity type, each producing
;;; `entity_type`/`entity_id`/`sort_key` rows, then page and count that union. These private helpers build the
;;; per-entity-type SELECT and the pieces (joins, extra filters, sort expression) that make it up.

(mr/def ::dependency-item-filter-params
  "Filter params shared by [[dependency-item-ids]] and [[dependency-item-count]]."
  [:map {:closed true}
   [:query-type [:enum :unreferenced :breaking]]
   [:entity-types [:sequential ::deps.dependency-types/dependency-types]]
   [:card-types {:optional true} [:maybe [:sequential [:or :keyword :string]]]]
   [:search-text {:optional true} [:maybe :string]]
   [:include-personal-collections? :boolean]
   [:sort-column {:optional true} [:maybe [:enum :name :location :dependents-errors :dependents-with-errors]]]
   [:user-id ::lib.schema.id/user]
   [:is-superuser? {:optional true} [:maybe :boolean]]
   [:is-data-analyst? {:optional true} [:maybe :boolean]]])

(mr/def ::dependency-item-page-params
  "[[::dependency-item-filter-params]] plus the sort direction and page bounds for [[dependency-item-ids]]."
  [:merge
   ::dependency-item-filter-params
   [:map {:closed true}
    [:sort-direction [:enum :asc :desc]]
    [:offset ms/IntGreaterThanOrEqualToZero]
    [:limit ms/PositiveInt]]])

(def ^:private DependencyItemSelectParams
  "The [[::dependency-item-filter-params]] of the SELECT of one `:entity-type`."
  [:merge
   ::dependency-item-filter-params
   [:map {:closed true}
    [:entity-type ::deps.dependency-types/dependency-types]]])

(mu/defn action-root-namespace :- [:maybe [:= :data-actions]]
  "The namespace of the root collection an action without a collection sits in: the data actions root for a
  `model-less?` action, and the default root for an action of a model."
  [model-less? :- :boolean]
  (when model-less?
    :data-actions))

(mu/defn- item-query-join :- [:map {:closed true}
                              [:join        ::funnysql.schema/clause.left-join]
                              [:join-filter ::funnysql.schema/expr]]
  "The join and join-filter for `query-type`, restricting the joined-in dependency/finding-error rows to those
  whose other-side entity passes `default-visible-restriction` (see [[edge-restriction-expr]]; this is independent of any
  archived-items override applied to the item's own visibility)."
  [query-type                  :- [:enum :unreferenced :broken :breaking]
   entity-type                 :- ::deps.dependency-types/dependency-types
   default-visible-restriction :- ::dependencies.schema/edge-restriction]
  (case query-type
    :unreferenced {:join [[(t2/table-name :model/Dependency) :dep]
                          [:and
                           [:= :dep.to_entity_id :items.entity_id]
                           [:= :dep.to_entity_type (name entity-type)]
                           (edge-restriction-expr :dep.from_entity_type :dep.from_entity_id default-visible-restriction)]]
                   :join-filter [:= :dep.id nil]}
    :broken {:join [[(t2/table-name :model/AnalysisFinding) :af]
                    [:and
                     [:= :af.entity_id :items.entity_id]
                     [:= :af.entity_type (name entity-type)]]]
             :join-filter [:= :af.result false]}
    :breaking {:join [[(t2/table-name :model/AnalysisFindingError) :afe]
                      [:and
                       [:= :afe.source_entity_id :items.entity_id]
                       [:= :afe.source_entity_type (name entity-type)]
                       (edge-restriction-expr :afe.analyzed_entity_type :afe.analyzed_entity_id default-visible-restriction)]]
               :join-filter [:!= :afe.id nil]}))

(mu/defn- sort-key-expr :- ::funnysql.schema/expr
  "The sort expression for `sort-column` over the `items` of `entity-type`, restricting the
  `dependents-errors`/`dependents-with-errors` counts to finding errors whose analyzed entity passes
  `default-visible-restriction` (see [[edge-restriction-expr]])."
  [sort-column                 :- [:maybe [:enum :name :location :dependents-errors :dependents-with-errors]]
   entity-type                 :- ::deps.dependency-types/dependency-types
   default-visible-restriction :- ::dependencies.schema/edge-restriction]
  (case sort-column
    :location :items.location
    :dependents-errors ^:allow-subquery
    {:select [[[:count [:distinct (if (= :mysql (mdb/db-type))
                                    [:concat :error_type "-" [:coalesce :error_detail ""]]
                                    [:composite :error_type :error_detail])]]]]
     :from [(t2/table-name :model/AnalysisFindingError)]
     :where [:and
             [:= :source_entity_id :items.entity_id]
             [:= :source_entity_type (name entity-type)]
             (edge-restriction-expr :analyzed_entity_type :analyzed_entity_id default-visible-restriction)]}
    :dependents-with-errors ^:allow-subquery
    {:select [[[:count [:distinct (if (= :mysql (mdb/db-type))
                                    [:concat :analyzed_entity_id "-" :analyzed_entity_type]
                                    [:composite :analyzed_entity_id :analyzed_entity_type])]]]]
     :from [(t2/table-name :model/AnalysisFindingError)]
     :where [:and
             [:= :source_entity_id :items.entity_id]
             [:= :source_entity_type (name entity-type)]
             (edge-restriction-expr :analyzed_entity_type :analyzed_entity_id default-visible-restriction)]}
    :items.name))

(mu/defn- dependency-item-select :- [:maybe ::funnysql.schema/expr.subquery]
  "The per-entity-type SELECT that [[dependency-item-ids]] and [[dependency-item-count]] union together: the
  `:items` of the spec of `entity-type` for the user described by `user-id`, `is-superuser?`, and
  `is-data-analyst?`, restricted to `card-types` and `include-personal-collections?`, whose `name` or `location`
  contains `search-text`, matching `query-type` (`:unreferenced` or `:breaking`), with `sort-column`'s expression
  selected as `:sort_key`, or nil when the user reads no entity of the type. Throws when `user-id` is missing, since the visibility restriction must always
  be applied."
  [{:keys [query-type entity-type sort-column user-id is-superuser? is-data-analyst? card-types search-text
           include-personal-collections?]}
   :- DependencyItemSelectParams]
  (when-not user-id
    (throw (ex-info "dependency-item-select requires a user-id so the visibility restriction is always applied"
                    {:query-type query-type :entity-type entity-type})))
  (when-let [items (items-query (dependencies/entity-model entity-type)
                                {:user-id                       user-id
                                 :is-superuser?                 is-superuser?
                                 :is-data-analyst?              is-data-analyst?
                                 :include-archived              (if (= query-type :breaking) :all :exclude)
                                 :include-personal-collections? include-personal-collections?
                                 :include-internal?             (not= query-type :unreferenced)
                                 :include-sample-databases?     false
                                 :card-types                    card-types})]
    (let [default-visible-restriction {:visible {:user-id          user-id
                                                 :is-superuser?    is-superuser?
                                                 :is-data-analyst? is-data-analyst?}}
          {:keys [join join-filter]}  (item-query-join query-type entity-type default-visible-restriction)]
      ^:allow-subquery
      {(if (= query-type :breaking) :select-distinct :select)
       [[[:literal (name entity-type)] :entity_type]
        [:items.entity_id :entity_id]
        [(sort-key-expr sort-column entity-type default-visible-restriction) :sort_key]]
       :from      [[items :items]]
       :left-join join
       :where     (cond-> [:and join-filter]
                    search-text (conj (let [pattern (funnysql.util/like-substring search-text)]
                                        [:or
                                         [:like [:lower :items.name] pattern]
                                         [:like [:lower :items.location] pattern]])))})))

(mu/defn- dependency-item-union :- [:maybe ::funnysql.schema/expr.subquery]
  "The union of the [[dependency-item-select]]s of the `entity-types` for `params`, or nil when there is none."
  [entity-types :- [:sequential ::deps.dependency-types/dependency-types]
   params       :- ::dependency-item-filter-params]
  (when-let [selects (seq (keep #(dependency-item-select (assoc params :entity-type %)) entity-types))]
    ^:allow-subquery {:union-all (vec selects)}))

(mu/defn dependency-item-ids
  "A page of `[entity-type entity-id]` pairs for `query-type` (`:unreferenced` or `:breaking`), restricted to
  `entity-types`, `card-types` (applied only to `:card` entities), `search-text` (nil for none), and
  `include-personal-collections?`; sorted by `sort-column` (`:name`, `:location`, `:dependents-errors`, or
  `:dependents-with-errors`) in `sort-direction`, skipping `offset` and returning up to `limit`. Entities are
  restricted to those visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`; throws
  when `user-id` is missing."
  [{:keys [entity-types sort-direction offset limit] :as params} :- ::dependency-item-page-params]
  (if-let [union-query (dependency-item-union entity-types (dissoc params :sort-direction :offset :limit))]
    (->> (t2/query (assoc union-query
                          :order-by [[:sort_key sort-direction] [:entity_id sort-direction] [:entity_type sort-direction]]
                          :offset offset
                          :limit limit))
         (map (fn [{:keys [entity_id entity_type]}] [(keyword entity_type) entity_id])))
    []))

(mu/defn dependency-item-count
  "The total count of items matching the same criteria as [[dependency-item-ids]] (ignoring sort direction, offset,
  and limit); throws when `user-id` is missing."
  [{:keys [entity-types] :as params} :- ::dependency-item-filter-params]
  (if-let [union-query (dependency-item-union entity-types params)]
    (-> (t2/query {:select [[:%count.* :total]] :from [[union-query :subquery]]})
        first
        :total)
    0))

(mu/defn broken-entity-pairs
  "The `[:analyzed_entity_type :analyzed_entity_id]` pairs whose analysis failed and were caused by the entity
  `source-entity-type` `source-entity-id`, restricted to `dependent-types` and `dependent-card-types` (each nil
  for no restriction), visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [{:keys [source-entity-type source-entity-id dependent-types dependent-card-types
           user-id is-superuser? is-data-analyst?]}
   :- [:map {:closed true}
       [:source-entity-type ::dependencies.schema/entity-type]
       [:source-entity-id ms/PositiveInt]
       [:dependent-types {:optional true} [:maybe [:sequential :string]]]
       [:dependent-card-types {:optional true} [:maybe [:sequential :string]]]
       [:user-id ::lib.schema.id/user]
       [:is-superuser? {:optional true} [:maybe :boolean]]
       [:is-data-analyst? {:optional true} [:maybe :boolean]]]]
  (t2/query
   (cond-> {:select-distinct [[:afe.analyzed_entity_type :entity_type] [:afe.analyzed_entity_id :entity_id]]
            :from [[(t2/table-name :model/AnalysisFindingError) :afe]]
            :join [[(t2/table-name :model/AnalysisFinding) :af]
                   [:and
                    [:= :af.entity_type :afe.analyzed_entity_type]
                    [:= :af.entity_id :afe.analyzed_entity_id]]]
            :where (cond-> [:and
                            [:= :afe.source_entity_type (name source-entity-type)]
                            [:= :afe.source_entity_id source-entity-id]
                            [:= :af.result false]
                            (visible-entities-expr :afe.analyzed_entity_type :afe.analyzed_entity_id
                                                   {:user-id user-id :is-superuser? is-superuser?
                                                    :is-data-analyst? is-data-analyst?
                                                    :include-archived-items :exclude})]
                     dependent-types      (conj [:in :afe.analyzed_entity_type dependent-types])
                     dependent-card-types (conj [:or
                                                 [:!= :afe.analyzed_entity_type "card"]
                                                 [:in :rc.type dependent-card-types]]))}
     dependent-card-types (assoc :left-join [[(t2/table-name :model/Card) :rc]
                                             [:and
                                              [:= :afe.analyzed_entity_type "card"]
                                              [:= :rc.id :afe.analyzed_entity_id]]]))))

;;; ---------------------------------------------------- Entities ----------------------------------------------------

(def ^:private narrow-columns
  "The columns read for the entity types whose rows hold much more than dependency code needs: a data app's bundle
  can be megabytes."
  {:data-app [:id :resource_collection_id]})

(mu/defn entities
  "The entities of the entity type `entity-type` with `ids`: whole rows, except for the types in [[narrow-columns]],
  whose rows hold only those columns."
  [entity-type :- ::deps.dependency-types/dependency-types
   ids         :- [:set ::deps.dependency-types/entity-id]]
  (let [model     (dependencies/entity-model entity-type)
        modelable (if-let [columns (narrow-columns entity-type)] (into [model] columns) model)]
    (mdb/select-batched #(t2/select modelable :id [:in %]) ids)))

(mu/defn app-db-reachable? :- :boolean
  "Whether the app DB answers a query on a connection of its own, outside any transaction of this thread."
  []
  (try
    (boolean (mdb/can-connect-to-data-source? (mdb/data-source)))
    (catch Exception _
      false)))

(mu/defn throw-unless-app-db-reachable! :- :nil
  "Rethrows `e` while the app DB is unreachable. A failure then says nothing about the entity it happened on, so it
  mustn't count against it."
  [e :- (ms/InstanceOfClass Throwable)]
  (when-not (app-db-reachable?)
    (throw e)))

(mu/defn readable-entities :- [:sequential :any]
  "The entities `read-entities` returns for `ids`. When that fails, reads each id alone, calling `on-unreadable` with
  the id and exception of each that fails, so one unreadable row doesn't block the rest. Rethrows instead while the
  app DB is unreachable: that failure isn't about any row."
  [read-entities :- [:fn {:error/message "a function"} ifn?]
   ids           :- [:set ::deps.dependency-types/entity-id]
   on-unreadable :- [:fn {:error/message "a function"} ifn?]]
  (try
    (vec (read-entities ids))
    (catch Exception e
      (throw-unless-app-db-reachable! e)
      (log/warnf "Reading %s entities together failed, reading each on its own: %s" (count ids) (ex-message e))
      (into []
            (mapcat (fn [id]
                      (try
                        (vec (read-entities #{id}))
                        (catch Exception e
                          (throw-unless-app-db-reachable! e)
                          (on-unreadable id e)
                          nil))))
            ids))))

(mu/defn entity
  "The entity of the entity type `entity-type` with `id`, or nil, with the columns of [[entities]]."
  [entity-type :- ::deps.dependency-types/dependency-types
   id          :- ::deps.dependency-types/entity-id]
  (first (entities entity-type #{id})))

(mu/defn entities-with-columns
  "The `columns` of the entities of the entity type `entity-type` with `ids`."
  [entity-type :- ::deps.dependency-types/dependency-types
   columns     :- [:sequential :keyword]
   ids         :- [:sequential ::deps.dependency-types/entity-id]]
  (let [model (into [(dependencies/entity-model entity-type)] columns)]
    (into [] (mapcat #(t2/select model :id [:in %])) (partition-all 1000 ids))))

(mu/defn cards :- [:map-of ::lib.schema.id/card (ms/InstanceOf :model/Card)]
  "The Cards with `card-ids`, by Card id."
  [card-ids :- [:sequential {:min 1} ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn identity :model/Card :id [:in %]) card-ids))

(mu/defn card-types-by-id
  "A map of Card ID to type for `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-fn->fn :id :type [:model/Card :id :type] :id [:in %]) card-ids))

(mu/defn column-value :- [:maybe ms/PositiveInt]
  "The `column` of the row of `model` with `id`, or nil."
  [model  :- :keyword
   column :- :keyword
   id     :- ms/PositiveInt]
  (t2/select-one-fn column [model column] :id id))

(mu/defn column-values :- [:map-of ms/PositiveInt [:maybe ms/PositiveInt]]
  "The `column` of each of the rows of `model` with `ids`, by id."
  [model  :- :keyword
   column :- :keyword
   ids    :- [:sequential {:min 1} ms/PositiveInt]]
  (mdb/select-batched-map #(t2/select-fn->fn :id column [model :id column] :id [:in %]) ids))

(mu/defn field-table-ids :- [:map-of ::lib.schema.id/field [:maybe ::lib.schema.id/table]]
  "The `:table_id` of each of the Fields with `field-ids`, by Field id."
  [field-ids :- [:sequential {:min 1} ::lib.schema.id/field]]
  (mdb/select-batched-map #(t2/select-fn->fn :id :table_id [:model/Field :id :table_id] :id [:in %]) field-ids))

;;; -------------------------------------------------- Dependencies --------------------------------------------------

(mu/defn dependencies-from-entities
  "The `:id`, `:from_entity_id`, `:to_entity_type`, and `:to_entity_id` of the Dependencies of the entities
  `entity-type` `entity-ids`."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/Dependency :id :from_entity_id :to_entity_type :to_entity_id]
                                  :from_entity_type entity-type
                                  :from_entity_id [:in %])
                      entity-ids))

(mu/defn dependencies-on-entities
  "The `:id`, `:from_entity_type`, `:from_entity_id`, and `:to_entity_id` of the Dependencies on the entities
  `entity-type` `entity-ids`."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/Dependency :id :from_entity_type :from_entity_id :to_entity_id]
                                  :to_entity_type entity-type
                                  :to_entity_id [:in %])
                      entity-ids))

(mu/defn insert-dependencies!
  "Insert the Dependency `rows`, returning the number inserted."
  [rows :- [:sequential [:map {:closed true}
                         [:id               {:optional true} ms/PositiveInt]
                         [:from_entity_type {:optional true} [:maybe [:or :keyword :string]]]
                         [:from_entity_id   {:optional true} [:maybe ms/PositiveInt]]
                         [:to_entity_type   {:optional true} [:maybe [:or :keyword :string]]]
                         [:to_entity_id     {:optional true} [:maybe ms/PositiveInt]]]]]
  (transduce (map #(t2/insert! :model/Dependency (vec %))) + 0 (partition-all mdb/create-partition-size rows)))

(mu/defn delete-dependencies!
  "Delete the Dependencies with `dependency-ids`, returning the number deleted."
  [dependency-ids :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/Dependency :id [:in %]) dependency-ids))

(mu/defn delete-dependencies-for-entities!
  "Delete the Dependencies of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/Dependency :from_entity_type entity-type :from_entity_id [:in %]) entity-ids))

;;; -------------------------------------------- Statuses, shared by the jobs --------------------------------------------

(def ^:private StatusModel
  "A job's status model."
  [:enum :model/DependencyStatus :model/ResultMetadataStatus :model/AnalysisFindingStatus])

(def ^:private one-more-write
  "The `stale` count of a status after one more write changed what its job reads, as Honey SQL."
  [:+ :stale [:inline 1]])

(def ^:private fresh-attempts
  "The columns of a status a write resets, so that the job tries an entity it gave up on again."
  {:fail_count 0 :terminal false})

(mu/defn- mark-stale!
  "Count one more write in the statuses in the status `model` of the entities `type->ids`, with fresh attempts, so the
  job processes them until it clears a count no write raised meanwhile; an entity without a status is processed
  anyway."
  [model      :- StatusModel
   type->ids  :- ::dependencies.schema/type->ids]
  (doseq [[entity-type ids] type->ids
          batch             (partition-all 1000 ids)]
    (t2/update! model :entity_type entity-type :entity_id [:in batch] (assoc fresh-attempts :stale one-more-write))))

(mu/defn- mark-dependents-stale!
  "Count one more write in the statuses in the status `model` of the entities directly depending on the entities
  `entity-type` `entity-ids`, in one UPDATE per 1,000 of them."
  [model       :- StatusModel
   entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:set ms/PositiveInt]]
  (let [table (t2/table-name model)]
    (doseq [batch (partition-all 1000 entity-ids)]
      (t2/query {:update table
                 :set    (assoc fresh-attempts :stale one-more-write)
                 :where  [:exists ^:allow-subquery
                          {:select [1]
                           :from   [[(t2/table-name :model/Dependency) :d]]
                           :where  [:and
                                    [:= :d.to_entity_type (name entity-type)]
                                    [:in :d.to_entity_id batch]
                                    [:= :d.from_entity_type (u/qualified-key table :entity_type)]
                                    [:= :d.from_entity_id (u/qualified-key table :entity_id)]]}]}))))

(mu/defn- record-failure! :- :boolean
  "Record that a job failed to process the entity `entity-type` `entity-id`, giving up on it until a write changes it
  once it failed `max-failures` times in a row, returning whether it gave up."
  [model        :- StatusModel
   entity-type  :- ::dependencies.schema/entity-type
   entity-id    :- ms/PositiveInt
   max-failures :- ms/PositiveInt]
  (t2/update! model :entity_type entity-type :entity_id entity-id {:fail_count [:+ :fail_count [:inline 1]]})
  (pos? (t2/update! model :entity_type entity-type :entity_id entity-id :fail_count [:>= max-failures]
                    {:terminal true})))

(mu/defn mark-dependency-statuses-stale!
  "Mark the DependencyStatuses of the entities `type->ids` stale, so the dependency job computes their dependencies
  again."
  [type->ids :- ::dependencies.schema/type->ids]
  (mark-stale! :model/DependencyStatus type->ids))

(mu/defn mark-data-app-dependency-statuses-stale!
  "Mark the DependencyStatuses of the DataApps whose resource collection is one of the Collections with
  `collection-ids` stale, in one UPDATE for each `mdb/update-partition-size` of them."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (doseq [batch (partition-all mdb/update-partition-size (distinct collection-ids))]
    (t2/query {:update (t2/table-name :model/DependencyStatus)
               :set    (assoc fresh-attempts :stale one-more-write)
               :where  [:and
                        [:= :entity_type (name :data-app)]
                        [:in :entity_id ^:allow-subquery {:select [:id]
                                                          :from   [(t2/table-name :model/DataApp)]
                                                          :where  [:in :resource_collection_id (vec batch)]}]]})))

(mu/defn mark-result-metadata-statuses-stale!
  "Mark the ResultMetadataStatuses of the entities `type->ids` stale, so the result metadata job re-derives them."
  [type->ids :- ::dependencies.schema/type->ids]
  (mark-stale! :model/ResultMetadataStatus type->ids))

(mu/defn mark-analysis-finding-statuses-stale!
  "Mark the AnalysisFindingStatuses of the entities `type->ids` stale, so the analysis job analyzes them again."
  [type->ids :- ::dependencies.schema/type->ids]
  (mark-stale! :model/AnalysisFindingStatus type->ids))

(mu/defn mark-dependents-result-metadata-statuses-stale!
  "Mark the ResultMetadataStatuses of the entities directly depending on the entities `entity-type` `entity-ids` stale."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:set ms/PositiveInt]]
  (mark-dependents-stale! :model/ResultMetadataStatus entity-type entity-ids))

(mu/defn mark-dependents-analysis-finding-statuses-stale!
  "Mark the AnalysisFindingStatuses of the entities directly depending on the entities `entity-type` `entity-ids`
  stale."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:set ms/PositiveInt]]
  (mark-dependents-stale! :model/AnalysisFindingStatus entity-type entity-ids))

(mu/defn- current-dependencies-clause
  "Whether the dependency status of the entity of `entity-type` with `id-field` is current for the dependency logic of
  `dependency-version`, as Honey SQL."
  [entity-type        :- ::deps.dependency-types/dependency-types
   id-field           :- :keyword
   dependency-version :- ms/PositiveInt]
  [:exists ^:allow-subquery {:select [1]
                             :from   [[(t2/table-name :model/DependencyStatus) :ds]]
                             :where  [:and
                                      [:= :ds.entity_type (name entity-type)]
                                      [:= :ds.entity_id id-field]
                                      [:= :ds.stale 0]
                                      [:= :ds.analysis_version dependency-version]]}])

(mu/defn- pending-statuses :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` entities of `entity-type` without a status in `status-model`, or whose status the job has not
  given up on and that counts a write or records a version of the job's logic below `current-version`, those last,
  with their `stale` counts, nil without a status; `user-mbql-only?` narrows cards to MBQL ones that Metabase did not create itself, and `dependency-version`
  to the entities whose dependencies are current."
  [entity-type     :- ::deps.dependency-types/dependency-types
   status-model    :- StatusModel
   batch-size      :- ms/PositiveInt
   current-version :- ms/PositiveInt
   {:keys [user-mbql-only? dependency-version]} :- [:map {:closed true}
                                                    [:user-mbql-only?    {:optional true} :boolean]
                                                    [:dependency-version {:optional true} ms/PositiveInt]]]
  (let [table-name (t2/table-name (dependencies/entity-model entity-type))
        id-field   (u/qualified-key table-name :id)
        outdated   [:< :status.analysis_version current-version]]
    (mapv #(select-keys % [:entity_id :stale])
          (t2/query
           {:select    [[id-field :entity_id] [:status.stale :stale]]
            :from      [table-name]
            :left-join [[(t2/table-name status-model) :status] [:and
                                                                [:= :status.entity_type (name entity-type)]
                                                                [:= :status.entity_id id-field]]]
            :where     (cond-> [:and [:or [:= :status.id nil]
                                      [:and [:= :status.terminal false] [:or [:> :status.stale 0] outdated]]]]
                         user-mbql-only?    (conj [:or [:= (u/qualified-key (t2/table-name :model/Card) :query_type) nil]
                                                   [:not= (u/qualified-key (t2/table-name :model/Card) :query_type) "native"]]
                                                  (mi/non-internal-filter-clause :model/Card (t2/table-name :model/Card)))
                         dependency-version (conj (current-dependencies-clause
                                                   entity-type id-field dependency-version)))
            :order-by  [[[:case outdated [:inline 1] :else [:inline 0]]]]
            :limit     batch-size}))))

(mu/defn- take-pending-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "The [[pending-statuses]] a job is to process, each with the `stale` count it clears afterwards, inserting a status
  counting one write for each entity without one before the job reads it, so a write while it is processed counts."
  [entity-type     :- ::deps.dependency-types/dependency-types
   status-model    :- StatusModel
   batch-size      :- ms/PositiveInt
   current-version :- ms/PositiveInt
   opts            :- [:map {:closed true}
                       [:user-mbql-only?    {:optional true} :boolean]
                       [:dependency-version {:optional true} ms/PositiveInt]]]
  (let [statuses (pending-statuses entity-type status-model batch-size current-version opts)
        missing  (remove :stale statuses)]
    (when (seq missing)
      (t2/insert! status-model (for [{:keys [entity_id]} missing]
                                 {:entity_type      entity-type
                                  :entity_id        entity_id
                                  :stale            1
                                  :analysis_version 0})))
    (mapv #(update % :stale (fnil identity 1)) statuses)))

(mu/defn- deleted-entity-ids-with-status :- [:sequential ms/PositiveInt]
  "Up to `batch-size` IDs of deleted entities of `entity-type` that still have a status in `status-model`."
  [status-model :- StatusModel
   entity-type  :- ::deps.dependency-types/dependency-types
   batch-size   :- ms/PositiveInt]
  (let [table-name (t2/table-name (dependencies/entity-model entity-type))]
    (mapv :entity_id (t2/query {:select [:status.entity_id]
                                :from   [[(t2/table-name status-model) :status]]
                                :where  [:and
                                         [:= :status.entity_type (name entity-type)]
                                         [:not [:exists ^:allow-subquery {:select [1]
                                                                          :from   [[table-name :entity]]
                                                                          :where  [:= :entity.id :status.entity_id]}]]]
                                :limit  batch-size}))))

;;; ---------------------------------------------- Dependency job ----------------------------------------------

(mu/defn dependency-deleted-entity-ids :- [:sequential ms/PositiveInt]
  "Up to `batch-size` IDs of deleted entities of `entity-type` that still have a DependencyStatus."
  [entity-type :- ::deps.dependency-types/dependency-types
   batch-size  :- ms/PositiveInt]
  (deleted-entity-ids-with-status :model/DependencyStatus entity-type batch-size))

(mu/defn delete-dependency-statuses!
  "Delete the DependencyStatuses of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/DependencyStatus :entity_type entity-type :entity_id [:in %]) entity-ids))

(mu/defn record-dependency-failure! :- :boolean
  "Record that the dependency job failed to compute the dependencies of the entity `entity-type` `entity-id`, giving up on it until a write changes it once it failed
  `max-failures` times in a row, returning whether it gave up."
  [entity-type  :- ::dependencies.schema/entity-type
   entity-id    :- ms/PositiveInt
   max-failures :- ms/PositiveInt]
  (record-failure! :model/DependencyStatus entity-type entity-id max-failures))

(mu/defn given-up-dependency-statuses :- [:sequential [:map
                                                       [:entity_type ::deps.dependency-types/dependency-types]
                                                       [:entity_id   ms/PositiveInt]]]
  "The entities whose dependencies the dependency job gave up computing until a write changes them."
  []
  (t2/select [:model/DependencyStatus :entity_type :entity_id] :terminal true))

(mu/defn clear-dependency-statuses!
  "Record that the dependency job computed the dependencies of the entities `entity-type` whose ids are the keys of
  `id->stale` with the analysis of `current-version`, clearing each count of `stale` writes unless a write raised it,
  with one update for each distinct count and partition of ids."
  [entity-type     :- ::dependencies.schema/entity-type
   id->stale       :- [:map-of ms/PositiveInt ms/IntGreaterThanOrEqualToZero]
   current-version :- ms/PositiveInt]
  (doseq [[stale ids] (u/group-by val key conj [] id->stale)
          batch       (partition-all mdb/update-partition-size ids)]
    (t2/update! :model/DependencyStatus :entity_type entity-type :entity_id [:in (vec batch)] :stale stale
                {:stale 0 :fail_count 0 :analysis_version current-version})))

(mu/defn dependency-pending? :- :boolean
  "Whether an entity of the type `entity-type` has no DependencyStatus, or one that counts a write or records a version
  of the dependency logic below `current-version`."
  [entity-type     :- ::deps.dependency-types/dependency-types
   current-version :- ms/PositiveInt]
  (boolean (seq (pending-statuses entity-type :model/DependencyStatus 1 current-version {}))))

(mu/defn take-pending-dependency-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` entities of the type `entity-type` without a DependencyStatus, or whose status counts a write or
  records a version of the dependency logic below `current-version`, outdated ones last, with the `stale` count the job
  clears afterwards."
  [entity-type     :- ::deps.dependency-types/dependency-types
   batch-size      :- ms/PositiveInt
   current-version :- ms/PositiveInt]
  (take-pending-statuses! entity-type :model/DependencyStatus batch-size current-version {}))

;;; ------------------------------------------- Result metadata job -------------------------------------------

(mu/defn take-pending-result-metadata-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` MBQL cards Metabase did not create itself without a ResultMetadataStatus, or whose status counts a
  write or records a version of the logic below `current-version`, and whose dependencies the dependency logic of
  `dependency-version` computed, outdated ones last, with the `stale` count the job clears afterwards."
  [batch-size         :- ms/PositiveInt
   current-version    :- ms/PositiveInt
   dependency-version :- ms/PositiveInt]
  (take-pending-statuses! :card :model/ResultMetadataStatus batch-size current-version
                          {:user-mbql-only?    true
                           :dependency-version dependency-version}))

(mu/defn record-result-metadata-failure! :- :boolean
  "Record that the result metadata job failed to re-derive the Card with `card-id`, giving up on it until a write
  changes it once it failed `max-failures` times in a row, returning whether it gave up."
  [card-id      :- ::lib.schema.id/card
   max-failures :- ms/PositiveInt]
  (record-failure! :model/ResultMetadataStatus :card card-id max-failures))

(mu/defn clear-result-metadata-statuses!
  "Record that the result metadata job re-derived the Cards whose ids are the keys of `id->stale` with the logic of
  `current-version`, clearing each count of `stale` writes unless a write raised it, with one update for each distinct
  count and partition of ids."
  [id->stale       :- [:map-of ::lib.schema.id/card ms/IntGreaterThanOrEqualToZero]
   current-version :- ms/PositiveInt]
  (doseq [[stale ids] (u/group-by val key conj [] id->stale)
          batch       (partition-all mdb/update-partition-size ids)]
    (t2/update! :model/ResultMetadataStatus :entity_type :card :entity_id [:in (vec batch)] :stale stale
                {:stale 0 :fail_count 0 :analysis_version current-version})))

(mu/defn result-metadata-deleted-card-ids :- [:sequential ::lib.schema.id/card]
  "Up to `batch-size` IDs of deleted Cards that still have a ResultMetadataStatus."
  [batch-size :- ms/PositiveInt]
  (deleted-entity-ids-with-status :model/ResultMetadataStatus :card batch-size))

(mu/defn delete-result-metadata-statuses!
  "Delete the ResultMetadataStatuses of the Cards with `card-ids`, returning the number deleted."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/ResultMetadataStatus :entity_type :card :entity_id [:in %]) card-ids))

(mu/defn remapped-table-ids :- [:set ::lib.schema.id/table]
  "The IDs of the Tables of the Fields remapped to one of the Fields with `field-ids` as their human-readable field."
  [field-ids :- [:set ::lib.schema.id/field]]
  (into #{} (mdb/select-batched #(t2/select-fn-set :table_id [:model/Field (u/qualified-key (t2/table-name :model/Field) :table_id)]
                                                   {:from  [(t2/table-name :model/Field)]
                                                    :join  [(t2/table-name :model/Dimension) [:= (u/qualified-key (t2/table-name :model/Dimension) :field_id) (u/qualified-key (t2/table-name :model/Field) :id)]]
                                                    :where [:in (u/qualified-key (t2/table-name :model/Dimension) :human_readable_field_id) %]})
                                field-ids)))

(mu/defn internal-remap-field-ids :- [:set ::lib.schema.id/field]
  "The ids of the Fields among `field-ids` that have an internal remap, which shows their FieldValues' human-readable
  values."
  [field-ids :- [:sequential {:min 1} ::lib.schema.id/field]]
  (into #{} (mdb/select-batched #(t2/select-fn-set :field_id :model/Dimension :field_id [:in %] :type "internal")
                                field-ids)))

(mu/defn card-states :- [:map-of ::lib.schema.id/card ::dependencies.schema/card-state]
  "The `updated_at` and `result_metadata` of each of the Cards with `card-ids`, by Card id, read in the order of their
  ids and, when `lock?`, locking their rows in that order until the transaction ends, the id read as `:card_id` since a
  Card read with its `:id` and some of the columns its schema governs must have all of them."
  [card-ids :- [:sequential {:min 1} ::lib.schema.id/card]
   lock?    :- :boolean]
  (into {}
        (map (fn [card] [(:card_id card) (select-keys card [:updated_at :result_metadata])]))
        (mdb/select-batched #(t2/select [:model/Card [:id :card_id] :updated_at :result_metadata]
                                        (cond-> {:where [:in :id %] :order-by [[:id :asc]]} lock? (assoc :for :update)))
                            (sort card-ids))))

;;; ------------------------------------------- Analysis finding job -------------------------------------------

(defn- upsert-findings-query
  "The statement that inserts the AnalysisFinding of each of the `[entity-id result]` pairs `rows` of `entity-type` or
  sets its `result` when its unique key exists, stamping `analyzed_at` with the database clock only when the `result`
  differs, on the app DB `db-type`."
  [db-type entity-type rows]
  (let [table      (t2/table-name :model/AnalysisFinding)
        row-values (fn [now] (mapv (fn [[entity-id result]]
                                     {:entity_type (name entity-type) :entity_id entity-id :result result :analyzed_at now})
                                   rows))]
    (case db-type
      :postgres
      {:insert-into   table
       :values        (row-values [:now])
       :on-conflict   [:entity_type :entity_id :worktree_id]
       :do-update-set (array-map :analyzed_at [:case [:<> (u/qualified-key table :result) :excluded.result] [:now]
                                               :else (u/qualified-key table :analyzed_at)]
                                 :result      :excluded.result)}

      :mysql
      {:insert-into             table
       :values                  (row-values [:now 6])
       :on-duplicate-key-update (array-map :analyzed_at [:case [:<> :result [:values :result]] [:now 6] :else :analyzed_at]
                                           :result      [:values :result])}

      :h2
      {:merge-into              [table :t]
       :using                   [(with-meta
                                  {:union-all (mapv (fn [[entity-id result]]
                                                      ^:allow-subquery
                                                      {:select [[[:cast (name entity-type) [:varchar 254]] :entity_type]
                                                                [[:cast entity-id :integer] :entity_id]
                                                                [[:cast result :boolean] :result]]})
                                                    rows)}
                                  {:allow-subquery true})
                                 :s]
       :on                      [:and [:= :t.entity_type :s.entity_type] [:= :t.entity_id :s.entity_id]]
       :when-matched-update-set (array-map :analyzed_at [:case [:<> :t.result :s.result] [:now] :else :t.analyzed_at]
                                           :result      :s.result)
       :when-not-matched-insert [[:entity_type :entity_id :result :analyzed_at]
                                 [:s.entity_type :s.entity_id :s.result [:now]]]})))

(mu/defn upsert-findings!
  "Insert or update the AnalysisFinding of each entity of `entity-type` that `id->result` maps to its `result`, with
  one statement for each `mdb/create-partition-size` of them, stamping `analyzed_at` when it inserts or the `result`
  changes."
  [entity-type :- ::dependencies.schema/entity-type
   id->result  :- [:map-of ms/PositiveInt :boolean]]
  (doseq [rows (partition-all mdb/create-partition-size id->result)]
    (t2/query (upsert-findings-query (mdb/db-type) entity-type rows)))
  nil)

(mu/defn take-pending-analysis-finding-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` entities of the type `entity-type` without an AnalysisFindingStatus, or whose status counts a
  write or records an analysis below `current-version`, and whose dependencies the analysis of `dependency-version`
  computed, outdated ones last, with the `stale` count the job clears afterwards."
  [entity-type        :- ::deps.dependency-types/dependency-types
   batch-size         :- ms/PositiveInt
   current-version    :- ms/PositiveInt
   dependency-version :- ms/PositiveInt]
  (take-pending-statuses! entity-type :model/AnalysisFindingStatus batch-size current-version
                          {:dependency-version dependency-version}))

(mu/defn record-analysis-finding-failure! :- :boolean
  "Record that the analysis job failed to analyze the entity `entity-type` `entity-id`, giving up on it until a write changes it once it failed
  `max-failures` times in a row, returning whether it gave up."
  [entity-type  :- ::dependencies.schema/entity-type
   entity-id    :- ms/PositiveInt
   max-failures :- ms/PositiveInt]
  (record-failure! :model/AnalysisFindingStatus entity-type entity-id max-failures))

(mu/defn clear-analysis-finding-statuses!
  "Record that the analysis job analyzed the entities `entity-type` whose ids are the keys of `id->stale` with the
  analysis of `current-version`, clearing each count of `stale` writes unless a write raised it, with one update for
  each distinct count and partition of ids."
  [entity-type     :- ::dependencies.schema/entity-type
   id->stale       :- [:map-of ms/PositiveInt ms/IntGreaterThanOrEqualToZero]
   current-version :- ms/PositiveInt]
  (doseq [[stale ids] (u/group-by val key conj [] id->stale)
          batch       (partition-all mdb/update-partition-size ids)]
    (t2/update! :model/AnalysisFindingStatus :entity_type entity-type :entity_id [:in (vec batch)] :stale stale
                {:stale 0 :fail_count 0 :analysis_version current-version})))

(mu/defn analysis-finding-deleted-entity-ids :- [:sequential ms/PositiveInt]
  "Up to `batch-size` IDs of deleted entities of `entity-type` that still have an AnalysisFindingStatus."
  [entity-type :- ::deps.dependency-types/dependency-types
   batch-size  :- ms/PositiveInt]
  (deleted-entity-ids-with-status :model/AnalysisFindingStatus entity-type batch-size))

(mu/defn delete-analysis-finding-statuses!
  "Delete the AnalysisFindingStatuses of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/AnalysisFindingStatus :entity_type entity-type :entity_id [:in %]) entity-ids))

;; A transform has no `archived` column, and a segment lives under its table rather than in a collection.
(def ^:private failed-entity-columns
  {:card      {:archived? true,  :collection? true}
   :transform {:archived? false, :collection? true}
   :segment   {:archived? true,  :collection? false}})

(mu/defn failed-analysis-entities :- [:sequential [:map
                                                   [:id            ms/PositiveInt]
                                                   [:entity_id     :string]
                                                   [:name          :string]
                                                   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
                                                   [:given_up      [:maybe :boolean]]]]
  "The entities of `entity-type` whose analysis failed or whose dependencies the dependency job gave up computing, with
  `given_up` true for the latter, excluding archived and Metabase-managed content."
  [entity-type :- (into [:enum] (keys failed-entity-columns))]
  (let [model                           (dependencies/entity-model entity-type)
        {:keys [archived? collection?]} (failed-entity-columns entity-type)]
    (t2/query {:select    (cond-> [:entity.id :entity.entity_id :entity.name [:ds.terminal :given_up]]
                            collection? (conj :entity.collection_id))
               :from      [[(t2/table-name model) :entity]]
               :left-join [[(t2/table-name :model/AnalysisFinding) :af]
                           [:and
                            [:= :af.entity_id :entity.id]
                            [:= :af.entity_type (name entity-type)]]
                           [(t2/table-name :model/DependencyStatus) :ds]
                           [:and
                            [:= :ds.entity_id :entity.id]
                            [:= :ds.entity_type (name entity-type)]]]
               :where     (cond-> [:and
                                   [:or
                                    [:= :af.result false]
                                    [:= :ds.terminal true]]
                                   (mi/non-internal-filter-clause model :entity)]
                            archived? (conj [:= :entity.archived false]))
               :order-by  [[:entity.id :asc]]})))

;;; --------------------------------------------- Analysis finding errors ---------------------------------------------

(mu/defn finding-errors-for-entities
  "The AnalysisFindingErrors of the entities `entity-type` `entity-ids`, each entity's oldest first."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (into []
        (mapcat #(t2/select :model/AnalysisFindingError
                            :analyzed_entity_type entity-type
                            :analyzed_entity_id   [:in %]
                            {:order-by [[:id :asc]]}))
        (partition-all 1000 entity-ids)))

(mu/defn finding-errors-for-entity
  "The AnalysisFindingErrors of the entity `entity-type` `entity-id`."
  [entity-type :- ::dependencies.schema/entity-type
   entity-id   :- ms/PositiveInt]
  (t2/select :model/AnalysisFindingError :analyzed_entity_type entity-type :analyzed_entity_id entity-id))

(mu/defn finding-errors-from-source
  "The AnalysisFindingErrors caused by the entity `source-type` `source-id`."
  [source-type :- [:maybe :metabase.lib.schema.validate/source-entity-type]
   source-id   :- ms/PositiveInt]
  (t2/select :model/AnalysisFindingError :source_entity_type source-type :source_entity_id source-id))

(mu/defn insert-finding-errors!
  "Insert the AnalysisFindingError `rows`, returning the number inserted."
  [rows :- [:sequential (mut/select-keys ::dependencies.schema/analysis-finding-error.update [:analyzed_entity_type :analyzed_entity_id :error_type :error_detail :source_entity_type :source_entity_id])]]
  (transduce (map #(t2/insert! :model/AnalysisFindingError (vec %))) + 0 (partition-all mdb/create-partition-size rows)))

(mu/defn delete-finding-errors-for-entities!
  "Delete the AnalysisFindingErrors of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/AnalysisFindingError :analyzed_entity_type entity-type :analyzed_entity_id [:in %]) entity-ids))
