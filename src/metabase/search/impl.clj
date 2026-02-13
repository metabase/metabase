(ns metabase.search.impl
  (:require
   [clojure.string :as str]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.config :as search.config :refer [SearchableModel SearchContext]]
   [metabase.search.engine :as search.engine]
   [metabase.search.filter :as search.filter]
   [metabase.search.in-place.filter :as search.in-place.filter]
   [metabase.search.in-place.scoring :as scoring]
   [metabase.tracing.core :as tracing]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(defmulti ^:private check-permissions-for-model
  {:arglists '([search-ctx search-result])}
  (fn [_search-ctx search-result] ((comp keyword :model) search-result)))

(defmacro ^:private ensure-current-user-perms-set-is-bound
  "TODO FIXME -- search actually currently still requires [[metabase.api.common/*current-user-permissions-set*]] to be
  bound (since [[mi/can-write?]] and [[mi/can-read?]] depend on it) despite search context requiring
  `:current-user-perms` to be passed in. We should fix things so search works independently of API-specific dynamic
  variables. This might require updating `can-read?` and `can-write?` to take explicit perms sets instead of relying
  on dynamic variables."
  {:style/indent 0}
  [current-user-perms & body]
  `(with-bindings {(requiring-resolve 'metabase.api.common/*current-user-permissions-set*) (atom ~current-user-perms)}
     ~@body))

(defn- can-write? [{:keys [current-user-perms]} instance]
  (ensure-current-user-perms-set-is-bound current-user-perms (mi/can-write? instance)))

(defn- can-read? [{:keys [current-user-perms]} instance]
  (ensure-current-user-perms-set-is-bound current-user-perms (mi/can-read? instance)))

(defmethod check-permissions-for-model :default
  [search-ctx instance]
  (if (:archived? search-ctx)
    (can-write? search-ctx instance)
    ;; We filter what we can (i.e., everything in a collection) out already when querying
    true))

(defmethod check-permissions-for-model :document
  [search-ctx instance]
  (if (:archived? search-ctx)
    (can-write? search-ctx instance)
    true))

;; TODO: remove this implementation now that we check permissions in the SQL, leaving it in for now to guard against
;; issue with new pure sql implementation
(defmethod check-permissions-for-model :table
  [search-ctx instance]
  ;; we've already filtered out tables w/o collection permissions in the query itself.
  (let [instance-id (:id instance)
        user-id     (:current-user-id search-ctx)
        db-id       (database/table-id->database-id instance-id)]
    (and
     (perms/user-has-permission-for-table? user-id :perms/view-data :unrestricted db-id instance-id)
     (perms/user-has-permission-for-table? user-id :perms/create-queries :query-builder db-id instance-id))))

(defmethod check-permissions-for-model :indexed-entity
  [search-ctx instance]
  (let [user-id (:current-user-id search-ctx)
        db-id   (:database_id instance)]
    (and
     (= :query-builder-and-native (perms/full-db-permission-for-user user-id :perms/create-queries db-id))
     (= :unrestricted (perms/full-db-permission-for-user user-id :perms/view-data db-id)))))

(defmethod check-permissions-for-model :metric
  [search-ctx instance]
  (if (:archived? search-ctx)
    (can-write? search-ctx instance)
    (can-read? search-ctx instance)))

(defmethod check-permissions-for-model :segment
  [search-ctx instance]
  (if (:archived? search-ctx)
    (can-write? search-ctx instance)
    (can-read? search-ctx instance)))

(defmethod check-permissions-for-model :database
  [search-ctx instance]
  (if (:archived? search-ctx)
    (can-write? search-ctx instance)
    (can-read? search-ctx instance)))

(defn- hydrate-user-metadata
  "Hydrate common-name for last_edited_by and created_by for each result."
  [results]
  (let [user-ids             (set (flatten (for [result results]
                                             (remove nil? ((juxt :last_editor_id :creator_id) result)))))
        user-id->common-name (if (pos? (count user-ids))
                               (t2/select-pk->fn :common_name [:model/User :id :first_name :last_name :email] :id [:in user-ids])
                               {})]
    (mapv (fn [{:keys [creator_id last_editor_id] :as result}]
            (assoc result
                   :creator_common_name (get user-id->common-name creator_id)
                   :last_editor_common_name (get user-id->common-name last_editor_id)))
          results)))

(defn add-dataset-collection-hierarchy
  "Adds `collection_effective_ancestors` to *datasets* in the search results."
  [search-results]
  (let [annotate     (fn [result]
                       (cond-> result
                         (= (:model result) "dataset")
                         (assoc :collection_effective_ancestors
                                (->> (t2/hydrate
                                      (if (nil? (:collection_id result))
                                        collection/root-collection
                                        {:location (:collection_location result)})
                                      :effective_ancestors)
                                     :effective_ancestors
                                      ;; two pieces for backwards compatibility:
                                      ;; - remove the root collection
                                      ;; - remove the `personal_owner_id`
                                     (remove collection.root/is-root-collection?)
                                     (map #(dissoc % :personal_owner_id))))))]
    (map annotate search-results)))

(defn- add-collection-effective-location
  "Batch-hydrates `:effective_location` and `:effective_parent` on collection search results.
  Keeps search results in order."
  [search-results]
  (let [collections    (filter #(mi/instance-of? :model/Collection %) search-results)
        hydrated-colls (t2/hydrate collections :effective_parent)
        idx->coll      (into {} (map (juxt :id identity) hydrated-colls))]
    (map (fn [search-result]
           (if (mi/instance-of? :model/Collection search-result)
             (idx->coll (:id search-result))
             (assoc search-result :effective_location nil)))
         search-results)))

(def ^:private ^:const displayed-columns
  "All the result components that by default are displayed by the frontend."
  #{:name :display_name :collection_name :description})

;;; TODO OMG mix of kebab-case and snake_case here going to make me throw up, we should use all kebab-case in Clojure
;;; land and then convert the stuff that actually gets sent over the wire in the REST API to snake_case in the API
;;; endpoint itself, not in the search impl.
(defn serialize
  "Massage the raw result from the DB and match data into something more useful for the client"
  [{:as result :keys [all-scores relevant-scores name display_name collection_id collection_name
                      collection_authority_level collection_type collection_effective_ancestors effective_parent
                      archived_directly model]}]
  (let [matching-columns    (into #{} (keep :column relevant-scores))
        match-context-thunk (some :match-context-thunk relevant-scores)
        remove-thunks       (partial mapv #(dissoc % :match-context-thunk))
        use-display-name?   (and display_name
                                 ;; This collection will be empty unless we used in-place matching.
                                 ;; For now, for simplicity and performance reasons, we are not bothering to check
                                 ;; *where* the matches in the tsvector came from.
                                 (or (empty? matching-columns)
                                     (contains? matching-columns :display_name)))]
    (-> result
        (assoc
         :name           (if use-display-name? display_name name)
         :context        (when (and match-context-thunk
                                    (empty?
                                     (remove matching-columns displayed-columns)))
                           (match-context-thunk))
         :collection     (if (and archived_directly (not= "collection" model))
                           (select-keys (collection/trash-collection)
                                        [:id :name :authority_level :type])
                           (merge {:id              (if (and (nil? collection_id) (some? collection_name))
                                                      "root"
                                                      collection_id)
                                   :name            collection_name
                                   :authority_level collection_authority_level
                                   :type            collection_type}
                                  ;; for non-root collections, override :collection with the values for its effective parent
                                  effective_parent
                                  (when collection_effective_ancestors
                                    {:effective_ancestors collection_effective_ancestors})))
         :scores          (remove-thunks all-scores))
        (dissoc
         :all-scores
         :dataset_query
         :relevant-scores
         :collection_effective_ancestors
         :collection_id
         :collection_location
         :collection_name
         :collection_type
         :archived_directly
         :display_name
         :effective_parent)
        (cond-> (= model "transform")
          (dissoc :source :target)))))

(defn- bit->boolean
  "Coerce a bit returned by some MySQL/MariaDB versions in some situations to Boolean."
  [v]
  (if (number? v)
    (not (zero? v))
    v))

(defn- parse-engine [value]
  (or (when-not (str/blank? value)
        (let [engine (keyword "search.engine" value)]
          (cond
            (not (search.engine/known-engine? engine))
            (log/warnf "Search-engine is unknown: %s" value)

            (not (search.engine/supported-engine? engine))
            (log/warnf "Search-engine is not supported: %s" value)

            :else
            engine)))
      (search.engine/default-engine)))

;; This forwarding is here for tests, we should clean those up.

(defn- apply-default-engine [{:keys [search-engine] :as search-ctx}]
  (let [default (search.engine/default-engine)]
    (when (= default search-engine)
      (throw (ex-info "Missing implementation for default search-engine" {:search-engine search-engine})))
    (log/debugf "Missing implementation for %s so instead using %s" search-engine default)
    (assoc search-ctx :search-engine default)))

(defmethod search.engine/results :default [search-ctx]
  (search.engine/results (apply-default-engine search-ctx)))

(defmethod search.engine/model-set :default [search-ctx]
  (search.engine/model-set (apply-default-engine search-ctx)))

(mr/def ::search-context.input
  [:map {:closed true}
   [:search-string                                        [:maybe ms/NonBlankString]]
   [:context                             {:optional true} [:maybe :keyword]]
   [:models                                               [:maybe [:set SearchableModel]]]
   [:current-user-id                                      pos-int?]
   [:is-impersonated-user?               {:optional true} :boolean]
   [:is-sandboxed-user?                  {:optional true} :boolean]
   [:is-superuser?                                        :boolean]
   [:is-data-analyst?                    {:optional true} :boolean]
   [:current-user-perms                                   [:set perms/PathSchema]]
   [:archived                            {:optional true} [:maybe :boolean]]
   [:created-at                          {:optional true} [:maybe ms/NonBlankString]]
   [:created-by                          {:optional true} [:maybe [:set ms/PositiveInt]]]
   [:filter-items-in-personal-collection {:optional true} [:maybe [:enum "all" "only" "only-mine" "exclude" "exclude-others"]]]
   [:collection                          {:optional true} [:maybe ms/PositiveInt]]
   [:last-edited-at                      {:optional true} [:maybe ms/NonBlankString]]
   [:last-edited-by                      {:optional true} [:maybe [:set ms/PositiveInt]]]
   [:limit                               {:optional true} [:maybe ms/Int]]
   [:offset                              {:optional true} [:maybe ms/Int]]
   [:table-db-id                         {:optional true} [:maybe ms/PositiveInt]]
   [:search-engine                       {:optional true} [:maybe string?]]
   [:search-native-query                 {:optional true} [:maybe boolean?]]
   [:model-ancestors?                    {:optional true} [:maybe boolean?]]
   [:verified                            {:optional true} [:maybe true?]]
   [:ids                                 {:optional true} [:maybe [:set ms/PositiveInt]]]
   [:calculate-available-models?         {:optional true} [:maybe :boolean]]
   [:include-dashboard-questions?        {:optional true} [:maybe boolean?]]
   [:include-metadata?                   {:optional true} [:maybe boolean?]]
   [:non-temporal-dim-ids                {:optional true} [:maybe ms/NonBlankString]]
   [:has-temporal-dim                    {:optional true} [:maybe :boolean]]
   [:display-type                        {:optional true} [:maybe [:set ms/NonBlankString]]]
   [:weights                             {:optional true} [:maybe [:map-of :keyword number?]]]])

(mu/defn search-context :- SearchContext
  "Create a new search context that you can pass to other functions like [[search]]."
  [{:keys [archived
           collection
           context
           calculate-available-models?
           created-at
           created-by
           current-user-id
           current-user-perms
           display-type
           filter-items-in-personal-collection
           ids
           is-impersonated-user?
           is-sandboxed-user?
           include-dashboard-questions?
           include-metadata?
           is-superuser?
           is-data-analyst?
           last-edited-at
           last-edited-by
           limit
           model-ancestors?
           models
           offset
           search-engine
           search-native-query
           search-string
           table-db-id
           verified
           non-temporal-dim-ids
           has-temporal-dim
           weights]} :- ::search-context.input]
  ;; for prod where Malli is disabled
  {:pre [(pos-int? current-user-id) (set? current-user-perms)]}
  (when (some? verified)
    (premium-features/assert-has-any-features
     [:content-verification :official-collections]
     (deferred-tru "Content Management or Official Collections")))
  (let [models (if (seq models) models search.config/all-models)
        engine (parse-engine search-engine)
        fvalue (fn [filter-key] (search.config/filter-default engine context filter-key))
        ctx    (cond-> {:archived?                           (boolean (or archived (fvalue :archived)))
                        :context                             (or context :unknown)
                        :calculate-available-models?         (boolean calculate-available-models?)
                        :current-user-id                     current-user-id
                        :current-user-perms                  current-user-perms
                        :enabled-transform-source-types      (transforms.gating/enabled-source-types)
                        :filter-items-in-personal-collection (or filter-items-in-personal-collection
                                                                 (fvalue :filter-items-in-personal-collection))
                        :is-impersonated-user?               is-impersonated-user?
                        :is-sandboxed-user?                  is-sandboxed-user?
                        :is-superuser?                       is-superuser?
                        :is-data-analyst?                    (boolean is-data-analyst?)
                        :models                              models
                        :model-ancestors?                    (boolean model-ancestors?)
                        :search-engine                       engine
                        :search-string                       search-string
                        :weights                             weights}
                 (some? collection)                          (assoc :collection collection)
                 (some? created-at)                          (assoc :created-at created-at)
                 (seq created-by)                            (assoc :created-by created-by)
                 (some? filter-items-in-personal-collection) (assoc :filter-items-in-personal-collection filter-items-in-personal-collection)
                 (some? last-edited-at)                      (assoc :last-edited-at last-edited-at)
                 (seq last-edited-by)                        (assoc :last-edited-by last-edited-by)
                 (some? table-db-id)                         (assoc :table-db-id table-db-id)
                 (some? limit)                               (assoc :limit-int limit)
                 (some? offset)                              (assoc :offset-int offset)
                 (some? search-native-query)                 (assoc :search-native-query search-native-query)
                 (some? verified)                            (assoc :verified verified)
                 (some? include-dashboard-questions?)        (assoc :include-dashboard-questions? include-dashboard-questions?)
                 (some? include-metadata?)                   (assoc :include-metadata? include-metadata?)
                 (seq ids)                                   (assoc :ids ids)
                 (some? non-temporal-dim-ids)                (assoc :non-temporal-dim-ids non-temporal-dim-ids)
                 (some? has-temporal-dim)                    (assoc :has-temporal-dim has-temporal-dim)
                 (seq display-type)                          (assoc :display-type display-type))]
    (when (and (seq ids)
               (not= (count models) 1))
      (throw (ex-info (tru "Filtering by ids work only when you ask for a single model") {:status-code 400})))
    ;; TODO this is rather hidden, perhaps better to do it further down the stack
    (assoc ctx :models
           ;; We are not working to keep the legacy engine logic in sync with the new modular approach.
           (if (= :search.engine/in-place engine)
             (search.in-place.filter/search-context->applicable-models ctx)
             (search.filter/search-context->applicable-models ctx)))))

(defn- to-toucan-instance [row]
  (let [model (-> row :model search.config/model-to-db-model :db-model)]
    (t2.instance/instance model row)))

(defn- map-collection [collection]
  (cond-> collection
    :always
    (assoc :type (:collection_type collection))
    :always
    collection/maybe-localize-system-collection-name
    :always
    collection/maybe-localize-tenant-collection-name))

(defn- normalize-result [result]
  (let [instance (to-toucan-instance (t2.realize/realize result))]
    (-> instance
        ;; MySQL returns booleans as `1` or `0` so convert those to boolean as needed
        (update :bookmark bit->boolean)
        (update :archived bit->boolean)
        (update :archived_directly bit->boolean)
        ;; Collections require some transformation before being scored and returned by search.
        (cond-> (t2/instance-of? :model/Collection instance) map-collection))))

(defn- add-can-write [search-ctx row]
  (if (some #(mi/instance-of? % row) [:model/Dashboard :model/Card])
    (assoc row :can_write (can-write? search-ctx row))
    row))

(defn- normalize-result-more
  "Additional normalization that is done after we've filtered by permissions, as its more expensive."
  [search-ctx result]
  (->> (update result :pk_ref json/decode)
       (add-can-write search-ctx)))

(defn- search-results [search-ctx model-set-fn total-results]
  (let [add-perms-for-col  (fn [item]
                             (cond-> item
                               (mi/instance-of? :model/Collection item)
                               (assoc :can_write (can-write? search-ctx item))))]
    ;; We get to do this slicing and dicing with the result data because
    ;; the pagination of search is for UI improvement, not for performance.
    ;; We intend for the cardinality of the search results to be below the default max before this slicing occurs
    (cond-> {:data             (cond->> total-results
                                 (some? (:offset-int search-ctx)) (drop (:offset-int search-ctx))
                                 (some? (:limit-int search-ctx)) (take (:limit-int search-ctx))
                                 true (map add-perms-for-col))
             :limit            (:limit-int search-ctx)
             :models           (:models search-ctx)
             :offset           (:offset-int search-ctx)
             :table_db_id      (:table-db-id search-ctx)
             :engine           (:search-engine search-ctx)
             :total            (count total-results)}

      (:calculate-available-models? search-ctx)
      (assoc :available_models (model-set-fn search-ctx)))))

(defn- hydrate-dashboards [results]
  (->> (t2/hydrate results [:dashboard :moderation_status])
       (map #(u/update-some % :dashboard select-keys [:id :name :moderation_status]))
       (map #(dissoc % :dashboard_id))))

(defn- add-metadata [search-results]
  (let [card-ids (into #{}
                       (comp
                        (filter #(contains? #{"card" "metric" "dataset"} (:model %)))
                        (map :id))
                       search-results)
        card-metadata (if (empty? card-ids)
                        {}
                        (t2/select-pk->fn :result_metadata [:model/Card :id :card_schema :result_metadata] :id [:in card-ids]))]
    (map (fn [{:keys [model id] :as item}]
           (if (contains? #{"card" "metric" "dataset"} model)
             (assoc item :result_metadata (card-metadata id))
             item))
         search-results)))

(mu/defn search
  "Builds a search query that includes all the searchable entities, and runs it."
  [search-ctx :- search.config/SearchContext]
  (tracing/with-span :search "search.execute" {:search/engine       (name (:search-engine search-ctx))
                                               :search/query-length (count (:search-string search-ctx))
                                               :search/model-count  (count (:models search-ctx))}
    (let [reducible-results (search.engine/results search-ctx)
          scoring-ctx       (select-keys search-ctx [:search-engine :search-string :search-native-query])
          xf                (comp
                             (take search.config/*db-max-results*)
                             (map normalize-result)
                             (filter (partial check-permissions-for-model search-ctx))
                             (map (partial normalize-result-more search-ctx))
                             (keep #(search.engine/score scoring-ctx %)))
          total-results     (cond->> (scoring/top-results reducible-results search.config/max-filtered-results xf)
                              true hydrate-dashboards
                              true hydrate-user-metadata
                              (:include-metadata? search-ctx) (add-metadata)
                              (:model-ancestors? search-ctx) (add-dataset-collection-hierarchy)
                              true (add-collection-effective-location)
                              true (map serialize))]
      (search-results search-ctx search.engine/model-set total-results))))
