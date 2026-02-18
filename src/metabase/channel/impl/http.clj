(ns metabase.channel.impl.http
  (:require
   [clj-http.client :as http]
   [java-time.api :as t]
   [metabase.channel.core :as channel]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.shared :as channel.shared]
   [metabase.channel.urls :as urls]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private image-width
  "Maximum width of the rendered PNG of HTML to be sent to HTTP Content that exceeds this width (e.g. a table with
  many columns) is truncated."
  1200)

(def ^:private string-or-keyword
  [:or :string :keyword])

(def ^:private HTTPDetails
  [:map {:closed true}
   [:url                           ms/Url]
   [:auth-method                   [:enum "none" "header" "query-param" "request-body"]]
   [:auth-info    {:optional true} [:map-of string-or-keyword :any]]
   ;; used by the frontend to display the auth info properly
   [:fe-form-type {:optional true} [:enum "api-key" "bearer" "basic" "none"]]
   ;; request method
   [:method       {:optional true} [:enum "get" "post" "put"]]])

(def ^:private HTTPChannel
  [:map
   [:type    [:= :channel/http]]
   [:details HTTPDetails]])

(mu/defmethod channel/send! :channel/http
  [{{:keys [url method auth-method auth-info]} :details} :- HTTPChannel
   request]
  (when-not (u/valid-host? (channel.settings/http-channel-host-strategy) url)
    (throw (ex-info (tru "URLs referring to hosts that supply internal hosting metadata are prohibited.")
                    {:status-code 400})))
  (let [req (merge
             {:accept       :json
              :content-type :json
              :method       :post
              :url          url}
             (when method
               {:method (keyword method)})
             (cond-> request
               (= "request-body" auth-method) (update :body merge auth-info)
               (= "header" auth-method)       (update :headers merge auth-info)
               (= "query-param" auth-method)  (update :query-params merge auth-info)))]
    (http/request (cond-> req
                    (or (map? (:body req))
                        (sequential? (:body req))) (update :body json/encode)))))

(defn- maybe-parse-json
  [x]
  (if (string? x)
    (try
      (json/decode x)
      (catch Exception _e
        x))
    x))

(defmethod channel/can-connect? :channel/http
  [_channel-type details]
  (channel.shared/validate-channel-details HTTPDetails details)
  (try
    (channel/send! {:type :channel/http :details details} {})
    true
    (catch Exception e
      (let [data (ex-data e)]
        ;; throw an appropriate error if it's a connection error
        (if (= ::http/unexceptional-status (:type data))
          (throw (ex-info (tru "Failed to connect to channel") {:request-status (:status data)
                                                                :request-body   (maybe-parse-json (:body data))}))
          (throw e))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Alerts                                                ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- qp-result->raw-data
  [qp-result]
  (let [data (:data qp-result)]
    {:cols (map :name (:cols data))
     :rows (:rows data)}))

(mu/defmethod channel/render-notification [:channel/http :notification/card]
  [_channel-type {:keys [payload creator]} _handler]
  (let [{:keys [card notification_card card_part]} payload
        card_part                        (channel.shared/maybe-realize-data-rows card_part)
        request-body {:type               "alert"
                      ;; TODO: can we rename this???
                      :alert_id           (:id notification_card)
                      :alert_creator_id   (:id creator)
                      :alert_creator_name (:common_name creator)
                      :data               {:type          "question"
                                           :question_id   (:id card)
                                           :question_name (:name card)
                                           :question_url  (urls/card-url (:id card))
                                           :visualization (let [{:keys [card dashcard result]} card_part]
                                                            (channel.render/render-pulse-card-to-base64
                                                             (channel.render/defaulted-timezone card) card dashcard result image-width))
                                           :raw_data      (qp-result->raw-data (:result card_part))}
                      :sent_at            (t/offset-date-time)}]
    [{:body request-body}]))
