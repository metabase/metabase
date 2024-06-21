(ns metabase.channel.http
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [metabase.channel.core :as channel]
   [metabase.channel.shared :as channel.shared]
   [metabase.models.setting :as setting]
   [metabase.pulse.render :as render]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.urls :as urls]))

(def ^:private image-width
  "Maximum width of the rendered PNG of HTML to be sent to HTTP Content that exceeds this width (e.g. a table with
  many columns) is truncated."
  1200)

(def ^:private string-or-keyword
  [:or :string :keyword])

(setting/defsetting channel-http-url
  (deferred-tru "The endpoint for HTTP channel")
  :visibility :settings-manager)

(setting/defsetting channel-http-request-method
  (deferred-tru "The request method for HTTP channel")
  :visibility :settings-manager
  :type       :keyword
  :setter     (fn [value]
                (if (#{:get :post :put :delete} value)
                  (setting/set-value-of-type! :keyword :channel-http-request-method value)
                  (throw (IllegalArgumentException. "Invalid request method")))))


(setting/defsetting channel-http-auth-method
  (deferred-tru "Methods for authentication, Could be :none :header :query-params")
  :visibility :settings-manager
  :type       :keyword
  :setter     (fn [value]
                (if (#{:none :header :query-params} value)
                  (setting/set-value-of-type! :keyword :channel-http-auth-method value)
                  (throw (IllegalArgumentException. "Invalid authentication method")))))


(setting/defsetting channel-http-authentication-details
  (deferred-tru "The authentication details for HTTP channel")
  :visibility :settings-manager
  :type       :json)

(def ^:private HTTPPayLoad
  [:map
   [:url                           :string]
   [:method                        [:enum :get :post :put :delete]]
   [:query-params {:optional true} [:maybe [:map-of string-or-keyword string-or-keyword]]]
   [:headers      {:optional true} [:maybe [:map-of string-or-keyword string-or-keyword]]]
   [:body         {:optional true} :string]])

(mu/defmethod channel/send! :channel/http
  [_channel-type request :- HTTPPayLoad]
  (http/request (merge
                   {:accept :json
                    :content-type :json}
                   request)))

(defn- qp-result->raw-data
  [qp-result]
  (let [data (:data qp-result)]
    {:cols (map :name (:cols data))
     :rows (:rows data)}))

(mu/defmethod channel/render-notification [:channel/http :notification/alert] :- [:sequential HTTPPayLoad]
  [_channel-type {:keys [card pulse payload]} _recipients]
  (let [request-body {:question_id        (:id card)
                      :question_name      (:name card)
                      :question_url       (urls/card-url (:id card))
                      :alert_creator_id   (get-in pulse [:creator :id])
                      :alert_creator_name (get-in pulse [:creator :common_name])
                      :visualization      (let [{:keys [card dashcard result]} payload]
                                            (render/render-pulse-card-to-base64 (channel.shared/defaulted-timezone card) card dashcard result image-width))
                      :raw_data           (qp-result->raw-data (:result payload))}]
    [(merge (case (channel-http-auth-method)
              :none         {}
              :header       {:headers (channel-http-authentication-details)}
              :query-params {:query-params (channel-http-authentication-details)})
            {:url    (channel-http-url)
             :method (channel-http-request-method)
             :body   (json/generate-string request-body)})]))


(comment
 (channel-http-url! "https://hooks.zapier.com/hooks/catch/4226479/2ov5qsf/")
 (channel-http-request-method! :post)
 (channel-http-auth-method! :none)
 #_(channel/send! :channel/http {:method :get
                                 :url    "https://enhe8nkh8q3zi.x.pipedream.net"
                                 :query-params {:x 1}
                                 :headers {:x-metabase-channel true}}))
