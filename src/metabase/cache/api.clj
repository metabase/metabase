(ns metabase.cache.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.cache.db :as cache.db]
   [metabase.cache.models.cache-config :as cache-config]
   [metabase.cache.schema :as cache.schema]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru trun]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::cache-strategy
  (if config/ee-available?
    [:multi
     {:dispatch (fn [_value]
                  (if (premium-features/has-feature? :cache-granular-controls)
                    :ee
                    :oss))}
     [:ee  ::cache.schema/cache-strategy.ee]
     [:oss ::cache.schema/cache-strategy.oss]]
    ::cache.schema/cache-strategy.oss))

(defn- assert-valid-models [model ids premium?]
  (cond
    (= model "root")
    (when-not (some zero? ids)
      (throw (ex-info (tru "Root configuration is only valid with model_id = 0") {:status-code 404
                                                                                  :model_id    (first ids)})))

    (not premium?)
    (throw (premium-features/ee-feature-error (tru "Granular Caching")))

    :else
    (api/check-404 (case model
                     "database"  (cache.db/database-with-ids ids)
                     "dashboard" (cache.db/dashboard-with-ids ids)
                     "question"  (cache.db/card-with-ids ids)))))

(mr/def ::cache-config-item
  [:map
   [:model    ::cache.schema/cache-config.model]
   [:model_id ::cache.schema/cache-config.model-id]
   [:strategy [:map [:type :keyword]]]
   [:name       {:optional true} [:maybe :string]]
   [:collection {:optional true} [:maybe [:map
                                          [:id   ms/PositiveInt]
                                          [:name [:maybe :string]]
                                          [:authority_level {:optional true} [:maybe :string]]
                                          [:type {:optional true} [:maybe :string]]]]]])

