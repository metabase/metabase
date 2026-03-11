(ns dev.api.preview
  "Dev-only endpoints for previewing rendered pulse cards and dashboards.
  These were previously at `/api/pulse/preview_*` but have been moved here
  since they are only useful for development and testing."
  (:require
   [hiccup.core :refer [html]]
   [hiccup.page :refer [html5]]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.urls :as urls]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn- pulse-card-query-results
  {:arglists '([card])}
  [{query :dataset_query, card-id :id}]
  (binding [qp.perms/*card-id* card-id]
    (qp/process-query
     (qp/userland-query
      (assoc query
             :middleware {:process-viz-settings? true
                          :js-int-to-string?     false})
      {:executed-by api/*current-user-id*
       :context     :pulse
       :card-id     card-id}))))

(api.macros/defendpoint :get "/preview-card/:id"
  "Get HTML rendering of a Card with `id`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [card   (api/read-check :model/Card id)
        result (pulse-card-query-results card)]
    {:status 200
     :body   (html5
              [:html
               [:body {:style "margin: 0;"}
                (channel.render/render-pulse-card-for-display (channel.render/defaulted-timezone card)
                                                              card
                                                              result
                                                              {:channel.render/include-title? true, :channel.render/include-buttons? true})]])}))

(api.macros/defendpoint :get "/preview-dashboard/:id"
  "Get HTML rendering of a Dashboard with `id`.

  This endpoint relies on a custom middleware defined in `metabase.channel.render.core/style-tag-nonce-middleware` to
  allow the style tag to render properly, given our Content Security Policy setup."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/read-check :model/Dashboard id)
  {:status  200
   :headers {"Content-Type" "text/html"}
   :body    (channel.render/style-tag-from-inline-styles
             (html5
              [:head
               [:meta {:charset "utf-8"}]
               [:link {:nonce "%NONCE%" ;; this will be str/replaced by 'style-tag-nonce-middleware
                       :rel  "stylesheet"
                       :href "https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap"}]]
              [:body [:h2 (format "Backend Artifacts Preview for Dashboard %s" id)]
               (channel.render/render-dashboard-to-html id)]))})

(api.macros/defendpoint :get "/preview-card-info/:id"
  "Get JSON object containing HTML rendering of a Card with `id` and other information."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [card      (api/read-check :model/Card id)
        result    (pulse-card-query-results card)
        data      (:data result)
        card-type (channel.render/detect-pulse-chart-type card nil data)
        card-html (html (channel.render/render-pulse-card-for-display (channel.render/defaulted-timezone card)
                                                                      card
                                                                      result
                                                                      {:channel.render/include-title? true}))]
    {:id              id
     :pulse_card_type card-type
     :pulse_card_html card-html
     :pulse_card_name (:name card)
     :pulse_card_url  (urls/card-url (:id card))
     :row_count       (:row_count result)
     :col_count       (count (:cols (:data result)))}))

(def ^:private preview-card-width 400)

(api.macros/defendpoint :get "/preview-card-png/:id"
  "Get PNG rendering of a Card with `id`. Optionally specify `width` as a query parameter."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [width]} :- [:map
                       [:width {:optional true} [:maybe ms/PositiveInt]]]]
  (let [card   (api/read-check :model/Card id)
        result (pulse-card-query-results card)
        width  (or width preview-card-width)
        ba     (channel.render/render-pulse-card-to-png (channel.render/defaulted-timezone card)
                                                        card
                                                        result
                                                        width
                                                        {:channel.render/include-title? true})]
    {:status 200, :headers {"Content-Type" "image/png"}, :body (ByteArrayInputStream. ba)}))

(def ^:private ^{:arglists '([handler])} style-nonce-middleware
  (metabase.api.routes.common/wrap-middleware-for-open-api-spec-generation
   (partial channel.render/style-tag-nonce-middleware "/dev/preview/preview-dashboard")))

(def ^{:arglists '([request respond raise])} routes
  "`/dev/preview` endpoints."
  (api.macros/ns-handler *ns* style-nonce-middleware))
