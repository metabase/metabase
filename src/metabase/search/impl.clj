(ns metabase.search.impl
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.db :as mdb]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.models.collection :as collection]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.database :as database]
   [metabase.models.interface :as mi]
   [metabase.permissions.util :as perms.u]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.api :as search.api]
   [metabase.search.config
    :as search.config
    :refer [SearchableModel SearchContext]]
   [metabase.search.filter :as search.filter]
   [metabase.search.fulltext :as search.fulltext]
   [metabase.search.in-place.scoring :as scoring]
   [metabase.util.i18n :refer [tru deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
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

(defmethod check-permissions-for-model :table
  [search-ctx instance]
  ;; we've already filtered out tables w/o collection permissions in the query itself.
  (let [instance-id (:id instance)
        user-id     (:current-user-id search-ctx)
        db-id       (database/table-id->database-id instance-id)]
    (and
     (data-perms/user-has-permission-for-table? user-id :perms/view-data :unrestricted db-id instance-id)
     (data-perms/user-has-permission-for-table? user-id :perms/create-queries :query-builder db-id instance-id))))

(defmethod check-permissions-for-model :indexed-entity
  [search-ctx instance]
  (let [user-id (:current-user-id search-ctx)
        db-id   (:database_id instance)]
    (and
     (= :query-builder-and-native (data-perms/full-db-permission-for-user user-id :perms/create-queries db-id))
     (= :unrestricted (data-perms/full-db-permission-for-user user-id :perms/view-data db-id)))))

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
        remove-thunks       (partial mapv #(dissoc % :match-context-thunk))]
    (-> result
        (assoc
         :name           (if (and (contains? matching-columns :display_name) display_name)
                           display_name
                           name)
         :context        (when (and match-context-thunk
                                    (empty?
                                     (remove matching-columns displayed-columns)))
                           (match-context-thunk))
         :collection     (if (and archived_directly (not= "collection" model))
                           (select-keys (collection/trash-collection)
                                        [:id :name :authority_level :type])
                           (merge {:id              collection_id
                                   :name            collection_name
                                   :authority_level collection_authority_level
                                   :type            collection_type}
                                  ;; for non-root collections, override :collection with the values for its effective parent
                                  effective_parent
                                  (when collection_effective_ancestors
                                    {:effective_ancestors collection_effective_ancestors})))
         :scores          (remove-thunks all-scores))
        (update :dataset_query (fn [dataset-query]
                                 (when-let [query (some-> dataset-query json/parse-string)]
                                   (if (get query "type")
                                     (mbql.normalize/normalize query)
                                     (not-empty (lib/normalize query))))))
        (dissoc
         :all-scores
         :relevant-scores
         :collection_effective_ancestors
         :collection_id
         :collection_location
         :collection_name
         :collection_type
         :archived_directly
         :display_name
         :effective_parent))))

(defn- bit->boolean
  "Coerce a bit returned by some MySQL/MariaDB versions in some situations to Boolean."
  [v]
  (if (number? v)
    (not (zero? v))
    v))

(defmulti supported-engine? "Does this instance support the given engine?" keyword)

(defmethod supported-engine? :search.engine/in-place [_] true)
(defmethod supported-engine? :search.engine/fulltext [_] (search.fulltext/supported-db? (mdb/db-type)))

(def ^:private default-engine :search.engine/in-place)

(defn- known-engine? [engine]
  (let [registered? #(contains? (methods supported-engine?) %)]
    (some registered? (cons engine (ancestors engine)))))

(defn- parse-engine [value]
  (or (when-not (str/blank? value)
        (let [engine (keyword "search.engine" value)]
          (cond
            (not (known-engine? engine))
            (log/warnf "Search-engine is unknown: %s" value)

            (not (supported-engine? engine))
            (log/warnf "Search-engine is not supported: %s" value)

            :else
            engine)))
      default-engine))

;; This forwarding is here for tests, we should clean those up.

(defn- apply-default-engine [{:keys [search-engine] :as search-ctx}]
  (when (= default-engine search-engine)
    (throw (ex-info "Missing implementation for default search-engine" {:search-engine search-engine})))
  (log/debugf "Missing implementation for %s so instead using %s" search-engine default-engine)
  (assoc search-ctx :search-engine default-engine))

(defmethod search.api/results :default [search-ctx]
  (search.api/results (apply-default-engine search-ctx)))

(defmethod search.api/model-set :default [search-ctx]
  (search.api/model-set (apply-default-engine search-ctx)))

(defmethod search.api/score :default [results search-ctx]
  (search.api/score results (apply-default-engine search-ctx)))

(mr/def ::search-context.input
  [:map {:closed true}
   [:search-string                                        [:maybe ms/NonBlankString]]
   [:models                                               [:maybe [:set SearchableModel]]]
   [:current-user-id                                      pos-int?]
   [:is-superuser?                                        :boolean]
   [:current-user-perms                                   [:set perms.u/PathSchema]]
   [:archived                            {:optional true} [:maybe :boolean]]
   [:created-at                          {:optional true} [:maybe ms/NonBlankString]]
   [:created-by                          {:optional true} [:maybe [:set ms/PositiveInt]]]
   [:filter-items-in-personal-collection {:optional true} [:maybe [:enum "only" "exclude"]]]
   [:last-edited-at                      {:optional true} [:maybe ms/NonBlankString]]
   [:last-edited-by                      {:optional true} [:maybe [:set ms/PositiveInt]]]
   [:limit                               {:optional true} [:maybe ms/Int]]
   [:offset                              {:optional true} [:maybe ms/Int]]
   [:table-db-id                         {:optional true} [:maybe ms/PositiveInt]]
   [:search-engine                       {:optional true} [:maybe string?]]
   [:search-native-query                 {:optional true} [:maybe true?]]
   [:model-ancestors?                    {:optional true} [:maybe boolean?]]
   [:verified                            {:optional true} [:maybe true?]]
   [:ids                                 {:optional true} [:maybe [:set ms/PositiveInt]]]
   [:calculate-available-models?         {:optional true} [:maybe :boolean]]])

(mu/defn search-context :- SearchContext
  "Create a new search context that you can pass to other functions like [[search]]."
  [{:keys [archived
           calculate-available-models?
           created-at
           created-by
           current-user-id
           current-user-perms
           filter-items-in-personal-collection
           ids
           is-superuser?
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
           verified]} :- ::search-context.input]
  ;; for prod where Malli is disabled
  {:pre [(pos-int? current-user-id) (set? current-user-perms)]}
  (when (some? verified)
    (premium-features/assert-has-any-features
     [:content-verification :official-collections]
     (deferred-tru "Content Management or Official Collections")))
  (let [models (if (string? models) [models] models)
        ctx    (cond-> {:archived?                   (boolean archived)
                        :calculate-available-models? (boolean calculate-available-models?)
                        :current-user-id             current-user-id
                        :current-user-perms          current-user-perms
                        :is-superuser?               is-superuser?
                        :models                      models
                        :model-ancestors?            (boolean model-ancestors?)
                        :search-engine               (parse-engine search-engine)
                        :search-string               search-string}
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
                 (seq ids)                                   (assoc :ids ids))]
    (when (and (seq ids)
               (not= (count models) 1))
      (throw (ex-info (tru "Filtering by ids work only when you ask for a single model") {:status-code 400})))
    (assoc ctx :models (search.filter/search-context->applicable-models ctx))))

(defn- to-toucan-instance [row]
  (let [model (-> row :model search.config/model-to-db-model :db-model)]
    (t2.instance/instance model row)))

(defn- map-collection [collection]
  (cond-> collection
    (:archived_directly collection)
    (assoc :location (collection/trash-path))
    :always
    (assoc :type (:collection_type collection))
    :always
    collection/maybe-localize-trash-name))

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
  (->> (update result :pk_ref json/parse-string)
       (add-can-write search-ctx)))

(defn- search-results [search-ctx model-set-fn total-results]
  (let [add-perms-for-col  (fn [item]
                             (cond-> item
                               (mi/instance-of? :model/Collection item)
                               (assoc :can_write (can-write? search-ctx item))))]
    ;; We get to do this slicing and dicing with the result data because
    ;; the pagination of search is for UI improvement, not for performance.
    ;; We intend for the cardinality of the search results to be below the default max before this slicing occurs
    (cond->
     {:data             (cond->> total-results
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

(mu/defn search
  "Builds a search query that includes all the searchable entities, and runs it."
  [search-ctx :- search.config/SearchContext]
  (let [reducible-results (search.api/results search-ctx)
        scoring-ctx       (select-keys search-ctx [:search-engine :search-string :search-native-query])
        xf                (comp
                           (take search.config/*db-max-results*)
                           (map normalize-result)
                           (filter (partial check-permissions-for-model search-ctx))
                           (map (partial normalize-result-more search-ctx))
                           (keep #(search.api/score % scoring-ctx)))
        total-results     (cond->> (scoring/top-results reducible-results search.config/max-filtered-results xf)
                            true hydrate-user-metadata
                            (:model-ancestors? search-ctx) (add-dataset-collection-hierarchy)
                            true (add-collection-effective-location)
                            true (map serialize))]
    (search-results search-ctx search.api/model-set total-results)))