(mr/def ::cache-config-list-response
  [:map
   [:data  [:sequential ::cache-config-item]]
   [:total {:optional true} ms/IntGreaterThanOrEqualToZero]
   [:limit  {:optional true} [:maybe ms/PositiveInt]]
   [:offset {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::cache-config-store-response
  [:map [:id ms/PositiveInt]])

(mr/def ::cache-invalidate-response
  [:map
   [:status [:= 200]]
   [:body   [:map
             [:count   :int]
             [:message :string]]]])

(defn- target-config
  "An unsaved CacheConfig for the `model` target with `model-id`, to ask permission questions about its target."
  [model model-id]
  (t2/instance :model/CacheConfig {:model model :model_id model-id}))

(api.macros/defendpoint :get "/" :- ::cache-config-list-response
  "Return cache configuration. Supports pagination via `limit` and `offset` query parameters,
   and sorting via `sort_column` and `sort_direction`."
  [_route-params
   {:keys [model collection id] :as params}
   :- [:merge
       [:map {:closed true}
        [:model      {:default ["root"]} (mu/with (ms/QueryVectorOf ::cache.schema/cache-config.model)
                                                  {:description "Type of model"})]
        [:collection {:optional true} (mu/with [:maybe ms/PositiveInt]
                                               {:description "Collection id to filter results. Returns everything if not supplied."})]
        [:id         {:optional true} (mu/with [:maybe ms/PositiveInt]
                                               {:description "Model id to get configuration for."})]]
       cache-config/SortParams]]
  (when (and (not (premium-features/enable-cache-granular-controls?))
             (not= model ["root"]))
    (throw (premium-features/ee-feature-error (tru "Granular Caching"))))
  (if id
    (api/write-check (target-config (first model) id))
    (api/check-superuser))
  (let [sort-params (select-keys params [:sort_column :sort_direction])
        limit       (request/limit)
        offset      (request/offset)
        data        (cache-config/get-list model collection id limit offset sort-params)]
    (if limit
      {:data   data
       :total  (cache-config/get-list-total model collection id)
       :limit  limit
       :offset offset}
      {:data data})))

(api.macros/defendpoint :put "/" :- ::cache-config-store-response
  "Store cache configuration."
  [_route-params
   _query-params
   {:keys [model model_id] :as config} :- [:map {:closed true}
                                           [:model    ::cache.schema/cache-config.model]
                                           [:model_id ::cache.schema/cache-config.model-id]
                                           [:strategy ::cache-strategy]]]
  (assert-valid-models model [model_id] (premium-features/enable-cache-granular-controls?))
  (if-let [existing (first (cache.db/cache-configs-for model [model_id]))]
    (api/update-check existing (cache-config/config->row config))
    (api/create-check :model/CacheConfig (cache-config/config->row config)))
  {:id (cache-config/store! api/*current-user-id* config)})

(api.macros/defendpoint :delete "/" :- :nil
  "Delete cache configurations."
  [_route-params
   _query-params
   {:keys [model model_id]} :- [:map {:closed true}
                                [:model    ::cache.schema/cache-config.model]
                                [:model_id (ms/QueryVectorOf ::cache.schema/cache-config.model-id)]]]
  (assert-valid-models model model_id (premium-features/enable-cache-granular-controls?))
  (doseq [id model_id] (api/write-check (target-config model id)))
  (cache-config/delete! api/*current-user-id* model model_id)
  nil)

(defn- write-check-all
  "Throws unless the current user can write every row of `rows`, in the order of `ids`, with a 404 for an id without a row."
  [rows ids]
  (let [id->row (into {} (map (juxt :id identity)) (t2/hydrate rows :can_write))]
    (doseq [id ids]
      (api/write-check (get id->row id)))))

(api.macros/defendpoint :post "/invalidate" :- ::cache-invalidate-response
  "Invalidate cache entries.

  Use it like `/api/cache/invalidate?database=1&dashboard=15` (any number of database/dashboard/question can be
  supplied).

  `&include=overrides` controls whenever you want to invalidate cache for a specific cache configuration without
  touching all nested configurations, or you want your invalidation to trickle down to every card."
  [_route-params
   {:keys [include database dashboard question]}
   :- [:map {:closed true}
       [:include   {:optional true} [:maybe {:description "All cache configuration overrides should invalidate cache too"}
                                     [:= :overrides]]]
       [:database  {:optional true} [:maybe {:description "A list of database ids"}
                                     (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
       [:dashboard {:optional true} [:maybe {:description "A list of dashboard ids"}
                                     (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
       [:question  {:optional true} [:maybe {:description "A list of question ids"}
                                     (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]]]
  (when-not (premium-features/enable-cache-granular-controls?)
    (throw (premium-features/ee-feature-error (tru "Granular Caching"))))
  ;; Require at least one target. Without a filter there is nothing to invalidate, so the request is
  ;; malformed rather than not-found: returning 404 here misled callers into thinking the endpoint
  ;; itself did not exist (see #66499), and a 200 would falsely imply something was invalidated.
  (when (every? empty? [database dashboard question])
    (throw (ex-info (tru "At least one of `database`, `dashboard`, or `question` is required.")
                    {:status-code 400})))
  (write-check-all (cache.db/databases (vec database)) database)
  (write-check-all (cache.db/dashboards (vec dashboard)) dashboard)
  (write-check-all (cache.db/cards (vec question)) question)
  (let [cnt (cache-config/invalidate! {:databases       database
                                       :dashboards      dashboard
                                       :questions       question
                                       :with-overrides? (= include :overrides)})]
    ;; A well-formed filter that simply matched no cached results is a successful no-op (200); the
    ;; `:message` below explains what happened.
    {:status 200
     :body   {:count   cnt
              ;; Use condp instead of case to avoid Clojure compiler warnings.
              :message (condp = [(= include :overrides) (if (pos? cnt) 1 cnt)]
                         [true -1]  (tru "Could not find any questions for the criteria you specified.")
                         [true 0]   (tru "No cached results to clear.")
                         [true 1]   (trun "Cleared a cached result." "Cleared {0} cached results." cnt)
                         [false -1] (tru "Nothing to invalidate.")
                         [false 0]  (tru "No cache configuration to invalidate.")
                         [false 1]  (trun "Invalidated cache configuration." "Invalidated {0} cache configurations." cnt))}}))
