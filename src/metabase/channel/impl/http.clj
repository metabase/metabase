(ns metabase.channel.impl.http
  (:require
   [clj-http.client :as http]
   [java-time.api :as t]
   [metabase.channel.core :as channel]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.shared :as channel.shared]
   [metabase.channel.template.core :as channel.template]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.urls :as urls]))

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
  (let [req (merge
             {:accept       :json
              :content-type :json
              :method       :post
              :url          url}
             (when method
               {:method (keyword method)})
             (cond-> (update-keys request keyword)
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
        ;; throw an appriopriate error if it's a connection error
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

(def ^:private
  default-template {:type :email/handlebars-resource
                    :path "metabase/email/notification_card_http.hbs"})

(mu/defmethod channel/render-notification [:channel/http :notification/card]
  [_channel-type {:keys [payload] :as notification-payload} _template _recipients]
  (let [{:keys [card_part]} payload
        card_part                        (channel.shared/realize-data-rows card_part)
        notification-payload             (-> notification-payload
                                             (assoc-in [:payload :card_part] card_part)
                                             (assoc-in [:payload :card_part :visualization] (let [{:keys [card dashcard result]} card_part]
                                                                                              (channel.render/render-pulse-card-to-base64
                                                                                               (channel.render/defaulted-timezone card) card dashcard result image-width)))
                                             (assoc-in [:payload :card_part :raw_data] (qp-result->raw-data (:result card_part))))]
    [(->> notification-payload
          (channel.template/render (:path default-template))
          json/decode)]))
(comment
  (metabase.test/with-temp [:model/Channel {chn-id :id} {:type :channel/http}]
    (metabase.notification.test-util/with-card-notification
      [notification {:handlers [{:channel_type :channel/http}]}]
      (metabase.notification.core/send-notification! notification :notification/sync? true)
      notification)))
