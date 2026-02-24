(ns metabase-enterprise.product-analytics.api
  "`/api/ee/product-analytics/` routes"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.system.core :as system]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Malli Schemas ------------------------------------------------

(def ^:private CreateSiteRequest
  [:map
   [:name            ms/NonBlankString]
   [:allowed_domains {:optional true} [:maybe :string]]])

(def ^:private UpdateSiteRequest
  [:map
   [:name            {:optional true} ms/NonBlankString]
   [:allowed_domains {:optional true} [:maybe :string]]])

(def ^:private SiteResponse
  [:map
   [:id              ms/PositiveInt]
   [:uuid            ms/NonBlankString]
   [:name            ms/NonBlankString]
   [:allowed_domains {:optional true} [:maybe :string]]
   [:archived        :boolean]
   [:created_at      ms/TemporalInstant]
   [:updated_at      ms/TemporalInstant]])

(def ^:private SiteWithSnippetResponse
  [:merge SiteResponse
   [:map
    [:tracking_snippet ms/NonBlankString]]])

;;; ----------------------------------------------- Tracking Snippet -----------------------------------------------

(defn- tracking-snippet
  "Generate the Umami-compatible tracking script tag for a site."
  [{:keys [uuid]}]
  (let [host (system/site-url)]
    (format "<script defer src=\"%s/app/metabase_tracker.js\" data-website-id=\"%s\" data-host-url=\"%s/api/ee/product-analytics\"></script>"
            host
            uuid
            host)))

;;; -------------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/sites" :- [:sequential SiteResponse]
  "List all registered product analytics sites."
  [_route-params _query-params]
  (t2/select :model/ProductAnalyticsSite :archived false {:order-by [[:name :asc]]}))

(api.macros/defendpoint :post "/sites" :- SiteWithSnippetResponse
  "Create a new product analytics site."
  [_route-params
   _query-params
   {:keys [name allowed_domains]} :- CreateSiteRequest]
  (let [site-uuid (str (random-uuid))
        site      (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                 {:name            name
                                                  :uuid            site-uuid
                                                  :allowed_domains allowed_domains})]
    (assoc site :tracking_snippet (tracking-snippet site))))

(api.macros/defendpoint :get "/sites/:id" :- SiteWithSnippetResponse
  "Get details for a product analytics site."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (let [site (api/check-404 (t2/select-one :model/ProductAnalyticsSite :id id))]
    (assoc site :tracking_snippet (tracking-snippet site))))

(api.macros/defendpoint :put "/sites/:id" :- SiteResponse
  "Update a product analytics site."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- UpdateSiteRequest]
  (let [site (api/check-404 (t2/select-one :model/ProductAnalyticsSite :id id))]
    (t2/update! :model/ProductAnalyticsSite (:id site) body)
    (t2/select-one :model/ProductAnalyticsSite :id id)))

(api.macros/defendpoint :delete "/sites/:id" :- SiteResponse
  "Archive (soft-delete) a product analytics site."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (let [site (api/check-404 (t2/select-one :model/ProductAnalyticsSite :id id))]
    (t2/update! :model/ProductAnalyticsSite (:id site) {:archived true})
    (t2/select-one :model/ProductAnalyticsSite :id id)))

;;; --------------------------------------------------- Routes ----------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/product-analytics` routes"
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
