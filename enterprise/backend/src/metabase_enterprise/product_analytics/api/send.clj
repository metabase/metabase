(ns metabase-enterprise.product-analytics.api.send
  "Public `/api/ee/product-analytics/send` endpoint for receiving Umami-compatible
   event payloads from tracking scripts on external sites. No authentication required."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.product-analytics.pipeline :as pipeline]
   [metabase-enterprise.product-analytics.storage :as storage]
   [metabase-enterprise.product-analytics.token :as pa.token]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+public-exceptions]]))

(set! *warn-on-reflection* true)

(defn- client-ip
  "Extract client IP from the request. Checks proxy/CDN headers first, falls back
   to `:remote-addr`. For `x-forwarded-for`, takes the first (leftmost) IP."
  [{:keys [headers remote-addr]}]
  (or (some-> (get headers "x-forwarded-for")
              (str/split #",")
              first
              str/trim)
      (get headers "cf-connecting-ip")
      remote-addr))

(defn- add-cors-headers
  "Add CORS response headers. `origin` is the value of the request `Origin` header."
  [response origin]
  (cond-> response
    origin (update :headers assoc
                   "Access-Control-Allow-Origin" origin
                   "Access-Control-Allow-Methods" "POST, OPTIONS"
                   "Access-Control-Allow-Headers" "Content-Type, X-Umami-Cache")))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/send"
  "Receive an Umami-compatible event payload from a tracking script."
  [_route-params
   _query-params
   body
   request]
  (let [ua      (get-in request [:headers "user-agent"])
        ip      (client-ip request)
        headers (:headers request)
        origin  (get headers "origin")
        ctx     {:user-agent ua :ip ip :headers headers}
        result  (pipeline/process-event body ctx)]
    (if (:error result)
      (-> {:status 400
           :body   {:error   (subs (str (:error result)) 1)
                    :message (:message result)}}
          (add-cors-headers origin))
      (let [{:keys [session-data event-data]} result
            session-id (storage/store-upsert-session! session-data)
            _          (storage/store-save-event!
                        (assoc-in event-data [:event :session_id] session-id))
            sess-uuid  (:session_uuid session-data)
            vid        (get-in event-data [:event :visit_id])
            website-id (get-in body [:payload :website])
            token      (pa.token/create-session-token sess-uuid vid website-id)]
        (-> {:status  200
             :headers {"X-Umami-Cache" token}
             :body    {:ok true}}
            (add-cors-headers origin))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/product-analytics/send` routes (public, no auth)."
  (api.macros/ns-handler *ns* +public-exceptions))
