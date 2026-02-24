(ns metabase-enterprise.product-analytics.api.send
  "Public `/api/ee/product-analytics/api/send` endpoint for receiving Umami-compatible
   event payloads from tracking scripts on external sites. No authentication required."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
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

(defn- handle-event-result
  "Persist event pipeline result and return a success response with a session cache JWT."
  [result body]
  (let [{:keys [session-data event-data]} result
        session-id (storage/store-upsert-session! session-data)
        _          (storage/store-save-event!
                    (assoc-in event-data [:event :session_id] session-id))
        sess-uuid  (:session_uuid session-data)
        vid        (get-in event-data [:event :visit_id])
        website-id (get-in body [:payload :website])
        token      (pa.token/create-session-token sess-uuid vid website-id)]
    {:status  200
     :headers {"X-Umami-Cache" token}
     :body    {:ok true}}))

(defn- handle-identify-result
  "Persist identify pipeline result (session upsert, distinct-id, session data rows)
   and return a success response with a session cache JWT."
  [result body]
  (let [{:keys [session-data distinct-id data-rows]} result
        session-id (storage/store-upsert-session! session-data)
        sess-uuid  (:session_uuid session-data)
        secret     (pa.token/ensure-secret!)
        vid        (pipeline/visit-id sess-uuid secret (t/zoned-date-time))
        website-id (get-in body [:payload :website])]
    (when distinct-id
      (storage/store-set-distinct-id! session-id distinct-id))
    (when (seq data-rows)
      (storage/store-save-session-data!
       (mapv (fn [row]
               (-> {:data_key nil :string_value nil :number_value nil :data_type nil}
                   (merge row)
                   (assoc :session_id session-id)))
             data-rows)))
    (let [token (pa.token/create-session-token sess-uuid vid website-id)]
      {:status  200
       :headers {"X-Umami-Cache" token}
       :body    {:ok true}})))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/api/send"
  "Receive an Umami-compatible event or identify payload from a tracking script."
  [_route-params
   _query-params
   body
   request]
  (let [ua      (get-in request [:headers "user-agent"])
        ip      (client-ip request)
        headers (:headers request)
        token   (get headers "x-umami-cache")
        ctx     {:user-agent ua :ip ip :headers headers :token token}
        result  (pipeline/process-payload body ctx)]
    (if (:error result)
      {:status 400
       :body   {:error   (subs (str (:error result)) 1)
                :message (:message result)}}
      (if (:identify result)
        (handle-identify-result result body)
        (handle-event-result result body)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/product-analytics/api/send` routes (public, no auth)."
  (api.macros/ns-handler *ns* +public-exceptions))
