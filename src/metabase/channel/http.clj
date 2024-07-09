(ns metabase.channel.http
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [metabase.channel.core :as channel]
   [metabase.channel.shared :as channel.shared]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private string-or-keyword
  [:or :string :keyword])

(def ^:private HTTPDetails
  [:map
   [:url                           ms/Url]
   [:auth-method                   [:enum  "none" "header" "query-param" "request-body"]]
   [:method       {:optional true} [:enum "get" "post" "put"]]
   [:query-params {:optional true} [:maybe [:map-of string-or-keyword :any]]]
   [:headers      {:optional true} [:maybe [:map-of string-or-keyword :any]]]
   [:body         {:optional true} :string]])

(mu/defmethod channel/send! :channel/http
  [{:keys [url method auth-method auth-info]} :- HTTPDetails
   request]
  (let [req (merge
             {:accept       :json
              :content-type :json
              :method       :post}
             {:url    url
              :method (keyword method)}
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
    (channel/send! (merge {:type :channel/http} details) {})
    true
    (catch Exception e
      (let [data (ex-data e)]
        ;; throw an appriopriate error if it's a connection error
        (if (= ::http/unexceptional-status (:type data))
          (throw (ex-info (tru "Failed to connect to channel") {:request-status (:status data)
                                                                :request-body  (:body data)}))
          (throw e))))))
