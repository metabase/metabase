(ns metabase-enterprise.workspaces.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped?]]
  (derive :model/Transform trait))

(t2/deftransforms :model/Transform
  {:source mi/transform-json
   :target mi/transform-json
   :execution_trigger mi/transform-keyword})

(set! *warn-on-reflection* true)

(let [id (atom 0)]
  (defn next-id [] (swap! id inc)))
(defonce workspaces (atom {}))

(mr/def ::transform-source
  [:map
   [:type [:= "query"]]
   [:query [:map [:database :int]]]])

(api.macros/defendpoint :get "/"
  "Get a list of transforms."
  [_route-params
   _query-params]
  (api/check-superuser)
  #_(t2/select :model/Workspace)
  (vals @workspaces))

(api.macros/defendpoint :post "/"
  [_route-params
   _query-params
   body :- [:map]]
  (api/check-superuser)
  #_(t2/insert-returning-instance!
     :model/workspace body)
  (swap! workspaces assoc (next-id) body))

(api.macros/defendpoint :get "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "get transform" id)
  (api/check-superuser)
  #_(t2/select-one :model/Workspace :id id)
  (get @workspaces id))

(api.macros/defendpoint :put "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map]]
  (api/check-superuser)
  (let [old #_(t2/select-one :model/Workspace id) (@workspaces id)
        new (merge old body)]
    #_(t2/update! :model/Workspace id new)
    #_(t2/select-one :model/Workspace id)
    (swap! workspaces assoc id new)
    new))

(api.macros/defendpoint :post "/:id/add-database"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _
   {:keys [router_database_id destinations]} :- [:map
                                                 [:router_database_id ms/PositiveInt]
                                                 [:destinations
                                                  [:sequential
                                                   [:map
                                                    [:name               ms/NonBlankString]
                                                    [:details            ms/Map]]]]]]
  ;; todo: enable db routing (update api to include optional workspace id rather than attribute)
  ;; add children, don't verify
  ;; stick in the database, do these go in the yaml? lets say yes.
  ()
  nil)

(api.macros/defendpoint :delete "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  #_(t2/delete! :model/Workspace id)
  (swap! workspaces update dissoc id)
  nil)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
