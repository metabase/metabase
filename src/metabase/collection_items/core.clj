(ns metabase.collection-items.core
  "Fetching the child items of a Collection (or the Root Collection) -- the domain logic behind
  the `/api/collection/:id/items` and `/api/collection/root/items` REST endpoints, callable directly by non-REST
  consumers such as the MCP tools.

  [[collection-children]] unions one query per child model (cards, dashboards, collections,
  snippets, transforms, ...), permission-filtered and sorted server-side; paging rides
  [[metabase.request.core/limit]]/[[metabase.request.core/offset]] (bind them with
  [[metabase.request.core/with-limit-and-offset]] outside a REST request).

  Callers that page over `:document` rows should scope
  [[metabase.documents.core/with-content-gate-cache]] around the [[collection-children]] call:
  the `:can_write` hydration on each document row adjudicates that document's content gate, and
  the cache keeps that to once per document. The binding can't live here -- `documents` already
  depends on `collections`, so requiring it back would be circular."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collection-items.spec :as collection-items.spec]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.resolution :as models.resolution]
   [metabase.request.core :as request]
   [metabase.revisions.schema :as revisions.schema]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def CollectionType
  "Collection types that the root/items endpoint can filter on"
  [:enum "remote-synced"])

(def ^:private FilterableCollectionType
  "Collection types that [[collection-children]] and [[metabase.collections.children/select-collections]] can filter on: remote-synced collections,
  or those of a Library type."
  (into [:enum "remote-synced"] (sort collection/library-collection-types)))

(def ^:private valid-model-param-values
  "Valid values for the `?model=` param accepted by the collection-items endpoints.
  `no_models` is for nilling out the set because a nil model set is actually the total model set"
  #{"action"
    "card"                              ; SavedQuestion
    "dataset"                           ; Model. TODO : update this
    "document"
    "exploration"
    "metric"
    "collection"
    "dashboard"
    "pulse"                             ; I think the only kinds of Pulses we still have are Alerts?
    "snippet"
    "no_models"
    "timeline"
    "table"
    "transform"
    "measure"})

(def ^:private ModelString
  (into [:enum] valid-model-param-values))

(def Models
  "This is basically a union type. [[api.macros/defendpoint]] splits the string if it only gets one."
  [:vector {:decode/string (fn [x] (cond (vector? x) x x [x]))} ModelString])

