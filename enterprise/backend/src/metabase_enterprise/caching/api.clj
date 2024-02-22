(ns metabase-enterprise.caching.api
  (:require
   [compojure.core :refer [GET]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint GET "/"
   "Return cache configuration."
  [:as {{:strs [model collection]
         :or   {model "root"}}
        :query-params}]
  {model      [:set {:decode/string (fn [x] (cond (set? x)    x
                                                  (vector? x) (set x)
                                                  (some? x)   #{x}))}
               [:enum "root" "database" "collection" "dashboard" "question"]]
   collection [:maybe ms/PositiveInt]}

  (let [model (cond-> model
                (some #{"dashboard" "question"} model) (conj "collection"))
        opts  [:model [:in model]
               :collection_id collection]
        items (apply t2/select :model/CacheConfig opts)]
    {:items items}))

(api/defendpoint PUT "/"
  "Store cache configuration."
  [:as {{:keys [model model_id strategy]} :body}]
  {model    [:enum "root" "database" "collection" "dashboard" "question"]
   model_id ms/IntGreaterThanOrEqualToZero
   strategy [:and
             [:map
              [:type [:enum :nocache :ttl :duration :schedule :query]]]
             [:multi {:dispatch :type}
              [:nocache  [:map
                          [:type keyword?]]]
              [:ttl      [:map
                          [:type keyword?]
                          [:multiplier ms/PositiveInt]
                          [:min_duration ms/PositiveInt]]]
              [:duration [:map
                          [:type keyword?]
                          [:duration ms/PositiveInt]
                          [:unit [:enum "hours" "minutes" "seconds" "days"]]]]
              [:schedule [:map
                          [:type keyword?]
                          [:schedule string?]]]
              [:query    [:map
                          [:type keyword?]
                          [:database_id int?]
                          [:table_id int?]
                          [:field_id int?]
                          [:aggregation [:enum "max" "count"]]
                          [:schedule string?]]]]]}
  (when (and (= model "root") (not= model_id 0))
    (throw (ex-info "Root configuration is only valid with model_id = 0" {:status-code 400
                                                                          :model_id    model_id})))
  (let [entity (when-not (= model "root")
                 (api/check-404 (t2/select-one (case model
                                                 "database"   :model/Database
                                                 "collection" :model/Collection
                                                 "dashboard"  :model/Dashboard
                                                 "question"   :model/Card)
                                               :id model_id)))
        cid    (if (= model "collection")
                 (:parent_id (t2/hydrate entity :parent_id))
                 (:collection_id entity))
        data   {:model         model
                :model_id      model_id
                :collection_id cid
                :updated_at    (t/offset-date-time)
                :strategy      (:type strategy)
                :config        (dissoc strategy :type)}]
    {:id (or (first (t2/update-returning-pks! :model/CacheConfig {:model model :model_id model_id} data))
             (t2/insert-returning-pk! :model/CacheConfig data))}))

(api/defendpoint DELETE "/"
  [:as {{:keys [model model_id]} :body}]
  {model    [:enum "root" "database" "collection" "dashboard" "question"]
   model_id ms/PositiveInt}
  (when (and (= model "root") (not= model_id 0))
    (throw (ex-info "Root configuration is only valid with model_id = 0" {:status-code 400
                                                                          :model_id model_id})))
  (t2/delete! :model/CacheConfig :model model :model_id model_id)
  nil)

(api/define-routes +auth)
