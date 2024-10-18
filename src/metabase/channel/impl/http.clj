(ns metabase.channel.impl.http
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [java-time.api :as t]
   [metabase.channel.core :as channel]
   [metabase.channel.shared :as channel.shared]
   [metabase.pulse.render :as render]
   [metabase.util.i18n :refer [tru]]
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
             (cond-> request
               (= "request-body" auth-method) (update :body merge auth-info)
               (= "header" auth-method)       (update :headers merge auth-info)
               (= "query-param" auth-method)  (update :query-params merge auth-info)))]
    (http/request (cond-> req
                    (map? (:body req)) (update :body json/generate-string)))))

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
                                                                :request-body   (:body data)}))
          (throw e))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Alerts                                                ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- qp-result->raw-data
  [qp-result]
  (let [data (:data qp-result)]
    {:cols (map :name (:cols data))
     :rows (:rows data)}))

(mu/defmethod channel/render-notification [:channel/http :notification/alert]
  [_channel-type {:keys [card pulse payload]} _template _recipients]
  (let [request-body      {:type               "alert"
                           :alert_id           (:id pulse)
                           :alert_creator_id   (get-in pulse [:creator :id])
                           :alert_creator_name (get-in pulse [:creator :common_name])
                           :data               {:type          "question"
                                                :question_id   (:id card)
                                                :question_name (:name card)
                                                :question_url  (urls/card-url (:id card))
                                                :visualization (let [{:keys [card dashcard result]} payload]
                                                                 (render/render-pulse-card-to-base64
                                                                  (channel.shared/defaulted-timezone card) card dashcard result image-width))
                                                :raw_data      (qp-result->raw-data (:result payload))}
                           :sent_at            (t/offset-date-time)}]
    [{:body request-body}]))