(def valid-pinned-state-values
  "Valid values for the `?pinned-state=` param accepted by endpoints in this namespace."
  #{"all" "is_pinned" "is_not_pinned"})

(def valid-sort-columns
  "Valid values for the `?sort-column=` param accepted by the collection-items endpoints."
  #{"name" "last_edited_at" "last_edited_by" "model" "description"})
(def valid-sort-directions
  "Valid values for the `?sort-direction=` param accepted by the collection-items endpoints."
  #{"asc" "desc"})
(defn normalize-sort-choice
  "Normalize a sort param string to the keyword form [[collection-children]] expects."
  [w]
  (when w (keyword (str/replace w #"_" "-"))))

(def CollectionChildrenOptions
  "The `options` map accepted by [[collection-children]] and [[collection-filter-metadata]]."
  [:map {:closed true}
   [:show-dashboard-questions?     :boolean]
   [:show-exploration-documents?   {:optional true} [:maybe :boolean]]
   [:collection-types {:optional true} [:maybe [:set FilterableCollectionType]]]
   [:archived?                     :boolean]
   [:include-library?               {:optional true} [:maybe :boolean]]
   [:pinned-state {:optional true} [:maybe (into [:enum] (map keyword) valid-pinned-state-values)]]
   ;; when specified, only return results of this type.
   [:models       {:optional true} [:maybe [:set (into [:enum] (map keyword) valid-model-param-values)]]]
   ;; when set, restrict results to items created by this user id; types of item that do not record a creator
   ;; return nothing.
   [:created-by-id {:optional true} [:maybe pos-int?]]
   [:search-text  {:optional true} [:maybe :string]]
   [:sort-info    {:optional true} [:maybe [:map {:closed true}
                                            [:sort-column (into [:enum {:error/message "sort-columns"}]
                                                                (map normalize-sort-choice)
                                                                valid-sort-columns)]
                                            [:sort-direction (into [:enum {:error/message "sort-direction"}]
                                                                   (map normalize-sort-choice)
                                                                   valid-sort-directions)]
                                            [:official-collections-first? {:optional true} :boolean]]]]])

(defn- search-text-clause
  "Match every token in `search-text` against an item's name or last editor's first or last name."
  [search-text]
  (when-not (str/blank? search-text)
    (when-let [tokens (->> (str/split (u/lower-case-en (str/trim search-text)) #"\s+")
                           (filter seq)
                           not-empty)]
      (into [:and]
            (for [token tokens
                  :let  [pattern (h2x/like-substring token)]]
              [:or
               [:like [:lower :name] pattern]
               [:like [:lower :last_edit_first_name] pattern]
               [:like [:lower :last_edit_last_name] pattern]])))))

(def ^:private last-edit-key-mapping
  {:last_edit_user       :id
   :last_edit_last_name  :last_name
   :last_edit_first_name :first_name
   :last_edit_email      :email
   :last_edit_timestamp  :timestamp})

;;; TODO -- consider whether this function belongs here or in [[metabase.revisions.models.revision.last-edit]]
(mu/defn- coalesce-edit-info :- ::revisions.schema/maybe-annotated
  "Hoist all of the last edit information into a map under the key :last-edit-info. Considers this information present
  if `:last_edit_user` is not nil."
  [row :- [:map {:closed true}
           [:last_edit_user       {:optional true} [:maybe :int]]
           [:last_edit_last_name  {:optional true} [:maybe :string]]
           [:last_edit_first_name {:optional true} [:maybe :string]]
           [:last_edit_email      {:optional true} [:maybe :string]]
           [:last_edit_timestamp  {:optional true} [:maybe ms/TemporalInstant]]]]
  (letfn [(select-as [original k->k']
            (reduce (fn [m [k k']] (assoc m k' (get original k)))
                    {}
                    k->k'))]
    (cond-> {}
      ;; don't use contains as they all have the key, we care about a value present
      (:last_edit_user row) (assoc :last-edit-info (select-as row last-edit-key-mapping)))))

(defn- remove-unwanted-keys [{:keys [model] :as row}]
  (cond-> (dissoc row :model_ranking :archived_directly :total_count :collection_type)
    (not= model "collection") (dissoc :type)))

(def ^:private item-specs*
  (memoize/fifo
   (fn [_spec-methods]
     (models.resolution/spec-entries-by-name collection-items.spec/spec))
   :fifo/threshold 1))

(defn- item-specs
  "The model and the collection items spec of each type of item, as `[model spec]`, by the name of the type."
  []
  (item-specs* (methods collection-items.spec/spec)))

(defn post-process-rows
  "Post process any data. Have a chance to process all of the same type at once using the `:hydrate` of its spec. Must
  respect the order passed in."
  [options collection rows]
  (->> (map-indexed (fn [i row] (vary-meta row assoc ::index i)) rows) ;; keep db sort order
       (group-by :model)
       (into []
             (comp (map (fn [[model rows]]
                          (if-let [hydrate (:hydrate (second (get (item-specs) model)))]
                            (hydrate collection options rows)
                            rows)))
                   cat
                   (map (fn [row]
                          (merge (apply dissoc row (keys last-edit-key-mapping))
                                 (coalesce-edit-info (select-keys row (keys last-edit-key-mapping))))))))
       (map remove-unwanted-keys)
       ;; the collection these are presented "in" is the ID of the collection we're getting `/items` on.
       (map #(assoc % :collection_id (:id collection)))
       (sort-by (comp ::index meta))))

(defn- select-name
  "Takes a honeysql select column and returns a keyword of which column it is.

  eg:
  (select-name :id) -> :id
  (select-name [(literal \"card\") :model]) -> :model
  (select-name :p.id) -> :id"
  [x]
  (if (vector? x)
    (recur (second x))
    (-> x name (str/split #"\.") peek keyword)))

(def ^:private all-select-columns
  "All columns that need to be present for the union-all. Generated with the comment form below. Non-text columns that
  are optional (not id, but last_edit_user for example) must have a type so that the union-all can unify the nil with
  the correct column type."
  [:id :name :description :entity_id :display :dataset_query
   :collection_id
   [:dashboard_id :integer]
   [:archived_directly :boolean]
   :model :collection_position :authority_level [:personal_owner_id :integer] :location
   :last_edit_email :last_edit_first_name :last_edit_last_name :moderated_status :icon
   [:last_edit_user :integer] [:last_edit_timestamp :timestamp] [:database_id :integer]
   :collection_type :type [:archived :boolean] [:last_used_at :timestamp] [:is_remote_synced :boolean] :namespace
   ;; for determining whether a model is based on a csv-uploaded table
   [:table_id :integer] [:is_upload :boolean] :query_type])

(defn- add-missing-columns
  "Ensures that all necessary columns are in the select-columns collection, adding `[nil :column]` as necessary."
  [select-columns necessary-columns]
  (let [columns (m/index-by select-name select-columns)]
    (map (fn [col]
           (let [[col-name type'] (u/one-or-many col)]
             (get columns col-name (if (and type' (= (mdb/db-type) :postgres))
                                     [(h2x/cast type' nil) col-name]
                                     [nil col-name]))))
         necessary-columns)))

(def ^:private default-rank
  "The rank of a type of item, when sorting by type, that has no `:rank` in its spec."
  100)

(defn- add-model-ranking
  [select-clause rank]
  (conj select-clause [[:inline rank] :model_ranking]))

(defn- official-collections-first-sort-clause [{:keys [official-collections-first?]}]
  (when official-collections-first?
    [:authority_level :asc-nulls-last]))

(def ^:private normal-collections-first-sort-clause
  [:type :asc-nulls-first])

(defn children-sort-clause
  "Given the client side sort-info, return sort clause to effect this. `db-type` is necessary due to complications from
  treatment of nulls in the different app db types."
  [sort-info db-type]
  (into []
        (comp cat
              (remove nil?))
        [[(official-collections-first-sort-clause sort-info)]
         [normal-collections-first-sort-clause]
         (case ((juxt :sort-column :sort-direction) sort-info)
           [nil nil]               [[:%lower.name :asc]]
           [:name :asc]            [[:%lower.name :asc]]
           [:name :desc]           [[:%lower.name :desc]]
           [:last-edited-at :asc]  [(if (= db-type :mysql)
                                      [:%isnull.last_edit_timestamp]
                                      [:last_edit_timestamp :nulls-last])
                                    [:last_edit_timestamp :asc]
                                    [:%lower.name :asc]]
           [:last-edited-at :desc] [(case db-type
                                      :mysql    [:%isnull.last_edit_timestamp]
                                      :postgres [:last_edit_timestamp :desc-nulls-last]
                                      :h2       nil)
                                    [:last_edit_timestamp :desc]
                                    [:%lower.name :asc]]
           [:last-edited-by :asc]  [(if (= db-type :mysql)
                                      [:%isnull.last_edit_last_name]
                                      [:last_edit_last_name :nulls-last])
                                    [:last_edit_last_name :asc]
                                    (if (= db-type :mysql)
                                      [:%isnull.last_edit_first_name]
                                      [:last_edit_first_name :nulls-last])
                                    [:last_edit_first_name :asc]
                                    [:%lower.name :asc]]
           [:last-edited-by :desc] [(case db-type
                                      :mysql    [:%isnull.last_edit_last_name]
                                      :postgres [:last_edit_last_name :desc-nulls-last]
                                      :h2       nil)
                                    [:last_edit_last_name :desc]
                                    (case db-type
                                      :mysql    [:%isnull.last_edit_first_name]
                                      :postgres [:last_edit_last_name :desc-nulls-last]
                                      :h2       nil)
                                    [:last_edit_first_name :desc]
                                    [:%lower.name :asc]]
           [:model :asc]           [[:model_ranking :asc]  [:%lower.name :asc]]
           [:model :desc]          [[:model_ranking :desc] [:%lower.name :asc]]
           [:description :asc]     [[:%lower.description :asc-nulls-last] [:%lower.name :asc]]
           [:description :desc]    [[:%lower.description :desc-nulls-last] [:%lower.name :asc]])
         ;; add a fallback sort order so paging is still deterministic even if collection have the same name or
         ;; whatever
         [[:id :asc]]]))

(defn- total-count
  "The size of the whole result set `rows` is a page of, read off the `total_count` window column.

  A page past the end of the result set comes back empty and so carries no window column; in that case read the count
  off the first row of the same query without its pagination."
  [rows rows-query offset]
  (or (some-> rows first :total_count)
      (when (pos? (or offset 0))
        (some-> (collections.db/collection-children-rows (assoc rows-query :limit 1)) first :total_count))
      0))

(defn- collection-children*
  [collection queries {:keys [sort-info search-text] :as options}]
  (let [sql-order     (children-sort-clause sort-info (mdb/db-type))
        models        (keys queries)
        specs         (item-specs)
        queries       (for [[model query] queries
                            :let  [select-clause-type (some
                                                       (fn [k]
                                                         (when (get query k)
                                                           k))
                                                       [:select :select-distinct])]]
                        (-> query
                            (update select-clause-type add-missing-columns all-select-columns)
                            (update select-clause-type add-model-ranking (:rank (second (get specs (name model))) default-rank))))
        search-clause (search-text-clause search-text)
        rows-query    (cond-> {:select   [:* [[:over [[:count :*] ^:allow-subquery {}]] :total_count]]
                               :from     [[^:allow-subquery {:union-all queries} :dummy_alias]]
                               :order-by sql-order}
                        search-clause
                        (sql.helpers/where search-clause))
        limit         (request/limit)
        offset        (request/offset)
        count-only?   (= limit 0)
        ;; We didn't implement collection pagination for snippets namespace for root/items
        ;; Rip out the limit for now and put it back in when we want it. A count-only request still
        ;; needs a LIMIT so it doesn't fetch the whole snippets table just to read :total_count.
        limit-query   (if (or
                           (nil? limit)
                           (nil? offset)
                           (and (= (:collection-namespace options) "snippets")
                                (not count-only?)))
                        rows-query
                        (assoc rows-query
                               ;; If limit is 0, we still execute the query with a limit of 1 so that we fetch a
                               ;; :total_count
                               :limit  (if count-only? 1 limit)
                               :offset offset))
        rows          (tracing/with-span :db-app "db-app.collection-items-query" {:collection/id (:id collection)}
                        (collections.db/collection-children-rows limit-query))
        res           {:total  (total-count rows rows-query offset)
                       :data   (if count-only?
                                 []
                                 (tracing/with-span :db-app "db-app.collection-items-post-process" {:collection/id (:id collection)}
                                   (post-process-rows options collection rows)))
                       :models models}
        limit-res     (assoc res
                             :limit  (request/limit)
                             :offset (request/offset))]
    (if (= (:collection-namespace options) "snippets")
      res
      limit-res)))

(defn- applicable-item-names
  "The keyword of the name of each type of item of `models`, every type when `models` is empty, whose model a Collection
  of the namespace of `collection` can hold, in name order."
  [collection models]
  (let [collection-namespace (keyword (:namespace collection))]
    (into (sorted-set)
          (keep (fn [[item-name [model]]]
                  (let [item (keyword item-name)]
                    (when (and (or (empty? models) (contains? models item))
                               (collection/namespace-allowed? model collection-namespace))
                      item))))
          (item-specs))))

(defn- item-queries
  "The query of each type of item of `models`, every type when `models` is empty, that lists some items in `collection`
  under `options`, by the keyword of the name of the type, in name order. A Collection of a namespace that does not hold
  the model of a type lists no item of the type."
  [collection models options]
  (let [applicable (applicable-item-names collection models)]
    (into (sorted-map)
          (keep (fn [[item-name [_model {:keys [items]}]]]
                  (let [item (keyword item-name)]
                    (when (contains? applicable item)
                      (when-let [query (items collection options)]
                        [item (vary-meta query assoc :allow-subquery true)])))))
          (item-specs))))

(mu/defn collection-children
  "Fetch a sequence of 'child' objects belonging to a Collection, filtered using `options`."
  [{collection-namespace :namespace, :as collection} :- collection/CollectionWithLocationAndIDOrRoot
   {:keys [models], :as options}                     :- CollectionChildrenOptions]
  (let [options (assoc options :collection-namespace collection-namespace)
        queries (item-queries collection models options)]
    (if (seq queries)
      (collection-children* collection queries options)
      {:total  0
       :data   []
       :limit  (request/limit)
       :offset (request/offset)
       :models []})))

(defn- filterable-queries
  "The queries of the types of items that can be a filterable item of `collection`, by the keyword of their name. Snippets
  are never included: they are not a filterable type. When present, `restrict-models` limits the set."
  [collection restrict-models options]
  (into (sorted-map)
        (remove (comp #{:snippet} key))
        (item-queries collection restrict-models options)))

(defn filterable-models
  "The models that can appear as a filterable item of `collection`, found without building their queries. Snippets are
  never included: they are not a filterable type. When present, `restrict-models` limits the set."
  [collection restrict-models]
  (vec (disj (applicable-item-names collection restrict-models) :snippet)))

(mu/defn collection-filter-metadata :- [:map
                                        [:available_models [:sequential :string]]]
  "Return the models that have at least one visible item in `collection`. Respect the requested scope and visibility,
  but ignore model and search filters. When present, `restrict-models` limits the candidate models. Snippets are never
  reported: they are not a filterable type."
  [collection                      :- collection/CollectionWithLocationAndIDOrRoot
   restrict-models                 :- [:maybe [:set :keyword]]
   options                         :- CollectionChildrenOptions]
  (let [options (-> options
                    (dissoc :models :search-text)
                    (assoc :collection-namespace (:namespace collection)))
        queries (filterable-queries collection restrict-models options)]
    ;; This result is independent of search and model filters. Requesting it with every filter update
    ;; repeats the same EXISTS probes; a separately cached request could avoid that work.
    (if (empty? queries)
      {:available_models []}
      (let [row (first
                 (collections.db/collection-filter-metadata-rows
                  {:select (vec
                            (for [[model query] queries]
                              [[:exists query] model]))}))]
        {:available_models
         (->> (keys queries)
              (keep (fn [model]
                      (when (api/bit->boolean (get row model))
                        (name model))))
              sort
              vec)}))))

(defn visible-model-kwds
  "If you pass in explicitly keywords that you can't see, you can't see them.
  But there is an exception for the collections,
  because you might not be able to see the top-level collections
  but be able to see, children of those invisible top-level collections."
  [root-collection model-set]
  (if (mi/can-read? (t2/hydrate root-collection :can_read))
    model-set
    (if (or (empty? model-set) (contains? model-set :collection))
      #{:collection}
      #{:no_models})))

(def namespaces-holding-non-collection-types
  "We can't really *know* what namespace something with a `nil` `collection_id` is in, unless it's one of the special
  types that can only live in one namespace.

  If you're looking in the root collection of one of these namespaces, we'll allow you to list any type of model.

  Otherwise, we'll just show you collections."
  #{nil "snippets" "transforms" "data-actions"})
